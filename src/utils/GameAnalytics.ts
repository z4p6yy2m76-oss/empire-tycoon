// ============================================================
// GameAnalytics.ts — 游戏数据分析系统
// 追踪经济指标、玩家行为、游戏统计
// 可用于排行榜和成就系统
// ============================================================

import { state } from '../core/StateManager';
import type { Player } from '../entities/Player';

export interface TurnRecord {
  turnNumber: number;
  playerId: string;
  action: string;
  cashBefore: number;
  cashAfter: number;
  details: string;
}

export interface PlayerStats {
  playerId: string;
  playerName: string;
  totalTurns: number;
  totalIncome: number;
  totalExpense: number;
  propertiesBought: number;
  propertiesUpgraded: number;
  propertiesSold: number;
  stockTrades: number;
  casinoVisits: number;
  jailVisits: number;
  cardsDrawn: number;
  auctionsWon: number;
  rentCollected: number;
  rentPaid: number;
  loansTaken: number;
  maxNetWorth: number;
  minNetWorth: number;
  bankrupt: boolean;
  bankruptTurn: number;
}

export interface GameReport {
  duration: number;
  totalTurns: number;
  winner: string;
  winnerNetWorth: number;
  giniCoefficient: number;
  cpiStart: number;
  cpiEnd: number;
  stockMarketReturn: number;
  mostExpensiveProperty: string;
  mostVisitedTile: string;
  playerStats: PlayerStats[];
}

export class GameAnalytics {
  private turnHistory: TurnRecord[] = [];
  private playerStats: Map<string, PlayerStats> = new Map();
  private tileVisitCounts: Map<number, number> = new Map();
  private startTime: number = 0;
  private startCPI: number = 100;
  private endCPI: number = 100;

  /** 开始记录 */
  startSession(): void {
    this.startTime = Date.now();
    this.startCPI = state.economy.cpi;
    this.turnHistory = [];
    this.playerStats.clear();
    this.tileVisitCounts.clear();

    for (const [, p] of state.players) {
      this.initPlayerStats(p);
    }
  }

  /** 初始化玩家统计 */
  private initPlayerStats(player: Player): void {
    this.playerStats.set(player.id, {
      playerId: player.id,
      playerName: player.name,
      totalTurns: 0, totalIncome: 0, totalExpense: 0,
      propertiesBought: 0, propertiesUpgraded: 0, propertiesSold: 0,
      stockTrades: 0, casinoVisits: 0, jailVisits: 0,
      cardsDrawn: 0, auctionsWon: 0,
      rentCollected: 0, rentPaid: 0, loansTaken: 0,
      maxNetWorth: player.netWorth, minNetWorth: player.netWorth,
      bankrupt: false, bankruptTurn: 0,
    });
  }

  /** 记录一次回合操作 */
  recordTurn(player: Player, action: string, details: string = ''): void {
    const stats = this.playerStats.get(player.id);
    if (stats) {
      stats.totalTurns++;
      stats.maxNetWorth = Math.max(stats.maxNetWorth, player.netWorth);
      stats.minNetWorth = Math.min(stats.minNetWorth, player.netWorth);
    }

    this.turnHistory.push({
      turnNumber: state.turnNumber,
      playerId: player.id,
      action,
      cashBefore: player.cash,
      cashAfter: player.cash,
      details,
    });
  }

  /** 记录格子访问 */
  recordTileVisit(tileId: number): void {
    const current = this.tileVisitCounts.get(tileId) ?? 0;
    this.tileVisitCounts.set(tileId, current + 1);
  }

  /** 记录收入 */
  recordIncome(playerId: string, amount: number): void {
    const stats = this.playerStats.get(playerId);
    if (stats) stats.totalIncome += amount;
  }

  /** 记录支出 */
  recordExpense(playerId: string, amount: number): void {
    const stats = this.playerStats.get(playerId);
    if (stats) stats.totalExpense += amount;
  }

  /** 记录地产购买 */
  recordPropertyBuy(playerId: string): void {
    const stats = this.playerStats.get(playerId);
    if (stats) stats.propertiesBought++;
  }

  /** 记录地产升级 */
  recordPropertyUpgrade(playerId: string): void {
    const stats = this.playerStats.get(playerId);
    if (stats) stats.propertiesUpgraded++;
  }

  /** 记录地产出售 */
  recordPropertySell(playerId: string): void {
    const stats = this.playerStats.get(playerId);
    if (stats) stats.propertiesSold++;
  }

  /** 记录股票交易 */
  recordStockTrade(playerId: string): void {
    const stats = this.playerStats.get(playerId);
    if (stats) stats.stockTrades++;
  }

  /** 记录赌场访问 */
  recordCasinoVisit(playerId: string): void {
    const stats = this.playerStats.get(playerId);
    if (stats) stats.casinoVisits++;
  }

  /** 记录监狱访问 */
  recordJailVisit(playerId: string): void {
    const stats = this.playerStats.get(playerId);
    if (stats) stats.jailVisits++;
  }

  /** 记录抽卡 */
  recordCardDraw(playerId: string): void {
    const stats = this.playerStats.get(playerId);
    if (stats) stats.cardsDrawn++;
  }

  /** 记录拍卖胜利 */
  recordAuctionWin(playerId: string): void {
    const stats = this.playerStats.get(playerId);
    if (stats) stats.auctionsWon++;
  }

  /** 记录过路费收取 */
  recordRentCollect(ownerId: string, amount: number): void {
    const stats = this.playerStats.get(ownerId);
    if (stats) stats.rentCollected += amount;
  }

  /** 记录过路费支付 */
  recordRentPay(payerId: string, amount: number): void {
    const stats = this.playerStats.get(payerId);
    if (stats) stats.rentPaid += amount;
  }

  /** 记录贷款 */
  recordLoan(playerId: string): void {
    const stats = this.playerStats.get(playerId);
    if (stats) stats.loansTaken++;
  }

  /** 记录破产 */
  recordBankruptcy(playerId: string): void {
    const stats = this.playerStats.get(playerId);
    if (stats) {
      stats.bankrupt = true;
      stats.bankruptTurn = state.turnNumber;
    }
  }

  /** 生成游戏报告 */
  generateReport(winnerId: string): GameReport {
    this.endCPI = state.economy.cpi;

    const winner = state.getPlayer(winnerId);
    const mostVisited = [...this.tileVisitCounts.entries()]
      .sort((a, b) => b[1] - a[1])[0];

    // 计算股市平均回报
    let totalReturn = 0;
    let stockCount = 0;
    for (const [, stock] of state.stocks) {
      if (stock.history.length >= 2) {
        totalReturn += (stock.price - stock.history[0]) / stock.history[0];
        stockCount++;
      }
    }
    const avgReturn = stockCount > 0 ? totalReturn / stockCount : 0;

    return {
      duration: Date.now() - this.startTime,
      totalTurns: state.turnNumber,
      winner: winner?.name ?? '未知',
      winnerNetWorth: winner?.netWorth ?? 0,
      giniCoefficient: 0.35, // placeholder
      cpiStart: this.startCPI,
      cpiEnd: this.endCPI,
      stockMarketReturn: avgReturn,
      mostExpensiveProperty: '待统计',
      mostVisitedTile: mostVisited ? `#${mostVisited[0]}` : '无',
      playerStats: [...this.playerStats.values()],
    };
  }

  /** 获取回合历史 */
  getTurnHistory(): TurnRecord[] {
    return [...this.turnHistory];
  }

  /** 获取玩家统计快照 */
  getPlayerStats(playerId: string): PlayerStats | undefined {
    return this.playerStats.get(playerId);
  }

  /** 获取最热门格子 */
  getHotTiles(count: number = 5): { tileId: number; visits: number }[] {
    return [...this.tileVisitCounts.entries()]
      .map(([tileId, visits]) => ({ tileId, visits }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, count);
  }

  /** 清空 */
  reset(): void {
    this.turnHistory = [];
    this.playerStats.clear();
    this.tileVisitCounts.clear();
    this.startTime = 0;
  }
}
