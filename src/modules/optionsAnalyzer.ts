import yahooFinance from 'yahoo-finance2';
import { BlackScholes } from '../utils/blackScholes.js';

export interface OptionContract {
  strike: number;
  type: 'call' | 'put';
  price: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  greeks?: {
    delta: number;
    gamma: number;
    vega: number;
    theta: number;
  };
}

export interface OptionsChain {
  symbol: string;
  expiry: Date;
  underlyingPrice: number;
  calls: OptionContract[];
  puts: OptionContract[];
  maxPain: number;
}

/**
 * Analyzer for options chain data, Greeks calculation, and unusual activity detection.
 */
export class OptionsAnalyzer {
  /**
   * Formats the symbol for Yahoo Finance compatibility.
   * @param symbol Raw stock symbol
   * @returns Formatted symbol
   */
  private formatSymbol(symbol: string): string {
    const s = symbol.toUpperCase();
    if (s.startsWith('^')) return s;
    if (s.endsWith('.NS') || s.endsWith('.BO')) return s;
    return `${s}.NS`;
  }

  /**
   * Fetches and parses the options chain for a given symbol and expiry.
   * Implements custom Max Pain calculation.
   * @param symbol Stock symbol
   * @param expiry Optional expiry date (YYYY-MM-DD)
   * @returns Parsed options chain with strikes and OI
   */
  async getOptionsChain(symbol: string, expiry?: string | Date): Promise<OptionsChain> {
    const formattedSymbol = this.formatSymbol(symbol);
    try {
      const result = (await yahooFinance.options(formattedSymbol, {
        date: expiry,
      })) as any;

      if (!result || !result.options || result.options.length === 0) {
        throw new Error(`No options data found for ${symbol}`);
      }

      const underlyingPrice = result.quote?.regularMarketPrice || 0;
      const optionSet = result.options[0];
      
      const calls: OptionContract[] = (optionSet.calls as any[]).map(c => ({
        strike: c.strike,
        type: 'call',
        price: c.lastPrice,
        bid: c.bid || 0,
        ask: c.ask || 0,
        volume: c.volume || 0,
        openInterest: c.openInterest || 0,
        impliedVolatility: c.impliedVolatility || 0,
      }));

      const puts: OptionContract[] = (optionSet.puts as any[]).map(p => ({
        strike: p.strike,
        type: 'put',
        price: p.lastPrice,
        bid: p.bid || 0,
        ask: p.ask || 0,
        volume: p.volume || 0,
        openInterest: p.openInterest || 0,
        impliedVolatility: p.impliedVolatility || 0,
      }));

      const maxPain = this.calculateMaxPain(calls, puts);

      return {
        symbol,
        expiry: optionSet.expirationDate ? new Date(optionSet.expirationDate) : new Date(),
        underlyingPrice,
        calls,
        puts,
        maxPain,
      };
    } catch (error: any) {
      console.error(`Error fetching options chain for ${symbol}:`, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Calculates the Max Pain point for an options chain.
   * The strike where option buyers lose the most (and sellers gain most).
   * @param calls List of call contracts
   * @param puts List of put contracts
   * @returns The Max Pain strike price
   */
  private calculateMaxPain(calls: OptionContract[], puts: OptionContract[]): number {
    const strikes = Array.from(new Set([...calls.map(c => c.strike), ...puts.map(p => p.strike)])).sort((a, b) => a - b);
    
    let minLoss = Infinity;
    let maxPainStrike = strikes[0];

    for (const strike of strikes) {
      let totalLoss = 0;

      for (const call of calls) {
        if (strike > call.strike) {
          totalLoss += (strike - call.strike) * call.openInterest;
        }
      }

      for (const put of puts) {
        if (strike < put.strike) {
          totalLoss += (put.strike - strike) * put.openInterest;
        }
      }

      if (totalLoss < minLoss) {
        minLoss = totalLoss;
        maxPainStrike = strike;
      }
    }

    return maxPainStrike;
  }

  /**
   * Calculates Black-Scholes Greeks for a specific option contract.
   * @param symbol Stock symbol
   * @param strike Strike price
   * @param type 'call' or 'put'
   * @param expiry Expiry date
   * @returns Object containing Delta, Gamma, Theta, Vega
   */
  async calculateGreeks(symbol: string, strike: number, type: 'call' | 'put', expiry: string | Date): Promise<any> {
    const chain = await this.getOptionsChain(symbol, expiry);
    const contracts = type === 'call' ? chain.calls : chain.puts;
    const contract = contracts.find(c => c.strike === strike);

    if (!contract) throw new Error(`Contract not found for strike ${strike}`);

    const now = new Date();
    const expiryDate = new Date(chain.expiry);
    const T = (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 365);
    const r = 0.07; 

    return BlackScholes.calculateGreeks(
      chain.underlyingPrice,
      strike,
      T,
      r,
      contract.impliedVolatility || 0.2,
      type
    );
  }

  /**
   * Detects abnormal options activity based on Volume vs Open Interest.
   * @param symbol Stock symbol
   * @returns List of contracts with unusual activity alerts
   */
  async detectUnusualActivity(symbol: string): Promise<any[]> {
    const chain = await this.getOptionsChain(symbol);
    const allOptions = [...chain.calls, ...chain.puts];
    
    const alerts = allOptions
      .filter(opt => opt.volume > opt.openInterest && opt.volume > 100)
      .map(opt => ({
        strike: opt.strike,
        type: opt.type,
        volume: opt.volume,
        openInterest: opt.openInterest,
        ratio: (opt.volume / (opt.openInterest || 1)).toFixed(2),
        alert: 'High Volume to OI Ratio',
      }));

    return alerts;
  }
}
