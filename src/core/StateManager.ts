// ============================================================
// StateManager.ts — 全局状态管理
// 单例模式，管理所有游戏状态，支持快照存档/回滚
// ============================================================

import type { Player } from '../entities/Player';
import type { GameSnapshot } from './EventBus';

// ---- 游戏阶段 ----
export enum GamePhase {
  INIT = 'INIT',
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  MODE_SELECT = 'MODE_SELECT',
  ROOM_SETUP = 'ROOM_SETUP',
  PLAYER_SETUP = 'PLAYER_SETUP',
  ROLLING = 'ROLLING',
  MOVING = 'MOVING',
  TILE_TRIGGER = 'TILE_TRIGGER',
  AUCTION = 'AUCTION',
  STOCK_TRADE = 'STOCK_TRADE',
  CARD_RESOLVE = 'CARD_RESOLVE',
  JAIL_RESOLVE = 'JAIL_RESOLVE',
  BANKRUPTCY = 'BANKRUPTCY',
  TURN_TRANSITION = 'TURN_TRANSITION',
  GAME_OVER = 'GAME_OVER',
}

// ---- 游戏模式 ----
export enum GameMode {
  AI_SINGLE = 'AI_SINGLE',
  HOT_SEAT = 'HOT_SEAT',
  ONLINE = 'ONLINE',
}

// ---- AI 难度 ----
export enum AIDifficulty {
  EASY = 'EASY',
  NORMAL = 'NORMAL',
  HARD = 'HARD',
}

// ---- 游戏设置 ----
export interface GameSettings {
  mode: GameMode;
  playerCount: number;
  humanPlayers: number;
  aiDifficulty: AIDifficulty;
  startingMoney: number;
  maxTurns: number;
  enableStocks: boolean;
  enableAuction: boolean;
  enableCPI: boolean;
  mapLayers: number;
}

// ---- 股市数据 ----
export interface StockEntry {
  id: string;
  name: string;
  symbol: string;
  price: number;
  history: number[];
  volatility: number;
  trend: number;
}

// ---- 持仓 ----
export interface StockHolding {
  stockId: string;
  type: 'long' | 'short';
  shares: number;
  entryPrice: number;
}

// ---- 经济状态 ----
export interface EconomyState {
  cpi: number;            // 100 基准
  cpiMultiplier: number;  // 过路费倍率
  interestRate: number;   // 存款利率
  loanRate: number;       // 贷款利率
  taxRate: number;        // 税率
}

// ---- 拍卖状态 ----
export interface AuctionState {
  tileId: number;
  startPrice: number;
  currentPrice: number;
  minPrice: number;
  activeBidders: string[];
  currentBidder: string | null;
  round: number;
  ended: boolean;
  winnerId: string | null;
}

// ---- 存档条目 ----
export interface SaveEntry {
  version: number;
  timestamp: number;
  label: string;
  settings: GameSettings;
  snapshot: GameSnapshot;
}

const DEFAULT_SETTINGS: GameSettings = {
  mode: GameMode.AI_SINGLE,
  playerCount: 4,
  humanPlayers: 1,
  aiDifficulty: AIDifficulty.NORMAL,
  startingMoney: 15000,
  maxTurns: 0,
  enableStocks: true,
  enableAuction: true,
  enableCPI: true,
  mapLayers: 3,
};

const DEFAULT_ECONOMY: EconomyState = {
  cpi: 100,
  cpiMultiplier: 1.0,
  interestRate: 0.05,
  loanRate: 0.10,
  taxRate: 0.15,
};

export class StateManager {
  private static instance: StateManager;

  // ---- 核心状态 ----
  phase: GamePhase = GamePhase.INIT;
  settings: GameSettings = { ...DEFAULT_SETTINGS };
  economy: EconomyState = { ...DEFAULT_ECONOMY };

  // ---- 实体引用 ----
  players: Map<string, Player> = new Map();
  playerOrder: string[] = [];

  // ---- 回合 ----
  currentPlayerIndex: number = 0;
  turnNumber: number = 0;
  roundNumber: number = 0;

  // ---- 骰子 ----
  currentDice: [number, number] = [1, 1];
  doublesCount: number = 0;

  // ---- 股市 ----
  stocks: Map<string, StockEntry> = new Map();

  // ---- 拍卖 ----
  currentAuction: AuctionState | null = null;

  // ---- 历史快照 (用于回滚) ----
  private history: GameSnapshot[] = [];
  private historyIndex: number = -1;
  private readonly maxHistory: number = 50;

  // ---- 存档 ----
  private saves: SaveEntry[] = [];

  static get(): StateManager {
    if (!StateManager.instance) StateManager.instance = new StateManager();
    return StateManager.instance;
  }

  // ---- 初始化 ----
  reset(settings?: Partial<GameSettings>): void {
    if (settings) Object.assign(this.settings, settings);
    this.phase = GamePhase.INIT;
    this.economy = { ...DEFAULT_ECONOMY };
    this.players.clear();
    this.playerOrder = [];
    this.currentPlayerIndex = 0;
    this.turnNumber = 0;
    this.roundNumber = 0;
    this.currentDice = [1, 1];
    this.doublesCount = 0;
    this.stocks.clear();
    this.currentAuction = null;
    this.history = [];
    this.historyIndex = -1;
  }

  // ---- 玩家 ----
  getCurrentPlayer(): Player | undefined {
    if (this.playerOrder.length === 0) return undefined;
    return this.players.get(this.playerOrder[this.currentPlayerIndex]);
  }

  getCurrentPlayerId(): string {
    return this.playerOrder[this.currentPlayerIndex] ?? '';
  }

  getPlayer(id: string): Player | undefined {
    return this.players.get(id);
  }

  getHumanPlayers(): Player[] {
    return [...this.players.values()].filter(p => p.isHuman);
  }

  getAIPlayers(): Player[] {
    return [...this.players.values()].filter(p => !p.isHuman);
  }

  getActivePlayers(): Player[] {
    return [...this.players.values()].filter(p => !p.bankrupt);
  }

  advancePlayer(): void {
    const active = this.playerOrder.filter(id => !this.players.get(id)?.bankrupt);
    if (active.length === 0) return;
    const currentId = this.playerOrder[this.currentPlayerIndex];
    const activeIndex = active.indexOf(currentId);
    const nextIndex = (activeIndex + 1) % active.length;
    this.currentPlayerIndex = this.playerOrder.indexOf(active[nextIndex]);
  }

  // ---- 快照/回滚 ----
  takeSnapshot(): GameSnapshot {
    const snapshot: GameSnapshot = {
      version: 1,
      timestamp: Date.now(),
      players: JSON.parse(JSON.stringify([...this.players.values()])),
      turn: { turnNumber: this.turnNumber, roundNumber: this.roundNumber, currentIndex: this.currentPlayerIndex },
      economy: { ...this.economy },
      stocks: JSON.parse(JSON.stringify([...this.stocks.values()])),
      seed: 0,
    };
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    this.history.push(snapshot);
    if (this.history.length > this.maxHistory) this.history.shift();
    this.historyIndex = this.history.length - 1;
    return snapshot;
  }

  undo(): GameSnapshot | null {
    if (this.historyIndex <= 0) return null;
    this.historyIndex--;
    return this.history[this.historyIndex];
  }

  redo(): GameSnapshot | null {
    if (this.historyIndex >= this.history.length - 1) return null;
    this.historyIndex++;
    return this.history[this.historyIndex];
  }

  // ---- 存档/读档 ----
  save(label?: string): SaveEntry {
    const entry: SaveEntry = {
      version: 1,
      timestamp: Date.now(),
      label: label ?? `存档 ${this.saves.length + 1} — 第 ${this.turnNumber} 回合`,
      settings: { ...this.settings },
      snapshot: this.takeSnapshot(),
    };
    this.saves.push(entry);
    this.persistSaves();
    return entry;
  }

  load(saveIndex: number): SaveEntry | null {
    const entry = this.saves[saveIndex];
    if (!entry) return null;
    return entry;
  }

  getSaves(): SaveEntry[] {
    return [...this.saves];
  }

  private persistSaves(): void {
    try {
      localStorage.setItem('empire-tycoon-saves', JSON.stringify(this.saves));
    } catch { /* localStorage quota exceeded, silently skip */ }
  }

  restoreSaves(): void {
    try {
      const raw = localStorage.getItem('empire-tycoon-saves');
      if (raw) this.saves = JSON.parse(raw);
    } catch { /* corrupted data, start fresh */ }
  }

  deleteSave(index: number): void {
    this.saves.splice(index, 1);
    this.persistSaves();
  }

  // ---- 经济 ----
  updateEconomy(totalAssets: number): void {
    this.economy.cpi += 0.5 + (totalAssets / 100000) * 0.1;
    this.economy.cpiMultiplier = this.economy.cpi / 100;
    this.economy.interestRate = Math.max(0.01, 0.05 - (this.economy.cpi - 100) / 1000);
    this.economy.loanRate = this.economy.interestRate + 0.05;
  }
}

export const state = StateManager.get();
