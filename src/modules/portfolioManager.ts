import db from '../db/database';
import { MarketDataEngine } from './marketData';

export interface Position {
  id: number;
  symbol: string;
  qty: number;
  avgPrice: number;
  side: string;
  currentPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  riskScore?: number;
}

export class PortfolioManager {
  private marketData: MarketDataEngine;

  constructor() {
    this.marketData = new MarketDataEngine();
  }

  async placeTrade(symbol: string, qty: number, side: 'BUY' | 'SELL'): Promise<any> {
    const liveData = await this.marketData.getLivePrice(symbol);
    const price = liveData.price;

    const row = db.prepare('SELECT cash_balance FROM portfolio_summary WHERE id = 1').get() as { cash_balance: number };
    const totalCost = qty * price;

    if (side === 'BUY' && row.cash_balance < totalCost) {
      throw new Error(`Insufficient funds. Required: ${totalCost}, Available: ${row.cash_balance}`);
    }

    const newBalance = side === 'BUY' ? row.cash_balance - totalCost : row.cash_balance + totalCost;

    const transaction = db.transaction(() => {
      db.prepare('INSERT INTO positions (symbol, qty, avg_price, side) VALUES (?, ?, ?, ?)').run(symbol, qty, price, side);
      db.prepare('UPDATE portfolio_summary SET cash_balance = ? WHERE id = 1').run(newBalance);
    });

    transaction();

    return {
      status: 'SUCCESS',
      symbol,
      qty,
      side,
      price,
      newBalance,
    };
  }

  async getPortfolioPnL(): Promise<any> {
    const positions = db.prepare('SELECT * FROM positions').all() as any[];
    const summary = db.prepare('SELECT cash_balance FROM portfolio_summary WHERE id = 1').get() as { cash_balance: number };

    let totalMarketValue = 0;
    const positionDetails: Position[] = [];

    for (const pos of positions) {
      try {
        const livePrice = await this.marketData.getLivePrice(pos.symbol);
        const currentPrice = livePrice.price;
        const pnl = (currentPrice - pos.avg_price) * pos.qty * (pos.side === 'BUY' ? 1 : -1);
        const pnlPercent = (pnl / (pos.avg_price * pos.qty)) * 100;
        
        // Simple risk score based on volatility proxy (using daily change as a simple proxy for now)
        const riskScore = Math.min(10, Math.abs(livePrice.changePercent) * 2);

        totalMarketValue += currentPrice * pos.qty;
        
        positionDetails.push({
          id: pos.id,
          symbol: pos.symbol,
          qty: pos.qty,
          avgPrice: pos.avg_price,
          side: pos.side,
          currentPrice,
          pnl,
          pnlPercent,
          riskScore,
        });
      } catch (e) {
        console.error(`Error updating position for ${pos.symbol}`);
      }
    }

    const totalPnL = positionDetails.reduce((sum, p) => sum + (p.pnl || 0), 0);

    return {
      positions: positionDetails,
      cashBalance: summary.cash_balance,
      totalMarketValue,
      totalPnL,
      portfolioValue: summary.cash_balance + totalMarketValue,
    };
  }
}
