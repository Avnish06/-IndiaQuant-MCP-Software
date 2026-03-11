import db from '../db/database.js';
import { MarketDataEngine } from './marketData.js';

/**
 * Represents a position in the virtual portfolio.
 */
export interface Position {
  id: number;
  symbol: string;
  qty: number;
  avgPrice: number;
  side: string;
  stopLoss?: number;
  target?: number;
  status: 'OPEN' | 'CLOSED';
  closePrice?: number;
  currentPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  riskScore?: number;
}

/**
 * Manager for virtual portfolio persistence, trade execution, and risk tracking.
 */
export class PortfolioManager {
  private marketData: MarketDataEngine;
  private riskCache: Map<string, { score: number, timestamp: number }> = new Map();
  private RISK_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.marketData = new MarketDataEngine();
  }

  /**
   * Places a virtual trade and updates the portfolio balance.
   * @param symbol Stock symbol
   * @param qty Quantity
   * @param side 'BUY' or 'SELL'
   * @param stopLoss Optional stop loss price
   * @param target Optional target price
   * @returns Trade status and new balance
   */
  async placeTrade(symbol: string, qty: number, side: 'BUY' | 'SELL', stopLoss?: number, target?: number): Promise<any> {
    const liveData = await this.marketData.getLivePrice(symbol);
    const price = liveData.price;

    const row = db.prepare('SELECT cash_balance FROM portfolio_summary WHERE id = 1').get() as { cash_balance: number };
    const totalCost = qty * price;

    if (side === 'BUY' && row.cash_balance < totalCost) {
      throw new Error('Insufficient funds');
    }

    const newBalance = side === 'BUY' ? row.cash_balance - totalCost : row.cash_balance + totalCost;

    let orderId: number | bigint = 0;
    const transaction = db.transaction(() => {
      const result = db.prepare('INSERT INTO positions (symbol, qty, avg_price, side, stop_loss, target) VALUES (?, ?, ?, ?, ?, ?)').run(symbol, qty, price, side, stopLoss || null, target || null);
      orderId = result.lastInsertRowid;
      db.prepare('UPDATE portfolio_summary SET cash_balance = ? WHERE id = 1').run(newBalance);
    });

    transaction();

    return {
      status: 'SUCCESS',
      order_id: orderId,
      symbol,
      qty,
      side,
      price,
      newBalance,
    };
  }

  /**
   * Calculates a risk score (0-10) based on 30-day historical volatility.
   * @param symbol Stock symbol
   * @returns Risk score
   */
  private async calculateRiskScore(symbol: string): Promise<number> {
    const cached = this.riskCache.get(symbol);
    if (cached && (Date.now() - cached.timestamp < this.RISK_CACHE_TTL)) {
      return cached.score;
    }

    try {
      const historicalData = await this.marketData.getHistoricalData(symbol, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
      if (historicalData.length < 2) return 5;

      const returns = [];
      for (let i = 1; i < historicalData.length; i++) {
        returns.push((historicalData[i].close - historicalData[i - 1].close) / historicalData[i - 1].close);
      }
      
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const stdDev = Math.sqrt(returns.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / returns.length);
      const annualVolatility = stdDev * Math.sqrt(252);
      const score = Math.min(10, Math.max(0, annualVolatility * 20)); // Scale to 0-10

      this.riskCache.set(symbol, { score, timestamp: Date.now() });
      return score;
    } catch (e) {
      console.error(`Error calculating risk score for ${symbol}:`, e);
      return 5; // Default middle risk if calculation fails
    }
  }

  /**
   * Generates a real-time P&L report for the entire portfolio.
   * Automatically executes stop-loss and target orders during price checks.
   * @returns Portfolio summary and position details
   */
  async getPortfolioPnL(): Promise<any> {
    const positions = db.prepare('SELECT * FROM positions WHERE status = "OPEN"').all() as any[];
    const summary = db.prepare('SELECT cash_balance FROM portfolio_summary WHERE id = 1').get() as { cash_balance: number };

    let totalMarketValue = 0;
    const positionDetails: Position[] = [];

    for (const pos of positions) {
      try {
        const livePrice = await this.marketData.getLivePrice(pos.symbol);
        const currentPrice = livePrice.price;
        
        // Auto Stop-Loss and Target Management
        let shouldClose = false;
        if (pos.side === 'BUY') {
          if (pos.stop_loss && currentPrice <= pos.stop_loss) shouldClose = true;
          if (pos.target && currentPrice >= pos.target) shouldClose = true;
        } else {
          if (pos.stop_loss && currentPrice >= pos.stop_loss) shouldClose = true;
          if (pos.target && currentPrice <= pos.target) shouldClose = true;
        }

        if (shouldClose) {
          // const finalPnl = (currentPrice - pos.avg_price) * pos.qty * (pos.side === 'BUY' ? 1 : -1); // This was not used
          // const newBalance = summary.cash_balance + (currentPrice * pos.qty); // Simplified: sell all at current price
          
          db.transaction(() => {
            db.prepare('UPDATE positions SET status = "CLOSED", close_price = ? WHERE id = ?').run(currentPrice, pos.id);
            db.prepare('UPDATE portfolio_summary SET cash_balance = cash_balance + ? WHERE id = 1').run(currentPrice * pos.qty);
          })();

          console.error(`Position ${pos.id} (${pos.symbol}) closed via SL/Target at ${currentPrice}`);
          continue; // Don't add to open positions list
        }

        const pnl = (currentPrice - pos.avg_price) * pos.qty * (pos.side === 'BUY' ? 1 : -1);
        const pnlPercent = (pnl / (pos.avg_price * pos.qty)) * 100;
        
        // Calculate risk score based on historical volatility
        const riskScore = await this.calculateRiskScore(pos.symbol);

        totalMarketValue += currentPrice * pos.qty;
        
        positionDetails.push({
          id: pos.id,
          symbol: pos.symbol,
          qty: pos.qty,
          avgPrice: pos.avg_price,
          side: pos.side,
          stopLoss: pos.stop_loss,
          target: pos.target,
          status: pos.status,
          currentPrice,
          pnl,
          pnlPercent,
          riskScore,
        });
      } catch (e: any) {
        console.error(`Error updating position for ${pos.symbol}:`, e instanceof Error ? e.message : String(e));
      }
    }

    // const totalPnL = positionDetails.reduce((sum, p) => sum + (p.pnl || 0), 0); // Removed as per instruction

    return {
      cashBalance: summary.cash_balance,
      totalMarketValue,
      totalPortfolioValue: summary.cash_balance + totalMarketValue,
      positions: positionDetails,
    };
  }
}
