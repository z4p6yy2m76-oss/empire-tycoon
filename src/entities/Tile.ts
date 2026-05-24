// ============================================================
// Tile.ts — 格子基类及所有子类
// 定义地图上每个格子的属性和触发逻辑接口
// ============================================================

import type { Player } from './Player';

export enum TileType {
  START = 'START',
  PROPERTY = 'PROPERTY',
  EVENT = 'EVENT',
  JAIL = 'JAIL',
  CASINO = 'CASINO',
  STOCK = 'STOCK',
  BANK = 'BANK',
  SUBWAY = 'SUBWAY',
  TAX = 'TAX',
  AIRPORT = 'AIRPORT',
  CHANCE = 'CHANCE',
}

export interface TileConfig {
  id: number;
  name: string;
  type: TileType;
  layer: number;
  position: number;     // layer 内的位置索引
  x: number;            // 画布坐标
  y: number;
}

// ============================================================
// Tile 基类
// ============================================================
export abstract class Tile {
  id: number;
  name: string;
  type: TileType;
  layer: number;
  position: number;
  x: number;
  y: number;

  constructor(config: TileConfig) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.layer = config.layer;
    this.position = config.position;
    this.x = config.x;
    this.y = config.y;
  }

  /** 玩家停留时触发 */
  abstract onLand(player: Player): void;

  /** 玩家经过时触发 */
  onPass(player: Player): void {
    // default: no-op
  }

  /** UI 显示文本 */
  abstract getDescription(): string;

  /** 购买价格（地产类） */
  getPrice(): number { return 0; }

  /** 过路费 */
  getRent(visitor: Player): number { return 0; }

  toJSON(): object {
    return {
      id: this.id, name: this.name, type: this.type,
      layer: this.layer, position: this.position,
    };
  }
}

// ============================================================
// StartTile — 起点
// ============================================================
export class StartTile extends Tile {
  private salary: number;

  constructor(config: TileConfig & { salary?: number }) {
    super(config);
    this.salary = config.salary ?? 2000;
  }

  onLand(player: Player): void { player.addMoney(this.salary * 2, '到达起点双倍奖励'); }
  onPass(player: Player): void { player.addMoney(this.salary, '路过起点工资'); }
  getDescription(): string { return `起点 — 路过得 $${this.salary}，到达得 $${this.salary * 2}`; }
}

// ============================================================
// PropertyTile — 地产
// ============================================================
export interface PropertyConfig {
  basePrice: number;
  upgradeCosts: number[];   // [L1->L2, L2->L3, L3->L4]
  rentTable: number[][];    // [level][same-color-set] rent values
  colorGroup: string;
  mortgageValue: number;
}

export class PropertyTile extends Tile {
  ownerId: string | null = null;
  level: number = 0;           // 0=裸地, 1-3=升级
  mortgaged: boolean = false;
  colorGroup: string;
  basePrice: number;
  upgradeCosts: number[];
  rentTable: number[][];
  mortgageValue: number;

  constructor(config: TileConfig & PropertyConfig) {
    super(config);
    this.basePrice = config.basePrice;
    this.upgradeCosts = config.upgradeCosts;
    this.rentTable = config.rentTable;
    this.colorGroup = config.colorGroup;
    this.mortgageValue = config.mortgageValue;
  }

  get owned(): boolean { return this.ownerId !== null; }

  get upgradeCost(): number {
    return this.level < this.upgradeCosts.length ? this.upgradeCosts[this.level] : 0;
  }

  get maxLevel(): number { return this.upgradeCosts.length; }

  canUpgrade(): boolean { return this.level < this.maxLevel; }

  upgrade(): number {
    if (!this.canUpgrade()) return 0;
    const cost = this.upgradeCosts[this.level];
    this.level++;
    return cost;
  }

  getRent(visitor: Player, sameColorBonus: number = 0): number {
    if (this.mortgaged) return 0;
    const levelIdx = Math.min(this.level, this.rentTable.length - 1);
    const setIdx = Math.min(sameColorBonus, this.rentTable[levelIdx].length - 1);
    return this.rentTable[levelIdx][setIdx];
  }

  getPrice(): number { return this.basePrice; }

  getSellPrice(): number {
    let total = this.basePrice;
    for (let i = 0; i < this.level; i++) total += this.upgradeCosts[i];
    return Math.floor(total * 0.6); // 6折回收
  }

  onLand(player: Player): void {
    if (this.ownerId && this.ownerId !== player.id && !this.mortgaged) {
      // Rent is handled by EconomySystem
    }
  }

  getDescription(): string {
    if (this.ownerId) {
      return `${this.name} [Lv${this.level}]  — 业主: ${this.ownerId}`;
    }
    return `${this.name} — $${this.basePrice} 可购买`;
  }
}

// ============================================================
// EventTile — 事件格（抽卡）
// ============================================================
export class EventTile extends Tile {
  cardCategory: 'chance' | 'destiny';

  constructor(config: TileConfig & { cardCategory?: 'chance' | 'destiny' }) {
    super(config);
    this.cardCategory = config.cardCategory ?? 'chance';
  }

  onLand(player: Player): void { /* CardSystem handles this */ }
  getDescription(): string { return this.cardCategory === 'chance' ? '机会格 — 抽取机会卡' : '命运格 — 抽取命运卡'; }
}

// ============================================================
// JailTile — 监狱
// ============================================================
export class JailTile extends Tile {
  bailAmount: number;
  maxTurns: number;

  constructor(config: TileConfig & { bailAmount?: number; maxTurns?: number }) {
    super(config);
    this.bailAmount = config.bailAmount ?? 500;
    this.maxTurns = config.maxTurns ?? 3;
  }

  onLand(player: Player): void { /* JailSystem handles */ }
  getDescription(): string { return `监狱 — 保释金 $${this.bailAmount}`; }
}

// ============================================================
// CasinoTile — 赌场
// ============================================================
export class CasinoTile extends Tile {
  constructor(config: TileConfig) { super(config); }

  onLand(player: Player): void { /* Casino mini-game */ }
  getDescription(): string { return '赌场 — 试试手气！'; }
}

// ============================================================
// StockTile — 股票交易所
// ============================================================
export class StockTile extends Tile {
  constructor(config: TileConfig) { super(config); }

  onLand(player: Player): void { /* StockSystem handles */ }
  getDescription(): string { return '股票交易所 — 买卖股票'; }
}

// ============================================================
// BankTile — 银行
// ============================================================
export class BankTile extends Tile {
  constructor(config: TileConfig) { super(config); }

  onLand(player: Player): void { /* Player can deposit/withdraw/loan */ }
  getDescription(): string { return '银行 — 存取款、贷款'; }
}

// ============================================================
// SubwayTile — 地铁站（层间跳转）
// ============================================================
export class SubwayTile extends Tile {
  targetLayer: number;
  targetPosition: number;

  constructor(config: TileConfig & { targetLayer?: number; targetPosition?: number }) {
    super(config);
    this.targetLayer = config.targetLayer ?? 0;
    this.targetPosition = config.targetPosition ?? 0;
  }

  onLand(player: Player): void {
    player.currentLayer = this.targetLayer;
    player.currentTileId = this.targetPosition;
  }
  getDescription(): string { return `地铁站 — 前往 ${this.targetLayer === 1 ? '地下层' : this.targetLayer === 2 ? '天空层' : '地面层'}`; }
}

// ============================================================
// TaxTile — 税务格
// ============================================================
export class TaxTile extends Tile {
  taxRate: number;
  fixedAmount: number;

  constructor(config: TileConfig & { taxRate?: number; fixedAmount?: number }) {
    super(config);
    this.taxRate = config.taxRate ?? 0.1;
    this.fixedAmount = config.fixedAmount ?? 0;
  }

  onLand(player: Player): void {
    const tax = this.fixedAmount > 0
      ? this.fixedAmount
      : Math.floor(player.totalAssets * this.taxRate);
    player.payAmount(tax);
  }
  getDescription(): string { return `税务局 — 缴税`; }
}

// ============================================================
// AirportTile — 机场
// ============================================================
export class AirportTile extends Tile {
  constructor(config: TileConfig) { super(config); }
  onLand(player: Player): void { /* Optional: teleport */ }
  getDescription(): string { return '机场 — 快速传送'; }
}
