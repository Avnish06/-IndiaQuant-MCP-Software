import axios from 'axios';
import * as ti from 'technicalindicators';
import { MarketDataEngine } from './marketData';

export interface TradeSignal {
  symbol: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  technicals: {
    rsi: number;
    macd: { MACD: number; signal: number; histogram: number };
    bollinger: { upper: number; middle: number; lower: number };
  };
  sentiment: {
    score: number;
    headlines: string[];
  };
}

export class SignalGenerator {
  private marketData: MarketDataEngine;
  private newsApiKey: string | undefined;

  constructor(newsApiKey?: string) {
    this.marketData = new MarketDataEngine();
    this.newsApiKey = newsApiKey || process.env.NEWS_API_KEY;
  }

  async generateSignal(symbol: string): Promise<TradeSignal> {
    const historicalData = await this.marketData.getHistoricalData(symbol, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)); // Last 30 days
    const prices = historicalData.map(d => d.close);

    // 1. Technical Indicators
    const rsi = ti.rsi({ values: prices, period: 14 }).pop() || 50;
    const macdResult = ti.macd({
      values: prices,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    }).pop() || { MACD: 0, signal: 0, histogram: 0 };

    const bbResult = ti.bollingerbands({
      values: prices,
      period: 20,
      stdDev: 2,
    }).pop() || { upper: 0, middle: 0, lower: 0 };

    // 2. Sentiment Analysis
    const sentiment = await this.analyzeSentiment(symbol);

    // 3. Logic for Signal
    let score = 0;
    
    // RSI logic
    if (rsi < 30) score += 30; // Oversold (Bullish)
    else if (rsi > 70) score -= 30; // Overbought (Bearish)

    // MACD logic
    if (macdResult && (macdResult as any).histogram !== undefined && (macdResult as any).histogram > 0) score += 20;
    else score -= 20;

    // Sentiment logic
    score += sentiment.score * 50; // Sentiment score is between -1 and 1

    // Determine signal
    let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    if (score > 40) signal = 'BUY';
    else if (score < -40) signal = 'SELL';

    const confidence = Math.min(Math.abs(score), 100);

    return {
      symbol,
      signal,
      confidence,
      technicals: {
        rsi,
        macd: {
          MACD: macdResult.MACD || 0,
          signal: macdResult.signal || 0,
          histogram: macdResult.histogram || 0
        },
        bollinger: {
          upper: bbResult.upper || 0,
          middle: bbResult.middle || 0,
          lower: bbResult.lower || 0
        },
      },
      sentiment,
    };
  }

  async analyzeSentiment(symbol: string): Promise<{ score: number; headlines: string[] }> {
    if (!this.newsApiKey || this.newsApiKey === 'your_news_api_key_here') {
      return { score: 0, headlines: ['NewsAPI key not configured'] };
    }

    try {
      const query = symbol.split('.')[0];
      const response = await axios.get(`https://newsapi.org/v2/everything`, {
        params: {
          q: query,
          apiKey: this.newsApiKey,
          language: 'en',
          sortBy: 'publishedAt',
          pageSize: 5,
        },
      });

      const articles = response.data.articles || [];
      const headlines = articles.map((a: any) => a.title);

      // Simple keyword-based sentiment analysis
      let score = 0;
      const positiveWords = ['buy', 'growth', 'profit', 'surge', 'bull', 'up', 'high', 'win'];
      const negativeWords = ['sell', 'loss', 'drop', 'bear', 'down', 'low', 'fail', 'crash'];

      headlines.forEach((h: string) => {
        const words = h.toLowerCase().split(' ');
        words.forEach(w => {
          if (positiveWords.includes(w)) score += 0.1;
          if (negativeWords.includes(w)) score -= 0.1;
        });
      });

      return {
        score: Math.max(-1, Math.min(1, score)),
        headlines,
      };
    } catch (error: any) {
      console.error(`Error fetching news for ${symbol}:`, error.message);
      return { score: 0, headlines: [] };
    }
  }
}
