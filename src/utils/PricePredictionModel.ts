// ============================================================
// PricePredictionModel.ts — 价格预测模型
// 基于历史数据的简单预测算法，用于 AI 辅助决策
// 可预测地产升值潜力、股票走势、CPI 趋势
// ============================================================

export interface PredictionResult {
  predicted: number;
  confidence: number;
  lowerBound: number;
  upperBound: number;
  trend: 'up' | 'down' | 'stable';
  method: string;
}

export class PricePredictionModel {
  /** 简单移动平均预测 */
  predictSMA(history: number[], window: number = 5): PredictionResult {
    if (history.length < window) {
      const last = history[history.length - 1] ?? 0;
      return { predicted: last, confidence: 0, lowerBound: last, upperBound: last, trend: 'stable', method: 'SMA' };
    }

    const windowSlice = history.slice(-window);
    const avg = windowSlice.reduce((a, b) => a + b, 0) / window;

    // 计算标准差作为置信区间
    const variance = windowSlice.reduce((s, v) => s + (v - avg) ** 2, 0) / window;
    const stdDev = Math.sqrt(variance);

    const last = history[history.length - 1];
    const trend = avg > last ? 'up' : avg < last ? 'down' : 'stable';
    const confidence = Math.min(1, Math.abs(avg - last) / (stdDev + 1));

    return {
      predicted: avg,
      confidence,
      lowerBound: avg - stdDev,
      upperBound: avg + stdDev,
      trend,
      method: 'SMA',
    };
  }

  /** 指数加权移动平均预测 */
  predictEMA(history: number[], alpha: number = 0.3): PredictionResult {
    if (history.length < 2) {
      const last = history[0] ?? 0;
      return { predicted: last, confidence: 0, lowerBound: last, upperBound: last, trend: 'stable', method: 'EMA' };
    }

    let ema = history[0];
    for (let i = 1; i < history.length; i++) {
      ema = alpha * history[i] + (1 - alpha) * ema;
    }

    const last = history[history.length - 1];
    const trend = ema > last ? 'up' : ema < last ? 'down' : 'stable';
    const confidence = Math.min(1, Math.abs(ema - last) / (last + 1));

    return {
      predicted: ema,
      confidence,
      lowerBound: ema * 0.9,
      upperBound: ema * 1.1,
      trend,
      method: 'EMA',
    };
  }

  /** 线性回归预测 */
  predictLinear(history: number[], forecastSteps: number = 3): PredictionResult {
    if (history.length < 3) {
      const last = history[history.length - 1] ?? 0;
      return { predicted: last, confidence: 0, lowerBound: last, upperBound: last, trend: 'stable', method: 'Linear' };
    }

    const n = history.length;
    const xSum = (n * (n - 1)) / 2;
    const ySum = history.reduce((a, b) => a + b, 0);
    const xySum = history.reduce((s, y, x) => s + x * y, 0);
    const x2Sum = history.reduce((s, _, x) => s + x * x, 0);

    const slope = (n * xySum - xSum * ySum) / (n * x2Sum - xSum * xSum);
    const intercept = (ySum - slope * xSum) / n;

    const predicted = intercept + slope * (n + forecastSteps - 1);
    const last = history[history.length - 1];
    const trend = slope > 0.01 ? 'up' : slope < -0.01 ? 'down' : 'stable';

    // R-squared 近似作为置信度
    const yAvg = ySum / n;
    const ssRes = history.reduce((s, y, x) => s + (y - (slope * x + intercept)) ** 2, 0);
    const ssTot = history.reduce((s, y) => s + (y - yAvg) ** 2, 0);
    const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    return {
      predicted: Math.max(0, predicted),
      confidence: Math.max(0, Math.min(1, rSquared)),
      lowerBound: Math.max(0, predicted * (1 - 1 / Math.max(1, n))),
      upperBound: predicted * (1 + 1 / Math.max(1, n)),
      trend,
      method: 'Linear',
    };
  }

  /** 综合预测（多模型加权） */
  predictEnsemble(history: number[]): PredictionResult {
    const sma = this.predictSMA(history, 5);
    const ema = this.predictEMA(history);
    const linear = this.predictLinear(history);

    // 权重分配
    const smaW = 0.3, emaW = 0.3, linearW = 0.4;

    const predicted = sma.predicted * smaW + ema.predicted * emaW + linear.predicted * linearW;
    const confidence = (sma.confidence + ema.confidence + linear.confidence) / 3;

    // 趋势投票
    const trends = [sma.trend, ema.trend, linear.trend];
    const upCount = trends.filter(t => t === 'up').length;
    const downCount = trends.filter(t => t === 'down').length;
    const trend = upCount > downCount ? 'up' : downCount > upCount ? 'down' : 'stable';

    return {
      predicted,
      confidence,
      lowerBound: Math.min(sma.lowerBound, ema.lowerBound, linear.lowerBound),
      upperBound: Math.max(sma.upperBound, ema.upperBound, linear.upperBound),
      trend,
      method: 'Ensemble',
    };
  }

  /** 地产升值潜力评估 */
  evaluatePropertyPotential(
    basePrice: number,
    upgradeLevel: number,
    maxLevel: number,
    trafficCount: number,
    sameColorOwned: number,
    totalSameColor: number,
  ): { score: number; recommendation: string; expectedRent: number } {
    // 交通流量得分
    const trafficScore = Math.min(1, trafficCount / 100);

    // 升级潜力得分
    const upgradePotential = (maxLevel - upgradeLevel) / maxLevel;

    // 垄断接近度
    const monopolyCloseness = sameColorOwned / totalSameColor;

    // 综合评分
    const score = trafficScore * 0.4 + upgradePotential * 0.3 + monopolyCloseness * 0.3;

    let recommendation: string;
    if (score > 0.8) recommendation = '强烈推荐购买';
    else if (score > 0.6) recommendation = '推荐购买';
    else if (score > 0.4) recommendation = '可以考虑';
    else if (score > 0.2) recommendation = '不太推荐';
    else recommendation = '不建议购买';

    // 预期过路费
    const baseRent = basePrice * 0.1 * (1 + upgradeLevel * 0.5);
    const monopolyBonus = monopolyCloseness >= 1 ? 2 : 1;
    const expectedRent = Math.floor(baseRent * monopolyBonus * (1 + trafficScore));

    return { score, recommendation, expectedRent };
  }

  /** CPI 趋势预测 */
  predictCPI(cpiHistory: number[]): { direction: string; magnitude: number; forecast: number; warning: string } {
    if (cpiHistory.length < 3) {
      return { direction: '稳定', magnitude: 0, forecast: cpiHistory[0] ?? 100, warning: '数据不足' };
    }

    const result = this.predictLinear(cpiHistory);
    const change = result.predicted - cpiHistory[cpiHistory.length - 1];

    let direction: string;
    if (change > 2) direction = '快速上涨';
    else if (change > 0.5) direction = '缓慢上涨';
    else if (change > -0.5) direction = '稳定';
    else if (change > -2) direction = '缓慢下降';
    else direction = '快速下降';

    let warning = '';
    if (change > 5) warning = '⚠️ 警惕恶性通货膨胀！过路费将大幅增加';
    else if (change > 2) warning = '📈 CPI 即将上涨，考虑提高地产租金';
    else if (change < -5) warning = '📉 通缩风险，持有现金更有利';
    else warning = '经济形势稳定';

    return {
      direction,
      magnitude: Math.abs(change),
      forecast: result.predicted,
      warning,
    };
  }
}

export const priceModel = new PricePredictionModel();
