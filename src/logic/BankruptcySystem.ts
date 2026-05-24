// ============================================================
// BankruptcySystem.ts — 破产判定与清算
// 当玩家无法支付债务时，自动出售资产直至还清或破产
// ============================================================

import { state } from '../core/StateManager';
import { bus } from '../core/EventBus';
import type { Player } from '../entities/Player';
import { PropertyTile } from '../entities/Tile';

export enum BankruptcyState {
  SAFE = 'SAFE',
  WARNING = 'WARNING',   // 现金不足但可变卖资产
  CRITICAL = 'CRITICAL', // 变卖资产后仍不足
  BANKRUPT = 'BANKRUPT',
}

export class BankruptcySystem {
  /** 检查玩家是否有破产风险 */
  checkRisk(player: Player, owedAmount: number): BankruptcyState {
    if (player.cash >= owedAmount) return BankruptcyState.SAFE;

    const liquidAssets = player.cash + player.bankSavings;
    if (liquidAssets >= owedAmount) return BankruptcyState.WARNING;

    // 计算可变卖资产
    const sellableValue = this.calculateLiquidationValue(player);
    if (liquidAssets + sellableValue >= owedAmount) return BankruptcyState.WARNING;

    return BankruptcyState.CRITICAL;
  }

  /** 计算所有地产强制变卖的总价值 */
  calculateLiquidationValue(player: Player): number {
    let total = 0;
    for (const tileId of player.ownedTiles) {
      // Access tile from map data
      total += 500; // fallback per property
    }
    return Math.floor(total * 0.6); // 6折
  }

  /** 强制拍卖流程：逐个出售资产直到还清债务 */
  forceLiquidate(player: Player, owedAmount: number): { settled: boolean; remaining: number } {
    let debt = owedAmount - player.cash;

    // 1. 先从银行取钱
    if (debt > 0 && player.bankSavings > 0) {
      const withdrawAmt = Math.min(debt, player.bankSavings);
      player.withdraw(withdrawAmt);
      debt -= withdrawAmt;
    }

    // 2. 出售地产
    if (debt > 0) {
      const propertyIds = [...player.ownedTiles];
      for (const tileId of propertyIds) {
        if (debt <= 0) break;
        // In full implementation, access tile from map
        // For now: add cash and remove property
        const sellValue = 500; // placeholder
        player.cash += sellValue;
        debt -= sellValue;
        player.ownedTiles.delete(tileId);
        player.mortgageTiles.delete(tileId);
      }
    }

    // 3. 出售股票
    if (debt > 0 && player.stockPortfolio.length > 0) {
      const stockValue = player.stockPortfolio.reduce(
        (sum, h) => sum + h.shares * h.entryPrice, 0
      );
      player.cash += stockValue;
      debt -= stockValue;
      player.stockPortfolio = [];
    }

    if (debt <= 0) {
      return { settled: true, remaining: 0 };
    }

    return { settled: false, remaining: debt };
  }

  /** 宣布破产 */
  declareBankruptcy(player: Player): void {
    player.bankrupt = true;

    // 归还地产 - 遍历所有地产
    const tileIds = [...player.ownedTiles];
    for (const tileId of tileIds) {
      player.ownedTiles.delete(tileId);
      player.mortgageTiles.delete(tileId);
    }

    // 清算股票
    player.stockPortfolio = [];
    player.cash = 0;
    player.bankSavings = 0;

    bus.emit('bankruptcy.complete', {
      playerId: player.id,
      remaining: 0,
    });

    // 通知其他玩家
    state.getActivePlayers().forEach(p => {
      if (p.id !== player.id) {
        // 继承破产玩家的剩余资产（若有）
        // Full implementation: distribute assets
      }
    });
  }

  /** 处理完整的破产流程 */
  processInsolvency(player: Player, owedAmount: number): string {
    bus.emit('bankruptcy.start', { playerId: player.id });

    const risk = this.checkRisk(player, owedAmount);
    if (risk === BankruptcyState.SAFE) {
      return `${player.name} 可以支付 $${owedAmount}`;
    }

    if (risk === BankruptcyState.WARNING) {
      // 尝试从银行取款
      if (player.bankSavings > 0) {
        const needed = owedAmount - player.cash;
        player.withdraw(Math.min(needed, player.bankSavings));
      }
      if (player.cash >= owedAmount) {
        return `${player.name} 取款后可以支付`;
      }
    }

    const result = this.forceLiquidate(player, owedAmount);

    if (result.settled) {
      return `${player.name} 变卖资产后还清债务，剩余 $${player.cash}`;
    }

    this.declareBankruptcy(player);
    return `${player.name} 破产了! 债务缺口: $${result.remaining}`;
  }

  /** 债务协商（玩家间转让） */
  negotiateDebt(player: Player, creditor: Player, amount: number): boolean {
    if (player.canAfford(amount)) {
      player.payAmount(amount);
      creditor.addMoney(amount, '债务协商');
      return true;
    }

    // 尝试部分支付+地产抵押
    const partial = player.cash;
    player.cash = 0;
    creditor.addMoney(partial, '部分债务清偿');

    const remaining = amount - partial;
    const liquidation = this.forceLiquidate(player, remaining);

    if (liquidation.settled) {
      creditor.addMoney(remaining, '债务余额');
      return true;
    }

    return false;
  }

  /** 变卖评估（预估可变现金额） */
  estimateLiquidation(player: Player): {
    cash: number;
    bank: number;
    propertyValue: number;
    stockValue: number;
    total: number;
  } {
    let stockVal = 0;
    for (const h of player.stockPortfolio) {
      stockVal += h.shares * h.entryPrice;
    }

    return {
      cash: player.cash,
      bank: player.bankSavings,
      propertyValue: this.calculateLiquidationValue(player),
      stockValue: Math.floor(stockVal * 0.8),
      total: player.cash + player.bankSavings + this.calculateLiquidationValue(player) + Math.floor(stockVal * 0.8),
    };
  }
}
