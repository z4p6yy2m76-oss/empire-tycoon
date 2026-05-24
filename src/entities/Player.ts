// ============================================================
// Player.ts — 玩家实体
// 包含属性、背包、Buff、持仓、监狱状态等
// ============================================================

import type { StockHolding } from '../core/StateManager';

export interface PlayerBuff {
  id: string;
  name: string;
  remainingTurns: number;
  effect: BuffEffect;
}

export interface BuffEffect {
  rentMultiplier?: number;
  incomeMultiplier?: number;
  moveBonus?: number;      // extra steps
  jailImmunity?: boolean;
  discountRate?: number;    // property purchase discount
  doubleRent?: boolean;
  skipTurn?: boolean;
}

export interface PlayerConfig {
  id: string;
  name: string;
  color: string;
  isHuman: boolean;
  aiPersonality?: string;
  avatarIndex: number;
}

export class Player {
  id: string;
  name: string;
  color: string;
  isHuman: boolean;
  aiPersonality: string;
  avatarIndex: number;

  // 金钱
  cash: number;
  bankSavings: number;
  totalInvested: number;

  // 位置
  currentTileId: number = 0;
  currentLayer: number = 0;
  previousTileId: number = 0;
  stepsRemaining: number = 0;

  // 监狱
  inJail: boolean = false;
  jailTurns: number = 0;
  hasGetOutOfJailCard: boolean = false;

  // 地产
  ownedTiles: Set<number> = new Set();
  mortgageTiles: Set<number> = new Set();

  // 股票
  stockPortfolio: StockHolding[] = [];

  // Buff
  buffs: PlayerBuff[] = [];

  // 状态
  bankrupt: boolean = false;
  skipNextTurn: boolean = false;
  turnsPlayed: number = 0;
  totalIncome: number = 0;
  totalExpense: number = 0;

  // 网络
  connected: boolean = true;
  ready: boolean = false;

  constructor(config: PlayerConfig) {
    this.id = config.id;
    this.name = config.name;
    this.color = config.color;
    this.isHuman = config.isHuman;
    this.aiPersonality = config.aiPersonality ?? 'balanced';
    this.avatarIndex = config.avatarIndex;
    this.cash = 0;
    this.bankSavings = 0;
    this.totalInvested = 0;
  }

  get totalAssets(): number {
    return this.cash + this.bankSavings + this.totalInvested;
  }

  get netWorth(): number {
    const stockValue = this.stockPortfolio.reduce((sum, h) => sum + h.shares * h.entryPrice, 0);
    return this.cash + this.bankSavings + this.totalInvested + stockValue;
  }

  addMoney(amount: number, reason: string): void {
    this.cash += amount;
    if (amount > 0) this.totalIncome += amount;
    else this.totalExpense += Math.abs(amount);
  }

  deposit(amount: number): boolean {
    amount = Math.min(amount, this.cash);
    if (amount <= 0) return false;
    this.cash -= amount;
    this.bankSavings += amount;
    return true;
  }

  withdraw(amount: number): boolean {
    amount = Math.min(amount, this.bankSavings);
    if (amount <= 0) return false;
    this.bankSavings -= amount;
    this.cash += amount;
    return true;
  }

  canAfford(amount: number): boolean {
    return this.cash >= amount;
  }

  payAmount(amount: number): boolean {
    if (this.cash >= amount) {
      this.cash -= amount;
      this.totalExpense += amount;
      return true;
    }
    const shortage = amount - this.cash;
    if (this.bankSavings >= shortage) {
      this.cash = 0;
      this.withdraw(shortage);
      this.cash -= amount - shortage;
      this.totalExpense += amount;
      return true;
    }
    return false;
  }

  addBuff(buff: PlayerBuff): void {
    this.buffs.push(buff);
  }

  tickBuffs(): void {
    this.buffs = this.buffs.filter(b => {
      b.remainingTurns--;
      return b.remainingTurns > 0;
    });
  }

  getBuffMultiplier(key: keyof BuffEffect): number {
    return this.buffs.reduce((acc, b) => {
      const val = b.effect[key];
      return val !== undefined ? acc * (val as number) : acc;
    }, 1);
  }

  addProperty(tileId: number, cost: number): void {
    this.ownedTiles.add(tileId);
    this.totalInvested += cost;
  }

  removeProperty(tileId: number): void {
    this.ownedTiles.delete(tileId);
    this.mortgageTiles.delete(tileId);
  }

  toJSON(): object {
    return {
      id: this.id, name: this.name, color: this.color,
      isHuman: this.isHuman, cash: this.cash, bankSavings: this.bankSavings,
      currentTileId: this.currentTileId, currentLayer: this.currentLayer,
      ownedTiles: [...this.ownedTiles],
      bankrupt: this.bankrupt, inJail: this.inJail,
      netWorth: this.netWorth,
    };
  }
}

// ============================================================
// 玩家工厂
// ============================================================
const PLAYER_COLORS = ['#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6', '#1ABC9C'];
const PLAYER_NAMES = ['钱多多', '李富贵', '王百万', '张老板', '赵公子', '陈大亨'];

export function createPlayer(
  index: number,
  isHuman: boolean,
  personality?: string,
  startingMoney: number = 15000,
  name?: string,
): Player {
  const p = new Player({
    id: `player_${index}`,
    name: name ?? PLAYER_NAMES[index % PLAYER_NAMES.length],
    color: PLAYER_COLORS[index % PLAYER_COLORS.length],
    isHuman,
    aiPersonality: isHuman ? undefined : (personality ?? 'balanced'),
    avatarIndex: index,
  });
  p.cash = startingMoney;
  return p;
}
