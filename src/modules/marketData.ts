import yahooFinance from 'yahoo-finance2';

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

export class MarketDataEngine {
  /**
   * Formats the symbol for Yahoo Finance (adds .NS for Indian stocks if not present)
   */
  private formatSymbol(symbol: string): string {
    const s = symbol.toUpperCase();
    if (s.startsWith('^')) return s; // Indices like ^NSEI, ^NSEBANK
    if (s.endsWith('.NS') || s.endsWith('.BO')) return s;
    return `${s}.NS`; // Default to NSE
  }

  async getLivePrice(symbol: string): Promise<LivePrice> {
    const formattedSymbol = this.formatSymbol(symbol);
    try {
      const result = await yahooFinance.quote(formattedSymbol);
      if (!result) throw new Error(`No data found for symbol: ${symbol}`);

      return {
        symbol: result.symbol,
        price: result.regularMarketPrice || 0,
        change: result.regularMarketChange || 0,
        changePercent: result.regularMarketChangePercent || 0,
        volume: result.regularMarketVolume || 0,
        lastUpdated: result.regularMarketTime || new Date(),
      };
    } catch (error: any) {
      console.error(`Error fetching live price for ${symbol}:`, error.message);
      throw error;
    }
  }

  async getHistoricalData(symbol: string, period1: string | number | Date, period2?: string | number | Date): Promise<OHLCData[]> {
    const formattedSymbol = this.formatSymbol(symbol);
    try {
      const result = await yahooFinance.historical(formattedSymbol, {
        period1: period1,
        period2: period2 || new Date(),
        interval: '1d',
      });

      return result.map((item) => ({
        date: item.date,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume,
      }));
    } catch (error: any) {
      console.error(`Error fetching historical data for ${symbol}:`, error.message);
      throw error;
    }
  }

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
}
