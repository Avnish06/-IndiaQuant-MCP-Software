import yahooFinance from 'yahoo-finance2';
import axios from 'axios';

export interface LivePrice {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  lastUpdated: Date;
}

export interface OHLCData {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Engine for fetching and caching real-time and historical market data for NSE/BSE.
 */
export class MarketDataEngine {
  private priceCache: Map<string, { price: LivePrice, timestamp: number }> = new Map();
  private CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private alphaVantageKey: string | undefined;

  constructor() {
    this.alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;
  }
  /**
   * Formats the symbol for Yahoo Finance (adds .NS for Indian stocks if not present)
   */
  /**
   * Formats the symbol for Yahoo Finance compatibility.
   * Appends .NS for NSE stocks unless already formatted or an index.
   * @param symbol Raw stock symbol (e.g., RELIANCE)
   * @returns Formatted symbol (e.g., RELIANCE.NS)
   */
  private formatSymbol(symbol: string): string {
    const s = symbol.toUpperCase();
    if (s.startsWith('^')) return s; // Indices like ^NSEI, ^NSEBANK
    if (s.endsWith('.NS') || s.endsWith('.BO')) return s;
    return `${s}.NS`; // Default to NSE
  }

  /**
   * Fetches the latest live price and market stats for a given symbol.
   * Includes a 5-minute TTL cache to stay within API rate limits.
   * @param symbol Stock symbol
   * @returns Live price data
   */
  async getLivePrice(symbol: string): Promise<LivePrice> {
    const formattedSymbol = this.formatSymbol(symbol);
    
    // Check cache
    const cached = this.priceCache.get(formattedSymbol);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      console.error(`Using cached price for ${symbol}`);
      return cached.price;
    }

    console.error(`Fetching live price for symbol: ${symbol}`);
    try {
      let result: any = await yahooFinance.quote(formattedSymbol);
      if (Array.isArray(result)) result = result[0];
      
      if (!result) throw new Error(`No data found for symbol: ${symbol}`);

      const data: LivePrice = {
        symbol: result?.symbol,
        price: result?.regularMarketPrice || 0,
        change: result?.regularMarketChange || 0,
        changePercent: result?.regularMarketChangePercent || 0,
        volume: result?.regularMarketVolume || 0,
        lastUpdated: result?.regularMarketTime || new Date(),
      };

      // Update cache
      this.priceCache.set(formattedSymbol, { price: data, timestamp: Date.now() });

      return data;
    } catch (error: any) {
      console.error(`Error fetching live price for ${symbol}:`, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Retrieves historical OHLC data for a given period.
   * @param symbol Stock symbol
   * @param period1 Start date
   * @param period2 End date (defaults to now)
   * @returns Array of daily OHLC candles
   */
  async getHistoricalData(symbol: string, period1: string | number | Date, period2?: string | number | Date): Promise<OHLCData[]> {
    const formattedSymbol = this.formatSymbol(symbol);
    try {
      const result: any = await yahooFinance.historical(formattedSymbol, {
        period1: period1,
        period2: period2 || new Date(),
        interval: '1d',
      });

      return result.map((item: any) => ({
        date: item.date,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume,
      }));
    } catch (error: any) {
      console.error(`Error fetching historical data for ${symbol}:`, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Generates a performance heatmap for major NSE sectors.
   * @returns Array of sectors with their current percentage change
   */
  async getSectorHeatmap(): Promise<any> {
    // Sector indices on NSE
    const sectors = {
      'Nifty 50': '^NSEI',
      'Bank Nifty': '^NSEBANK',
      'Nifty IT': '^CNXIT',
      'Nifty Pharma': '^CNXPHARMA',
      'Nifty FMCG': '^CNXFMCG',
      'Nifty Metal': '^CNXMETAL',
      'Nifty Auto': '^CNXAUTO',
      'Nifty Realty': '^CNXREALTY',
    };

    const results = await Promise.all(
      Object.entries(sectors).map(async ([name, symbol]) => {
        try {
          const data = await this.getLivePrice(symbol);
          return { sector: name, changePercent: data.changePercent };
        } catch (e) {
          return { sector: name, changePercent: 0 };
        }
      })
    );

    return results;
  }

  /**
   * Scans a predefined list of stocks for specific technical criteria (e.g., RSI).
   * @param criteria Filter criteria (rsiBelow, rsiAbove)
   * @returns List of matching stocks
   */
  async scanMarket(criteria: { sector?: string, rsiBelow?: number, rsiAbove?: number }): Promise<any[]> {
    // For demonstration, we'll scan a fixed list of Nifty 50 stocks
    // In a real app, this would be a much larger list
    const symbols = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'HUL', 'SBI', 'BHARTIARTL', 'LICI', 'ITC'];
    
    const results = [];
    const ti = await import('technicalindicators');

    for (const symbol of symbols) {
      try {
        const hist = await this.getHistoricalData(symbol, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
        const prices = hist.map(h => h.close);
        const rsi = ti.rsi({ values: prices, period: 14 }).pop() || 50;

        let match = true;
        if (criteria.rsiBelow && rsi >= criteria.rsiBelow) match = false;
        if (criteria.rsiAbove && rsi <= criteria.rsiAbove) match = false;

        if (match) {
          const live = await this.getLivePrice(symbol);
          results.push({
            symbol,
            price: live.price,
            rsi: rsi.toFixed(2),
          });
        }
      } catch (e) {
        console.error(`Error scanning ${symbol}`);
      }
    }

    return results;
  }

  /**
   * Fetches macroeconomic indicators from Alpha Vantage.
   * Requires ALPHA_VANTAGE_API_KEY environment variable.
   * @returns Object containing Inflation and GDP data
   */
  async getMacroIndicators(): Promise<any> {
    if (!this.alphaVantageKey) {
      throw new Error('Alpha Vantage API key not configured');
    }

    try {
      const inflation = await axios.get(`https://www.alphavantage.co/query`, {
        params: { function: 'INFLATION', apikey: this.alphaVantageKey }
      });
      const gdp = await axios.get(`https://www.alphavantage.co/query`, {
        params: { function: 'REAL_GDP', apikey: this.alphaVantageKey }
      });

      return {
        inflation: inflation.data.data?.[0],
        gdp: gdp.data.data?.[0],
      };
    } catch (e: any) {
      console.error('Error fetching macro indicators:', e.message);
      throw e;
    }
  }
}
