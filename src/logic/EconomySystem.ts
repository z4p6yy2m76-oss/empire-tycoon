// ============================================================
// EconomySystem.ts — 经济系统
// 通货膨胀 (CPI)、利息计算、过路费、银行存取款/贷款
// 新增: 贷款追踪、色组垄断加成、经济周期
// ============================================================

import { state } from '../core/StateManager';
import { bus } from '../core/EventBus';
import type { Player } from '../entities/Player';
import { PropertyTile, type Tile } from '../entities/Tile';

// ---- 贷款记录 ----
export interface LoanRecord {
  id: string;
  playerId: string;
  principal: number;
  remainingBalance: number;
  interestRate: number;
  term: number;          // 剩余期数
  monthlyPayment: number;
  startTurn: number;
}

// ---- 色组定义 ----
export interface ColorGroupInfo {
  name: string;
  color: string;
  totalCount: number;
  tileIds: number[];
}

// ---- 经济周期阶段 ----
export enum EconomyCycle {
  BOOM = 'BOOM',         // 繁荣：CPI 上升快、利率高
  NORMAL = 'NORMAL',     // 正常
  RECESSION = 'RECESSION', // 衰退：CPI 下降、利率低
}

export class EconomySystem {
  private loans: Map<string, LoanRecord[]> = new Map();
  private cycle: EconomyCycle = EconomyCycle.NORMAL;
  private cycleTimer: number = 0;
  private cycleDuration: number = 20;

  /** 获取所有活跃贷款 */
  getActiveLoans(playerId: string): LoanRecord[] {
    return (this.loans.get(playerId) ?? []).filter(l => l.remainingBalance > 0);
  }

  /** 获取总负债 */
  getTotalDebt(playerId: string): number {
    return this.getActiveLoans(playerId).reduce((s, l) => s + l.remainingBalance, 0);
  }

  // ---- 过路费计算 ----
  calculateRent(tile: Tile, visitor: Player): number {
    if (!(tile instanceof PropertyTile)) return 0;
    if (tile.mortgaged) return 0;
    if (!tile.ownerId || tile.ownerId === visitor.id) return 0;

    const owner = state.getPlayer(tile.ownerId);
    if (!owner) return 0;

    // 同色组加成计算
    let sameColorCount = this.countSameColorGroup(tile, owner);

    const baseRent = tile.getRent(visitor, Math.max(0, sameColorCount - 1));
    const cpiMult = state.economy.cpiMultiplier;
    const ownerBuffMult = owner.getBuffMultiplier('rentMultiplier');
    const visitorBuffMult = visitor.getBuffMultiplier('rentMultiplier');
    // 经济周期影响
    const cycleMult = this.cycle === EconomyCycle.BOOM ? 1.2 :
                     this.cycle === EconomyCycle.RECESSION ? 0.8 : 1.0;

    return Math.floor(baseRent * cpiMult * ownerBuffMult * visitorBuffMult * cycleMult);
  }

  /** 计算玩家在某色组拥有的地产数量 */
  countSameColorGroup(tile: PropertyTile, owner: Player): number {
    let count = 0;
    const group = tile.colorGroup;
    if (!group) return 1;
    // 遍历所有地图层查找同色组地产
    for (const ownedId of owner.ownedTiles) {
      // 简化：同色组计数基于 tile 的 colorGroup
      if (ownedId === tile.id) count++;
      // 完整实现需要遍历地图数据查找色组
    }
    return Math.max(1, count);
  }

  /** 检查是否垄断某色组 */
  hasMonopoly(player: Player, colorGroup: string, totalInGroup: number): boolean {
    let owned = 0;
    for (const tileId of player.ownedTiles) {
      // 完整实现需要对照地图数据
      owned++;
    }
    return owned >= totalInGroup;
  }

  // ---- 过路费收取 ----
  collectRent(tile: Tile, from: Player): number {
    if (!(tile instanceof PropertyTile)) return 0;
    const amount = this.calculateRent(tile, from);
    if (amount <= 0) return 0;

    const owner = state.getPlayer(tile.ownerId!);
    if (!owner) return 0;

    if (from.payAmount(amount)) {
      owner.addMoney(amount, `过路费: ${tile.name}`);
      bus.emit('property.rent', {
        ownerId: owner.id, payerId: from.id, tileId: tile.id, amount,
      });
      return amount;
    }
    bus.emit('bankruptcy.start', { playerId: from.id });
    return 0;
  }

  // ---- CPI 更新 ----
  updateCPI(): void {
    const totalAssets = [...state.players.values()]
      .reduce((sum, p) => sum + p.totalAssets, 0);

    // 经济周期影响 CPI 变化幅度
    const cycleMod = this.cycle === EconomyCycle.BOOM ? 2.0 :
                    this.cycle === EconomyCycle.RECESSION ? 0.3 : 1.0;

    state.economy.cpi += (0.5 + (totalAssets / 500000) * 0.5) * cycleMod;
    state.economy.cpiMultiplier = state.economy.cpi / 100;
    state.economy.interestRate = Math.max(0.005, 0.05 - (state.economy.cpi - 100) / 500);
    state.economy.loanRate = state.economy.interestRate + 0.05;

    // 经济周期轮换
    this.cycleTimer++;
    if (this.cycleTimer >= this.cycleDuration) {
      this.cycleTimer = 0;
      this.rotateCycle();
    }

    bus.emit('cpi.update', {
      value: state.economy.cpi,
      multiplier: state.economy.cpiMultiplier,
    });
  }

  /** 轮换经济周期 */
  private rotateCycle(): void {
    const roll = Math.random();
    if (this.cycle === EconomyCycle.NORMAL) {
      this.cycle = roll < 0.4 ? EconomyCycle.BOOM : EconomyCycle.RECESSION;
    } else if (this.cycle === EconomyCycle.BOOM) {
      this.cycle = roll < 0.6 ? EconomyCycle.NORMAL : EconomyCycle.RECESSION;
    } else {
      this.cycle = roll < 0.5 ? EconomyCycle.NORMAL : EconomyCycle.BOOM;
    }
    bus.emit('network.message', {
      type: 'economy.cycle',
      payload: { cycle: this.cycle },
    });
  }

  getEconomyCycle(): EconomyCycle { return this.cycle; }
  getCycleLabel(): string {
    const labels = { BOOM: '繁荣', NORMAL: '正常', RECESSION: '衰退' };
    return labels[this.cycle];
  }

  // ---- 银行利息结算 ----
  settleInterest(player: Player): void {
    const depositInterest = Math.floor(player.bankSavings * state.economy.interestRate);
    if (depositInterest > 0) {
      player.addMoney(depositInterest, '存款利息');
    }
    // 贷款利息
    const activeLoans = this.getActiveLoans(player.id);
    for (const loan of activeLoans) {
      const interestCharge = Math.floor(loan.remainingBalance * loan.interestRate);
      if (player.payAmount(Math.min(interestCharge, loan.monthlyPayment))) {
        loan.remainingBalance = Math.max(0, loan.remainingBalance - loan.monthlyPayment + interestCharge);
      }
    }
  }

  // ---- 起始工资 ----
  paySalary(player: Player, baseSalary: number = 2000): void {
    const cpiBonus = Math.floor(baseSalary * Math.max(0, state.economy.cpiMultiplier - 1));
    const incomeBuff = player.getBuffMultiplier('incomeMultiplier');
    const total = Math.floor((baseSalary + cpiBonus) * incomeBuff);
    player.addMoney(total, '工资');
  }

  // ---- 贷款系统 ----
  getMaxLoan(player: Player): number {
    return Math.floor(player.totalAssets * 0.5);
  }

  takeLoan(player: Player, amount: number, term: number = 10): LoanRecord | null {
    const maxLoan = this.getMaxLoan(player);
    if (amount > maxLoan) return null;

    const existingDebt = this.getTotalDebt(player.id);
    if (existingDebt + amount > maxLoan) return null;

    const loan: LoanRecord = {
      id: `loan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      playerId: player.id,
      principal: amount,
      remainingBalance: amount,
      interestRate: state.economy.loanRate,
      term,
      monthlyPayment: Math.ceil(amount / term),
      startTurn: state.turnNumber,
    };

    player.cash += amount;
    if (!this.loans.has(player.id)) this.loans.set(player.id, []);
    this.loans.get(player.id)!.push(loan);

    return loan;
  }

  repayLoan(player: Player, loanId: string, amount?: number): { success: boolean; remaining: number } {
    const loans = this.loans.get(player.id);
    if (!loans) return { success: false, remaining: 0 };

    const loan = loans.find(l => l.id === loanId);
    if (!loan) return { success: false, remaining: 0 };

    const payAmount = Math.min(amount ?? loan.remainingBalance, loan.remainingBalance);
    if (!player.canAfford(payAmount)) return { success: false, remaining: loan.remainingBalance };

    player.cash -= payAmount;
    loan.remainingBalance -= payAmount;

    if (loan.remainingBalance <= 0) {
      const idx = loans.indexOf(loan);
      if (idx >= 0) loans.splice(idx, 1);
    }

    return { success: true, remaining: loan.remainingBalance };
  }

  /** 提前还清所有贷款 */
  clearAllLoans(player: Player): number {
    const total = this.getTotalDebt(player.id);
    if (player.canAfford(total)) {
      player.cash -= total;
      this.loans.delete(player.id);
      return total;
    }
    return 0;
  }

  // ---- 地产购买 ----
  buyProperty(player: Player, tile: PropertyTile): boolean {
    const price = tile.getPrice();
    const discount = player.getBuffMultiplier('discountRate');
    const finalPrice = Math.floor(price * discount);
    if (!player.canAfford(finalPrice)) return false;
    if (tile.owned) return false;

    player.cash -= finalPrice;
    tile.ownerId = player.id;
    player.addProperty(tile.id, finalPrice);

    bus.emit('property.buy', { playerId: player.id, tileId: tile.id, price: finalPrice });
    return true;
  }

  // ---- 地产升级 ----
  upgradeProperty(player: Player, tile: PropertyTile): boolean {
    if (tile.ownerId !== player.id) return false;
    const cost = tile.upgradeCost;
    if (cost === 0) return false;
    if (!player.canAfford(cost)) return false;

    player.cash -= cost;
    const newLevel = tile.upgrade();
    player.totalInvested += cost;

    bus.emit('property.upgrade', { playerId: player.id, tileId: tile.id, level: newLevel, cost });
    return true;
  }

  // ---- 地产出售 ----
  sellProperty(player: Player, tile: PropertyTile): number {
    if (tile.ownerId !== player.id) return 0;
    const price = tile.getSellPrice();
    tile.ownerId = null;
    tile.level = 0;
    tile.mortgaged = false;
    player.removeProperty(tile.id);
    player.cash += price;
    return price;
  }

  // ---- 地产抵押/赎回 ----
  mortgageProperty(player: Player, tile: PropertyTile): number {
    if (tile.ownerId !== player.id || tile.mortgaged) return 0;
    tile.mortgaged = true;
    const value = tile.mortgageValue;
    player.cash += value;
    player.mortgageTiles.add(tile.id);
    return value;
  }

  redeemProperty(player: Player, tile: PropertyTile): boolean {
    if (tile.ownerId !== player.id || !tile.mortgaged) return false;
    const cost = Math.floor(tile.mortgageValue * 1.1);
    if (!player.canAfford(cost)) return false;
    player.cash -= cost;
    tile.mortgaged = false;
    player.mortgageTiles.delete(tile.id);
    return true;
  }

  // ---- 统计分析 ----
  /** 计算游戏经济总量 */
  getTotalMoneySupply(): number {
    let total = 0;
    for (const [, p] of state.players) {
      total += p.cash + p.bankSavings + p.totalInvested;
    }
    return total;
  }

  /** Gini 系数（财富不均度） */
  calculateGiniCoefficient(): number {
    const netWorths = [...state.players.values()]
      .filter(p => !p.bankrupt)
      .map(p => p.netWorth)
      .sort((a, b) => a - b);

    if (netWorths.length < 2) return 0;
    const n = netWorths.length;
    const mean = netWorths.reduce((a, b) => a + b, 0) / n;
    if (mean === 0) return 0;

    let sumAbsDiff = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        sumAbsDiff += Math.abs(netWorths[i] - netWorths[j]);
      }
    }
    return sumAbsDiff / (2 * n * n * mean);
  }
}
