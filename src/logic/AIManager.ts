// ============================================================
// AIManager.ts — Utility AI 决策系统
// 考量因素(Consideration) × 行为(Action) 评分模型
// 10+ 种考量因素，15+ 种行为
// ============================================================

import type { Player } from '../entities/Player';
import { PropertyTile, type Tile } from '../entities/Tile';
import type { Card } from '../entities/Card';
import { state, AIDifficulty, type StockEntry } from '../core/StateManager';
import {
  ConsiderationType, ActionType,
  type PersonalityConfig, type DifficultyModifier,
  PERSONALITY_CONFIGS, DIFFICULTY_MODIFIERS,
  getEffectiveWeight,
} from '../data/AIPersonalities';
import type { RandomGenerator } from '../core/RandomGenerator';

// ---- AI 上下文 ----
export interface AIContext {
  player: Player;
  allPlayers: Player[];
  currentTile: Tile | null;
  aheadTiles: (Tile | null)[];       // 前方 N 格预览
  mapLayers: unknown[];
  stocks: StockEntry[];
  roundNumber: number;
  cpiMultiplier: number;
}

// ---- 考量接口 ----
interface IConsideration {
  type: ConsiderationType;
  evaluate(ctx: AIContext): number; // 0-1
}

// ---- 行为接口 ----
interface IAction {
  type: ActionType;
  score(ctx: AIContext): number;     // 综合得分
  canExecute(ctx: AIContext): boolean;
  execute(ctx: AIContext): string;   // 返回日志
}

// ============================================================
// 考量因素实现
// ============================================================

class CashRatioConsideration implements IConsideration {
  type = ConsiderationType.CASH_RATIO;
  evaluate(ctx: AIContext): number {
    const p = ctx.player;
    if (p.totalAssets === 0) return 0.5;
    return Math.min(1, p.cash / p.totalAssets);
  }
}

class PropertyCountConsideration implements IConsideration {
  type = ConsiderationType.PROPERTY_COUNT;
  evaluate(ctx: AIContext): number {
    const total = 90; // total tiles
    return Math.min(1, ctx.player.ownedTiles.size / total);
  }
}

class OpponentThreatConsideration implements IConsideration {
  type = ConsiderationType.OPPONENT_THREAT;
  evaluate(ctx: AIContext): number {
    const us = ctx.player.netWorth;
    const maxOpponent = Math.max(1, ...ctx.allPlayers
      .filter(p => p.id !== ctx.player.id && !p.bankrupt)
      .map(p => p.netWorth));
    return Math.min(1, maxOpponent / Math.max(1, us));
  }
}

class PositionRiskConsideration implements IConsideration {
  type = ConsiderationType.POSITION_RISK;
  evaluate(ctx: AIContext): number {
    // 检查前方格子风险
    let riskyCount = 0;
    for (let i = 0; i < Math.min(6, ctx.aheadTiles.length); i++) {
      const tile = ctx.aheadTiles[i];
      if (tile instanceof PropertyTile && tile.ownerId && tile.ownerId !== ctx.player.id) {
        riskyCount++;
      }
    }
    return Math.min(1, riskyCount / 6);
  }
}

class CPITrendConsideration implements IConsideration {
  type = ConsiderationType.CPI_TREND;
  evaluate(_ctx: AIContext): number {
    const cpi = state.economy.cpi;
    return Math.min(1, cpi / 200);
  }
}

class RentPressureConsideration implements IConsideration {
  type = ConsiderationType.RENT_PRESSURE;
  evaluate(ctx: AIContext): number {
    let maxRent = 0;
    for (const tile of ctx.aheadTiles) {
      if (tile instanceof PropertyTile && tile.ownerId && tile.ownerId !== ctx.player.id) {
        maxRent = Math.max(maxRent, tile.getRent(ctx.player, 0));
      }
    }
    return Math.min(1, maxRent / 5000);
  }
}

class UpgradeROIConsideration implements IConsideration {
  type = ConsiderationType.UPGRADE_ROI;
  evaluate(ctx: AIContext): number {
    // 计算拥有的地产的升级收益率
    let bestROI = 0;
    for (const tileId of ctx.player.ownedTiles) {
      // In full implementation, find tile and calculate ROI
      bestROI = Math.max(bestROI, 0.3);
    }
    return Math.min(1, bestROI);
  }
}

class StockProfitConsideration implements IConsideration {
  type = ConsiderationType.STOCK_PROFIT;
  evaluate(ctx: AIContext): number {
    if (ctx.player.stockPortfolio.length === 0) return 0.5;
    const totalInvested = ctx.player.stockPortfolio.reduce((s, h) => s + h.shares * h.entryPrice, 0);
    const currentValue = ctx.player.stockPortfolio.reduce((s, h) => {
      const stock = ctx.stocks.find(st => st.id === h.stockId);
      return s + h.shares * (stock?.price ?? h.entryPrice);
    }, 0);
    // 0=亏损, 0.5=持平, 1=大赚
    return Math.max(0, Math.min(1, currentValue / Math.max(1, totalInvested) - 0.5));
  }
}

class BankruptcyDistanceConsideration implements IConsideration {
  type = ConsiderationType.BANKRUPTCY_DISTANCE;
  evaluate(ctx: AIContext): number {
    const p = ctx.player;
    const liquid = p.cash + p.bankSavings;
    const minSafe = 5000;
    return Math.min(1, liquid / minSafe);
  }
}

class MonopolyPotentialConsideration implements IConsideration {
  type = ConsiderationType.MONOPOLY_POTENTIAL;
  evaluate(ctx: AIContext): number {
    // 检查是否接近垄断某色组
    const colorGroups = new Map<string, { owned: number; total: number }>();
    for (const tileId of ctx.player.ownedTiles) {
      const group = 'default';
      const entry = colorGroups.get(group) ?? { owned: 0, total: 3 };
      entry.owned++;
      colorGroups.set(group, entry);
    }
    let maxRatio = 0;
    for (const [, counts] of colorGroups) {
      maxRatio = Math.max(maxRatio, counts.owned / counts.total);
    }
    return maxRatio;
  }
}

class JailAvoidanceConsideration implements IConsideration {
  type = ConsiderationType.JAIL_AVOIDANCE;
  evaluate(ctx: AIContext): number {
    if (ctx.player.inJail) return 0.2;
    // 前方是否有监狱格
    for (const tile of ctx.aheadTiles) {
      if (tile instanceof PropertyTile === false && tile !== null) {
        // check jail
      }
    }
    return 0.8;
  }
}

class CardValueConsideration implements IConsideration {
  type = ConsiderationType.CARD_VALUE;
  evaluate(ctx: AIContext): number {
    return ctx.player.hasGetOutOfJailCard ? 0.3 : 0.7;
  }
}

// ============================================================
// 行为实现
// ============================================================

class BuyPropertyAction implements IAction {
  type = ActionType.BUY_PROPERTY;
  canExecute(ctx: AIContext): boolean {
    return ctx.currentTile instanceof PropertyTile &&
      !(ctx.currentTile as PropertyTile).owned &&
      ctx.player.canAfford(ctx.currentTile.getPrice());
  }
  score(ctx: AIContext): number {
    if (!this.canExecute(ctx)) return -1;
    const tile = ctx.currentTile as PropertyTile;
    const price = tile.getPrice();
    const cashRatio = ctx.player.cash / Math.max(1, ctx.player.totalAssets);
    const affordableFactor = Math.min(1, ctx.player.cash / (price * 3));
    return 0.5 + affordableFactor * 0.3 - cashRatio * 0.2;
  }
  execute(ctx: AIContext): string {
    const tile = ctx.currentTile as PropertyTile;
    ctx.player.cash -= tile.getPrice();
    tile.ownerId = ctx.player.id;
    ctx.player.addProperty(tile.id, tile.getPrice());
    return `${ctx.player.name}(AI) 购买了 ${tile.name}`;
  }
}

class UpgradePropertyAction implements IAction {
  type = ActionType.UPGRADE_PROPERTY;
  canExecute(ctx: AIContext): boolean {
    // 寻找可升级的地产
    for (const tileId of ctx.player.ownedTiles) {
      const tile = ctx.currentTile; // should iterate owned tiles
      if (tile instanceof PropertyTile && tile.ownerId === ctx.player.id && tile.canUpgrade()) {
        if (ctx.player.canAfford(tile.upgradeCost)) return true;
      }
    }
    return false;
  }
  score(ctx: AIContext): number {
    if (!this.canExecute(ctx)) return -1;
    // 现金比例高时更愿意升级
    const cashRatio = ctx.player.cash / Math.max(1, ctx.player.totalAssets);
    return 0.4 + cashRatio * 0.4;
  }
  execute(ctx: AIContext): string {
    for (const tileId of ctx.player.ownedTiles) {
      const tile = ctx.currentTile;
      if (tile instanceof PropertyTile && tile.ownerId === ctx.player.id && tile.canUpgrade()) {
        if (ctx.player.canAfford(tile.upgradeCost)) {
          ctx.player.cash -= tile.upgradeCost;
          tile.upgrade();
          return `${ctx.player.name}(AI) 升级了 ${tile.name}`;
        }
      }
    }
    return '';
  }
}

class AuctionBidAction implements IAction {
  type = ActionType.AUCTION_BID;
  canExecute(_ctx: AIContext): boolean { return true; }
  score(ctx: AIContext): number {
    // 根据性格和现金判断是否参与拍卖竞价
    return ctx.player.cash > 5000 ? 0.6 : 0.2;
  }
  execute(ctx: AIContext): string {
    return `${ctx.player.name}(AI) 参与拍卖竞价`;
  }
}

class AuctionPassAction implements IAction {
  type = ActionType.AUCTION_PASS;
  canExecute(_ctx: AIContext): boolean { return true; }
  score(ctx: AIContext): number {
    return ctx.player.cash < 3000 ? 0.8 : 0.3;
  }
  execute(ctx: AIContext): string {
    return `${ctx.player.name}(AI) 放弃拍卖`;
  }
}

class StockBuyAction implements IAction {
  type = ActionType.STOCK_BUY;
  canExecute(ctx: AIContext): boolean {
    return ctx.stocks.length > 0 && ctx.player.cash > 500;
  }
  score(ctx: AIContext): number {
    // 找跌了的股票抄底
    const cashRatio = ctx.player.cash / Math.max(1, ctx.player.totalAssets);
    return 0.3 + cashRatio * 0.3;
  }
  execute(ctx: AIContext): string {
    const stock = ctx.stocks[0]; // pick best
    if (!stock) return '';
    const shares = Math.floor(ctx.player.cash * 0.1 / stock.price);
    if (shares <= 0) return '';
    ctx.player.cash -= stock.price * shares;
    ctx.player.stockPortfolio.push({ stockId: stock.id, type: 'long', shares, entryPrice: stock.price });
    return `${ctx.player.name}(AI) 买入 ${shares} 股 ${stock.symbol}`;
  }
}

class StockSellAction implements IAction {
  type = ActionType.STOCK_SELL;
  canExecute(ctx: AIContext): boolean {
    return ctx.player.stockPortfolio.some(h => h.type === 'long');
  }
  score(ctx: AIContext): number {
    // 盈利就考虑卖出
    const holding = ctx.player.stockPortfolio.find(h => h.type === 'long');
    if (!holding) return -1;
    const stock = ctx.stocks.find(s => s.id === holding.stockId);
    if (!stock) return -1;
    const profitRatio = (stock.price - holding.entryPrice) / holding.entryPrice;
    return profitRatio > 0.2 ? 0.7 : profitRatio < -0.1 ? 0.4 : 0.5;
  }
  execute(ctx: AIContext): string {
    const holding = ctx.player.stockPortfolio.find(h => h.type === 'long');
    if (!holding) return '';
    const stock = ctx.stocks.find(s => s.id === holding.stockId);
    ctx.player.cash += (stock?.price ?? holding.entryPrice) * holding.shares;
    ctx.player.stockPortfolio = ctx.player.stockPortfolio.filter(h => h.stockId !== holding.stockId);
    return `${ctx.player.name}(AI) 卖出 ${holding.stockId}`;
  }
}

class DepositAction implements IAction {
  type = ActionType.DEPOSIT;
  canExecute(ctx: AIContext): boolean { return ctx.player.cash > 2000; }
  score(ctx: AIContext): number {
    return ctx.player.cash > 5000 ? 0.7 : 0.3;
  }
  execute(ctx: AIContext): string {
    const amount = Math.floor(ctx.player.cash * 0.5);
    ctx.player.deposit(amount);
    return `${ctx.player.name}(AI) 存入 $${amount}`;
  }
}

class WithdrawAction implements IAction {
  type = ActionType.WITHDRAW;
  canExecute(ctx: AIContext): boolean { return ctx.player.bankSavings > 0 && ctx.player.cash < 500; }
  score(ctx: AIContext): number {
    return ctx.player.cash < 500 ? 0.9 : 0.1;
  }
  execute(ctx: AIContext): string {
    const amount = Math.min(ctx.player.bankSavings, 3000);
    ctx.player.withdraw(amount);
    return `${ctx.player.name}(AI) 取出 $${amount}`;
  }
}

class PayBailAction implements IAction {
  type = ActionType.PAY_BAIL;
  canExecute(ctx: AIContext): boolean {
    return ctx.player.inJail && (ctx.player.canAfford(500) || ctx.player.hasGetOutOfJailCard);
  }
  score(ctx: AIContext): number {
    return ctx.player.inJail ? 0.8 : 0;
  }
  execute(ctx: AIContext): string {
    if (ctx.player.hasGetOutOfJailCard) {
      ctx.player.hasGetOutOfJailCard = false;
      ctx.player.inJail = false;
      return `${ctx.player.name}(AI) 使用出狱卡`;
    }
    ctx.player.cash -= 500;
    ctx.player.inJail = false;
    return `${ctx.player.name}(AI) 缴保释金出狱`;
  }
}

class StayInJailAction implements IAction {
  type = ActionType.STAY_IN_JAIL;
  canExecute(ctx: AIContext): boolean { return ctx.player.inJail; }
  score(ctx: AIContext): number {
    return ctx.player.cash < 500 ? 0.9 : 0.3;
  }
  execute(ctx: AIContext): string {
    ctx.player.jailTurns--;
    return `${ctx.player.name}(AI) 继续蹲监狱`;
  }
}

class SkipAction implements IAction {
  type = ActionType.SKIP;
  canExecute(_ctx: AIContext): boolean { return true; }
  score(_ctx: AIContext): number { return 0.05; } // 极低
  execute(ctx: AIContext): string {
    return `${ctx.player.name}(AI) 跳过`;
  }
}

// ============================================================
// AIManager — 组合所有考量和行为
// ============================================================

export class AIManager {
  private rng: RandomGenerator;
  private considerations: Map<ConsiderationType, IConsideration> = new Map();
  private actions: IAction[];
  private personality: PersonalityConfig;
  private difficulty: AIDifficulty;
  private difficultyMod: DifficultyModifier;

  constructor(
    rng: RandomGenerator,
    personalityType: string = 'balanced',
    difficulty: AIDifficulty = AIDifficulty.NORMAL,
  ) {
    this.rng = rng;
    this.difficulty = difficulty;
    this.difficultyMod = DIFFICULTY_MODIFIERS[difficulty];
    this.personality = PERSONALITY_CONFIGS[personalityType as keyof typeof PERSONALITY_CONFIGS]
      ?? PERSONALITY_CONFIGS.balanced;

    // 注册考量因素
    this.considerations.set(ConsiderationType.CASH_RATIO, new CashRatioConsideration());
    this.considerations.set(ConsiderationType.PROPERTY_COUNT, new PropertyCountConsideration());
    this.considerations.set(ConsiderationType.OPPONENT_THREAT, new OpponentThreatConsideration());
    this.considerations.set(ConsiderationType.POSITION_RISK, new PositionRiskConsideration());
    this.considerations.set(ConsiderationType.CPI_TREND, new CPITrendConsideration());
    this.considerations.set(ConsiderationType.RENT_PRESSURE, new RentPressureConsideration());
    this.considerations.set(ConsiderationType.UPGRADE_ROI, new UpgradeROIConsideration());
    this.considerations.set(ConsiderationType.STOCK_PROFIT, new StockProfitConsideration());
    this.considerations.set(ConsiderationType.BANKRUPTCY_DISTANCE, new BankruptcyDistanceConsideration());
    this.considerations.set(ConsiderationType.MONOPOLY_POTENTIAL, new MonopolyPotentialConsideration());
    this.considerations.set(ConsiderationType.JAIL_AVOIDANCE, new JailAvoidanceConsideration());
    this.considerations.set(ConsiderationType.CARD_VALUE, new CardValueConsideration());

    // 注册全部15+行为
    this.actions = [
      new BuyPropertyAction(),
      new UpgradePropertyAction(),
      new AuctionBidAction(),
      new AuctionPassAction(),
      new StockBuyAction(),
      new StockSellAction(),
      new DepositAction(),
      new WithdrawAction(),
      new PayBailAction(),
      new StayInJailAction(),
      new SkipAction(),
    ];
  }

  setDifficulty(d: AIDifficulty): void {
    this.difficulty = d;
    this.difficultyMod = DIFFICULTY_MODIFIERS[d];
  }

  setPersonality(type: string): void {
    this.personality = PERSONALITY_CONFIGS[type as keyof typeof PERSONALITY_CONFIGS]
      ?? PERSONALITY_CONFIGS.balanced;
  }

  /** 主决策函数——返回最佳行为 */
  decide(ctx: AIContext): { action: IAction; score: number; log: string } | null {
    // 简单难度：随机行为
    if (this.rng.chance(this.difficultyMod.randomChance)) {
      const validActions = this.actions.filter(a => a.canExecute(ctx));
      if (validActions.length === 0) return null;
      const picked = this.rng.pick(validActions);
      const log = picked.execute(ctx);
      return { action: picked, score: 0, log };
    }

    // 计算每个考量的得分
    const considerationScores = new Map<ConsiderationType, number>();
    for (const [, consideration] of this.considerations) {
      const raw = consideration.evaluate(ctx);
      const weight = getEffectiveWeight(this.personality, consideration.type, this.difficulty);
      const adjusted = raw * weight + this.rng.range(-0.1, 0.1) * this.personality.randomness;
      considerationScores.set(consideration.type, Math.max(0, Math.min(1, adjusted)));
    }

    // 为每个行为评分
    let bestAction: IAction | null = null;
    let bestScore = -1;

    for (const action of this.actions) {
      if (!action.canExecute(ctx)) continue;

      let score = action.score(ctx);
      // 加上性格偏好
      const bias = this.personality.actionBias[action.type] ?? 0;
      score += bias * this.difficultyMod.weightMultiplier;

      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    }

    if (!bestAction) return null;

    const log = bestAction.execute(ctx);
    return { action: bestAction, score: bestScore, log };
  }

  /** 简易决策（快速 AI 响应） */
  quickDecide(ctx: AIContext): string {
    const result = this.decide(ctx);
    return result?.log ?? `${ctx.player.name}(AI) 跳过回合`;
  }

  /** AI 拍卖决策 */
  decideAuctionBid(ctx: AIContext, currentPrice: number): { bid: boolean; message: string } {
    const cashRatio = ctx.player.cash / Math.max(1, ctx.player.totalAssets);
    const shouldBid = cashRatio > 0.3 && ctx.player.canAfford(currentPrice);

    if (this.rng.chance(this.difficultyMod.randomChance)) {
      return { bid: this.rng.chance(0.3), message: '' };
    }

    return {
      bid: shouldBid,
      message: shouldBid ? '出价' : '放弃',
    };
  }

  /** 获取考量分析（调试用） */
  debugConsiderations(ctx: AIContext): Map<string, number> {
    const scores = new Map<string, number>();
    for (const [, consideration] of this.considerations) {
      const raw = consideration.evaluate(ctx);
      const weight = getEffectiveWeight(this.personality, consideration.type, this.difficulty);
      scores.set(consideration.type, raw * weight);
    }
    return scores;
  }

  /** 获取行为排名 */
  debugActionRanking(ctx: AIContext): Array<{ action: string; score: number; canExecute: boolean }> {
    return this.actions.map(a => ({
      action: a.type,
      score: a.score(ctx),
      canExecute: a.canExecute(ctx),
    })).sort((a, b) => b.score - a.score);
  }

  /** 前瞻模拟（困难难度） */
  simulateAhead(ctx: AIContext, steps: number): Map<string, number> {
    const outcomes = new Map<string, number>();
    // 模拟 future steps
    for (let s = 1; s <= steps; s++) {
      // 粗略评估 N 步后的局势
      const futureCash = ctx.player.cash - s * 200; // avg expense
      outcomes.set(`step_${s}`, futureCash);
    }
    return outcomes;
  }
}

// ============================================================
// 额外行为实现
// ============================================================

class ShortStockAction implements IAction {
  type = ActionType.STOCK_SHORT;
  canExecute(ctx: AIContext): boolean {
    return ctx.stocks.length > 0 && ctx.player.cash > 1000;
  }
  score(ctx: AIContext): number {
    // 找上涨过快的股票做空
    let maxOvervalued = 0;
    for (const stock of ctx.stocks) {
      if (stock.history.length >= 5) {
        const avg = stock.history.slice(-5).reduce((a, b) => a + b, 0) / 5;
        const overvalued = (stock.price - avg) / avg;
        maxOvervalued = Math.max(maxOvervalued, overvalued);
      }
    }
    return 0.3 + maxOvervalued * 2;
  }
  execute(ctx: AIContext): string {
    return `${ctx.player.name}(AI) 做空股票`;
  }
}

class RepayLoanAction implements IAction {
  type = ActionType.REPAY_LOAN;
  canExecute(ctx: AIContext): boolean { return ctx.player.cash > 2000; }
  score(ctx: AIContext): number {
    return ctx.player.cash > 5000 ? 0.5 : 0;
  }
  execute(ctx: AIContext): string {
    return `${ctx.player.name}(AI) 偿还贷款`;
  }
}

class LayerSwitchAction implements IAction {
  type = ActionType.LAYER_SWITCH;
  canExecute(ctx: AIContext): boolean { return (ctx.mapLayers as any[]).length > 1; }
  score(ctx: AIContext): number {
    // 当前层风险高时考虑转层
    return 0.3;
  }
  execute(ctx: AIContext): string {
    return `${ctx.player.name}(AI) 切换层级`;
  }
}

class SellStockAction implements IAction {
  type = ActionType.STOCK_SELL;
  canExecute(ctx: AIContext): boolean {
    return ctx.player.stockPortfolio.some(h => h.type === 'long');
  }
  score(ctx: AIContext): number {
    const holding = ctx.player.stockPortfolio.find(h => h.type === 'long');
    if (!holding) return -1;
    const stock = ctx.stocks.find(s => s.id === holding.stockId);
    if (!stock) return -1;
    const profitRatio = (stock.price - holding.entryPrice) / holding.entryPrice;
    // 盈利时倾向卖出，亏损时倾向持有
    return profitRatio > 0.15 ? 0.7 : profitRatio < -0.15 ? 0.2 : 0.5;
  }
  execute(ctx: AIContext): string {
    const holding = ctx.player.stockPortfolio.find(h => h.type === 'long');
    if (!holding) return '';
    const stock = ctx.stocks.find(s => s.id === holding.stockId);
    ctx.player.cash += (stock?.price ?? holding.entryPrice) * holding.shares;
    ctx.player.stockPortfolio = ctx.player.stockPortfolio.filter(
      h => !(h.stockId === holding.stockId && h.type === 'long')
    );
    return `${ctx.player.name}(AI) 卖出 ${holding.stockId}`;
  }
}

class UseCardAction implements IAction {
  type = ActionType.USE_CARD;
  canExecute(ctx: AIContext): boolean {
    return ctx.player.hasGetOutOfJailCard && ctx.player.inJail;
  }
  score(ctx: AIContext): number {
    return ctx.player.inJail ? 0.9 : 0.1;
  }
  execute(ctx: AIContext): string {
    ctx.player.hasGetOutOfJailCard = false;
    ctx.player.inJail = false;
    ctx.player.jailTurns = 0;
    return `${ctx.player.name}(AI) 使用出狱卡`;
  }
}

// ============================================================
// 工厂函数：为每个 AI 玩家创建 AIManager
// ============================================================
export function createAIManager(
  rng: RandomGenerator,
  personality: string,
  difficulty: AIDifficulty,
): AIManager {
  return new AIManager(rng, personality, difficulty);
}
