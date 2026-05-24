// ============================================================
// StockSystem.ts — 股票交易系统
// 价格曲线（随机游走+均值回归）、做多/做空、持仓管理
// ============================================================

import type { RandomGenerator } from '../core/RandomGenerator';
import { state, type StockEntry, type StockHolding } from '../core/StateManager';
import { bus } from '../core/EventBus';
import type { Player } from '../entities/Player';

export class StockSystem {
  private rng: RandomGenerator;

  constructor(rng: RandomGenerator) {
    this.rng = rng;
  }

  /** 初始化股票市场 */
  initMarket(): void {
    const stockDefs = [
      { id: 'STK_01', name: '帝都地产', symbol: 'BJPROP', basePrice: 500, volatility: 0.03, trend: 0.001 },
      { id: 'STK_02', name: '未来科技', symbol: 'FUTECH', basePrice: 800, volatility: 0.05, trend: 0.002 },
      { id: 'STK_03', name: '环球银行', symbol: 'GLBANK', basePrice: 600, volatility: 0.02, trend: 0.000 },
      { id: 'STK_04', name: '天空航空', symbol: 'SKYAIR', basePrice: 400, volatility: 0.04, trend: 0.001 },
      { id: 'STK_05', name: '地下矿业', symbol: 'UNDMIN', basePrice: 350, volatility: 0.06, trend: -0.001 },
      { id: 'STK_06', name: '新能源', symbol: 'NEWNRG', basePrice: 700, volatility: 0.05, trend: 0.003 },
      { id: 'STK_07', name: '超级赌场', symbol: 'SUPCAS', basePrice: 550, volatility: 0.07, trend: 0.000 },
      { id: 'STK_08', name: 'AI集团', symbol: 'AIGROP', basePrice: 1000, volatility: 0.06, trend: 0.004 },
    ];

    for (const def of stockDefs) {
      const entry: StockEntry = {
        id: def.id,
        name: def.name,
        symbol: def.symbol,
        price: def.basePrice,
        history: [def.basePrice],
        volatility: def.volatility,
        trend: def.trend,
      };
      state.stocks.set(def.id, entry);
    }
  }

  /** 更新所有股票价格（每回合一次） */
  updatePrices(): void {
    for (const [, stock] of state.stocks) {
      const oldPrice = stock.price;

      // 均值回归 + 随机游走
      const meanPrice = stock.history.reduce((a, b) => a + b, 0) / stock.history.length;
      const meanReversion = (meanPrice - oldPrice) * 0.1;
      const randomWalk = this.rng.normal(0, oldPrice * stock.volatility);
      const trend = oldPrice * stock.trend;

      const newPrice = Math.max(10, Math.round(oldPrice + meanReversion + randomWalk + trend));
      const change = newPrice - oldPrice;

      stock.price = newPrice;
      stock.history.push(newPrice);
      if (stock.history.length > 100) stock.history.shift();

      bus.emit('stock.update', {
        stockId: stock.id,
        price: newPrice,
        change,
      });
    }
  }

  /** 获取股票价格 */
  getPrice(stockId: string): number {
    return state.stocks.get(stockId)?.price ?? 0;
  }

  /** 获取股票 */
  getStock(stockId: string): StockEntry | undefined {
    return state.stocks.get(stockId);
  }

  /** 获取所有股票 */
  getAllStocks(): StockEntry[] {
    return [...state.stocks.values()];
  }

  /** 买入股票（普通做多） */
  buyStock(player: Player, stockId: string, shares: number): { success: boolean; message: string } {
    const stock = state.stocks.get(stockId);
    if (!stock) return { success: false, message: '股票不存在' };

    const totalCost = stock.price * shares;
    if (!player.canAfford(totalCost)) {
      return { success: false, message: `资金不足，需要 $${totalCost}` };
    }

    player.cash -= totalCost;

    // 更新持仓
    const existing = player.stockPortfolio.find(
      h => h.stockId === stockId && h.type === 'long'
    );
    if (existing) {
      const totalShares = existing.shares + shares;
      existing.entryPrice = ((existing.entryPrice * existing.shares) + (stock.price * shares)) / totalShares;
      existing.shares = totalShares;
    } else {
      player.stockPortfolio.push({
        stockId,
        type: 'long',
        shares,
        entryPrice: stock.price,
      });
    }

    bus.emit('stock.trade', {
      playerId: player.id,
      stockId,
      type: 'buy',
      shares,
      price: stock.price,
    });

    return { success: true, message: `买入 ${shares} 股 ${stock.symbol}，总价 $${totalCost}` };
  }

  /** 卖出股票 */
  sellStock(player: Player, stockId: string, shares: number): { success: boolean; message: string } {
    const stock = state.stocks.get(stockId);
    if (!stock) return { success: false, message: '股票不存在' };

    const holding = player.stockPortfolio.find(
      h => h.stockId === stockId && h.type === 'long'
    );
    if (!holding || holding.shares < shares) {
      return { success: false, message: '持仓不足' };
    }

    const totalValue = stock.price * shares;
    const profit = totalValue - holding.entryPrice * shares;

    player.cash += totalValue;
    holding.shares -= shares;
    if (holding.shares <= 0) {
      player.stockPortfolio = player.stockPortfolio.filter(
        h => !(h.stockId === stockId && h.type === 'long')
      );
    }

    bus.emit('stock.trade', {
      playerId: player.id,
      stockId,
      type: 'sell',
      shares,
      price: stock.price,
    });

    return {
      success: true,
      message: `卖出 ${shares} 股 ${stock.symbol}，${profit >= 0 ? '盈利' : '亏损'} $${Math.abs(Math.floor(profit))}`,
    };
  }

  /** 做空 */
  shortStock(player: Player, stockId: string, shares: number): { success: boolean; message: string } {
    const stock = state.stocks.get(stockId);
    if (!stock) return { success: false, message: '股票不存在' };

    const margin = Math.floor(stock.price * shares * 0.5); // 50% 保证金
    if (!player.canAfford(margin)) {
      return { success: false, message: `保证金不足，需要 $${margin}` };
    }

    player.cash -= margin;

    const existing = player.stockPortfolio.find(
      h => h.stockId === stockId && h.type === 'short'
    );
    if (existing) {
      existing.shares += shares;
    } else {
      player.stockPortfolio.push({
        stockId,
        type: 'short',
        shares,
        entryPrice: stock.price,
      });
    }

    bus.emit('stock.trade', {
      playerId: player.id,
      stockId,
      type: 'short',
      shares,
      price: stock.price,
    });

    return { success: true, message: `做空 ${shares} 股 ${stock.symbol}，保证金 $${margin}` };
  }

  /** 平空仓 */
  coverShort(player: Player, stockId: string): { success: boolean; message: string; profit: number } {
    const stock = state.stocks.get(stockId);
    if (!stock) return { success: false, message: '股票不存在', profit: 0 };

    const holding = player.stockPortfolio.find(
      h => h.stockId === stockId && h.type === 'short'
    );
    if (!holding) return { success: false, message: '没有空仓', profit: 0 };

    // 做空利润 = (开仓价 - 当前价) × 股数
    const profit = (holding.entryPrice - stock.price) * holding.shares;
    const marginReturn = Math.floor(holding.entryPrice * holding.shares * 0.5);

    player.cash += marginReturn + Math.max(0, profit);
    if (profit < 0) {
      // 亏损从保证金扣
      player.cash -= Math.abs(profit);
    }

    player.stockPortfolio = player.stockPortfolio.filter(
      h => !(h.stockId === stockId && h.type === 'short')
    );

    return {
      success: true,
      message: `平仓 ${holding.shares} 股 ${stock.symbol}，${profit >= 0 ? '盈利' : '亏损'} $${Math.floor(Math.abs(profit))}`,
      profit: Math.floor(profit),
    };
  }

  /** 计算玩家持仓总值 */
  getPortfolioValue(player: Player): { longValue: number; shortValue: number; total: number } {
    let longValue = 0;
    let shortValue = 0;

    for (const h of player.stockPortfolio) {
      const stock = state.stocks.get(h.stockId);
      if (!stock) continue;

      if (h.type === 'long') {
        longValue += stock.price * h.shares;
      } else {
        const margin = h.entryPrice * h.shares * 0.5;
        const unrealized = (h.entryPrice - stock.price) * h.shares;
        shortValue += margin + unrealized;
      }
    }

    return { longValue, shortValue, total: longValue + shortValue };
  }

  /** 获取股票价格历史 */
  getPriceHistory(stockId: string, count: number = 20): number[] {
    const stock = state.stocks.get(stockId);
    if (!stock) return [];
    return stock.history.slice(-count);
  }

  /** 计算移动平均线 */
  getMovingAverage(stockId: string, period: number = 5): number {
    const stock = state.stocks.get(stockId);
    if (!stock || stock.history.length < period) return stock?.price ?? 0;
    const slice = stock.history.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }

  /** 计算布林带 */
  getBollingerBands(stockId: string, period: number = 10, multiplier: number = 2): { upper: number; middle: number; lower: number } {
    const stock = state.stocks.get(stockId);
    if (!stock || stock.history.length < period) {
      const p = stock?.price ?? 0;
      return { upper: p, middle: p, lower: p };
    }

    const slice = stock.history.slice(-period);
    const middle = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((s, v) => s + (v - middle) ** 2, 0) / slice.length;
    const stdDev = Math.sqrt(variance);

    return {
      upper: middle + multiplier * stdDev,
      middle,
      lower: Math.max(0, middle - multiplier * stdDev),
    };
  }

  /** 计算 RSI (相对强弱指标) */
  getRSI(stockId: string, period: number = 14): number {
    const stock = state.stocks.get(stockId);
    if (!stock || stock.history.length < period + 1) return 50;

    const slice = stock.history.slice(-(period + 1));
    let avgGain = 0, avgLoss = 0;

    for (let i = 1; i < slice.length; i++) {
      const diff = slice[i] - slice[i - 1];
      if (diff > 0) avgGain += diff;
      else avgLoss -= diff;
    }

    avgGain /= period;
    avgLoss /= period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /** 获取股票趋势信号 */
  getTrendSignal(stockId: string): { signal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell'; confidence: number } {
    const rsi = this.getRSI(stockId);
    const ma5 = this.getMovingAverage(stockId, 5);
    const ma10 = this.getMovingAverage(stockId, 10);
    const price = this.getPrice(stockId);

    let signal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell' = 'neutral';
    let score = 0;

    // RSI 信号
    if (rsi < 30) { signal = 'strong_buy'; score += 2; }
    else if (rsi < 40) { signal = 'buy'; score += 1; }
    else if (rsi > 70) { signal = 'strong_sell'; score -= 2; }
    else if (rsi > 60) { signal = 'sell'; score -= 1; }

    // 均线交叉信号
    if (ma5 > ma10 && price > ma5) { score += 1; }
    else if (ma5 < ma10 && price < ma5) { score -= 1; }

    // 综合判断
    if (score >= 2) signal = 'strong_buy';
    else if (score === 1) signal = 'buy';
    else if (score === 0) signal = 'neutral';
    else if (score === -1) signal = 'sell';
    else signal = 'strong_sell';

    return { signal, confidence: Math.abs(score) / 3 };
  }

  /** 市场整体行情 */
  getMarketSummary(): { totalValue: number; avgChange: number; advancing: number; declining: number; flat: number } {
    let totalValue = 0;
    let totalChange = 0;
    let advancing = 0, declining = 0, flat = 0;

    for (const [, stock] of state.stocks) {
      totalValue += stock.price;
      if (stock.history.length >= 2) {
        const change = stock.price - stock.history[stock.history.length - 2];
        totalChange += change;
        if (change > 0) advancing++;
        else if (change < 0) declining++;
        else flat++;
      }
    }

    return {
      totalValue,
      avgChange: state.stocks.size > 0 ? totalChange / state.stocks.size : 0,
      advancing, declining, flat,
    };
  }

  /** AI 股票推荐 */
  getAIRecommendation(): { stockId: string; action: 'buy' | 'sell' | 'hold'; reason: string } | null {
    let best: { stockId: string; action: 'buy' | 'sell' | 'hold'; reason: string } | null = null;
    let bestConfidence = 0;

    for (const [, stock] of state.stocks) {
      const { signal, confidence } = this.getTrendSignal(stock.id);
      if (confidence > bestConfidence) {
        const action = signal === 'strong_buy' || signal === 'buy' ? 'buy' :
                      signal === 'strong_sell' || signal === 'sell' ? 'sell' : 'hold';
        best = {
          stockId: stock.id,
          action,
          reason: `${stock.symbol}: ${signal} (置信度 ${(confidence * 100).toFixed(0)}%)`,
        };
        bestConfidence = confidence;
      }
    }

    return best;
  }
}
