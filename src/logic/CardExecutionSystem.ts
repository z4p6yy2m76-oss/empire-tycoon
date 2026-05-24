// ============================================================
// CardExecutionSystem.ts — 卡牌执行引擎
// 处理卡牌效果、条件判断、连锁触发
// 支持脚本化的卡牌效果执行
// ============================================================

import type { Player } from '../entities/Player';
import { Card, CardType, CardEffectType, type CardEffect, type CardCondition } from '../entities/Card';
import { state } from '../core/StateManager';
import { bus } from '../core/EventBus';
import type { RandomGenerator } from '../core/RandomGenerator';

export interface CardExecutionContext {
  player: Player;
  allPlayers: Player[];
  rng: RandomGenerator;
  cardId: string;
  cardName: string;
  cardType: CardType;
}

export interface CardActionResult {
  success: boolean;
  log: string;
  affectedPlayers: string[];
  moneyMovement: number;
  specialEffect: string;
}

export class CardExecutionSystem {
  private rng: RandomGenerator;
  private cardLog: string[] = [];
  private executionCount: number = 0;

  constructor(rng: RandomGenerator) {
    this.rng = rng;
  }

  /** 执行单张卡牌的所有效果 */
  executeCard(ctx: CardExecutionContext, effects: CardEffect[]): CardActionResult[] {
    const results: CardActionResult[] = [];
    this.executionCount++;

    for (const effect of effects) {
      const result = this.executeEffect(effect, ctx);
      results.push(result);
      this.cardLog.push(result.log);
    }

    bus.emit('card.execute', { playerId: ctx.player.id, cardId: ctx.cardId });
    return results;
  }

  /** 执行单个效果 */
  private executeEffect(effect: CardEffect, ctx: CardExecutionContext): CardActionResult {
    const { player, allPlayers } = ctx;
    const result: CardActionResult = {
      success: true,
      log: '',
      affectedPlayers: [player.id],
      moneyMovement: 0,
      specialEffect: '',
    };

    switch (effect.type) {
      case CardEffectType.MONEY_ADD:
        player.addMoney(effect.value, `卡牌: ${ctx.cardName}`);
        result.log = `${player.name} 获得 $${effect.value}`;
        result.moneyMovement = effect.value;
        break;

      case CardEffectType.MONEY_LOSE:
        if (player.payAmount(effect.value)) {
          result.log = `${player.name} 支付 $${effect.value}`;
          result.moneyMovement = -effect.value;
        } else {
          result.log = `${player.name} 无力支付 $${effect.value}`;
          result.success = false;
          bus.emit('bankruptcy.start', { playerId: player.id });
        }
        break;

      case CardEffectType.MONEY_FROM_ALL: {
        const others = allPlayers.filter(p => p.id !== player.id && !p.bankrupt);
        const perPlayer = Math.floor(effect.value / Math.max(1, others.length));
        let collected = 0;
        others.forEach(p => {
          const paid = Math.min(perPlayer, p.cash);
          p.payAmount(paid);
          collected += paid;
          result.affectedPlayers.push(p.id);
        });
        player.addMoney(collected, `卡牌收款`);
        result.log = `${player.name} 收取 ${collected} (每人$${perPlayer})`;
        result.moneyMovement = collected;
        break;
      }

      case CardEffectType.MONEY_TO_ALL: {
        const others = allPlayers.filter(p => p.id !== player.id && !p.bankrupt);
        const perPlayer = Math.floor(effect.value / Math.max(1, others.length));
        const total = perPlayer * others.length;
        if (player.payAmount(total)) {
          others.forEach(p => {
            p.addMoney(perPlayer, `${player.name} 派钱`);
            result.affectedPlayers.push(p.id);
          });
          result.log = `${player.name} 向每位对手支付 $${perPlayer}`;
          result.moneyMovement = -total;
        } else {
          result.log = `${player.name} 无力支付`;
          result.success = false;
        }
        break;
      }

      case CardEffectType.MOVE_FORWARD:
        player.stepsRemaining = effect.value;
        result.log = `${player.name} 前进 ${effect.value} 步`;
        result.specialEffect = 'move';
        break;

      case CardEffectType.MOVE_BACKWARD:
        player.stepsRemaining = -effect.value;
        result.log = `${player.name} 后退 ${effect.value} 步`;
        result.specialEffect = 'move_back';
        break;

      case CardEffectType.TELEPORT:
        player.currentTileId = effect.value;
        result.log = `${player.name} 传送到 #${effect.value}`;
        result.specialEffect = 'teleport';
        break;

      case CardEffectType.TELEPORT_LAYER:
        player.currentLayer = effect.value;
        result.log = `${player.name} 传送到第 ${effect.value} 层`;
        result.specialEffect = 'layer_teleport';
        break;

      case CardEffectType.GO_TO_JAIL:
        player.inJail = true;
        player.jailTurns = effect.value || 3;
        result.log = `${player.name} 入狱 ${player.jailTurns} 回合`;
        result.specialEffect = 'jail';
        break;

      case CardEffectType.GET_OUT_OF_JAIL:
        player.hasGetOutOfJailCard = true;
        result.log = `${player.name} 获得出狱通行证`;
        result.specialEffect = 'jail_card';
        break;

      case CardEffectType.SKIP_TURN:
        player.skipNextTurn = true;
        result.log = `${player.name} 跳过下回合`;
        result.specialEffect = 'skip_turn';
        break;

      case CardEffectType.EXTRA_TURN:
        result.log = `${player.name} 获得额外回合`;
        result.specialEffect = 'extra_turn';
        break;

      case CardEffectType.PROPERTY_TAX: {
        const taxAmount = player.ownedTiles.size * effect.value;
        if (player.payAmount(taxAmount)) {
          result.log = `${player.name} 缴纳地产税 $${taxAmount} (${player.ownedTiles.size}处)`;
          result.moneyMovement = -taxAmount;
        } else {
          result.log = `${player.name} 无力缴纳地产税`;
          result.success = false;
        }
        break;
      }

      case CardEffectType.PROPERTY_REPAIR: {
        const repairCost = player.ownedTiles.size * effect.value;
        if (player.payAmount(repairCost)) {
          result.log = `${player.name} 支付维修费 $${repairCost}`;
          result.moneyMovement = -repairCost;
        } else {
          result.log = `${player.name} 无力支付维修费`;
          result.success = false;
        }
        break;
      }

      case CardEffectType.COLLECT_RENT: {
        const rentIncome = player.ownedTiles.size * (effect.value || 200);
        player.addMoney(rentIncome, '统一收租');
        result.log = `${player.name} 收租 $${rentIncome}`;
        result.moneyMovement = rentIncome;
        break;
      }

      case CardEffectType.STOCK_BONUS:
        player.addMoney(effect.value, '股票红利');
        result.log = `${player.name} 获得股票红利 $${effect.value}`;
        result.moneyMovement = effect.value;
        result.specialEffect = 'stock_bonus';
        break;

      case CardEffectType.CPI_CHANGE:
        state.economy.cpi += effect.value;
        state.economy.cpiMultiplier = state.economy.cpi / 100;
        result.log = `CPI ${effect.value > 0 ? '上涨' : '下降'} ${Math.abs(effect.value)}`;
        result.specialEffect = 'cpi_change';
        break;

      case CardEffectType.BANK_INTEREST: {
        const interest = Math.floor(player.bankSavings * (effect.value || 0.1));
        player.addMoney(interest, '银行利息');
        result.log = `${player.name} 银行利息 $${interest}`;
        result.moneyMovement = interest;
        break;
      }

      case CardEffectType.LOTTERY: {
        const won = this.rng.chance(effect.value);
        const prize = won ? effect.value * 10000 : 0;
        if (won) {
          player.addMoney(prize, '彩票中奖');
          player.cash += prize;
        }
        result.log = won
          ? `${player.name} 彩票中奖 $${prize}!`
          : `${player.name} 彩票未中奖`;
        result.moneyMovement = won ? prize : 0;
        result.specialEffect = won ? 'lottery_win' : 'lottery_lose';
        break;
      }

      case CardEffectType.UPGRADE_FREE:
        result.log = `${player.name} 获得免费升级机会`;
        result.specialEffect = 'free_upgrade';
        break;

      case CardEffectType.DOWNGRADE_RANDOM:
        result.log = `${player.name} 一处地产被降级`;
        result.specialEffect = 'downgrade';
        break;

      case CardEffectType.STEAL_PROPERTY: {
        const opponents = allPlayers.filter(p => p.id !== player.id && !p.bankrupt && p.ownedTiles.size > 0);
        if (opponents.length > 0) {
          const victim = this.rng.pick(opponents);
          const tileIds = [...victim.ownedTiles];
          if (tileIds.length > 0) {
            const stolenId = this.rng.pick(tileIds);
            victim.ownedTiles.delete(stolenId);
            player.ownedTiles.add(stolenId);
            result.log = `${player.name} 从 ${victim.name} 抢走地产 #${stolenId}`;
            result.affectedPlayers.push(victim.id);
            result.specialEffect = 'steal';
          }
        } else {
          result.log = '没有可偷的地产';
          result.success = false;
        }
        break;
      }

      case CardEffectType.EXCHANGE_POSITION: {
        const others = allPlayers.filter(p => p.id !== player.id && !p.bankrupt);
        if (others.length > 0) {
          const target = this.rng.pick(others);
          [player.currentTileId, target.currentTileId] = [target.currentTileId, player.currentTileId];
          [player.currentLayer, target.currentLayer] = [target.currentLayer, player.currentLayer];
          result.log = `${player.name} 与 ${target.name} 交换位置`;
          result.affectedPlayers.push(target.id);
          result.specialEffect = 'exchange';
        }
        break;
      }

      case CardEffectType.AUCTION_FORCE:
        result.log = `${player.name} 的一处地产被强制拍卖`;
        result.specialEffect = 'force_auction';
        break;

      case CardEffectType.DIVIDEND: {
        allPlayers.forEach(p => {
          if (!p.bankrupt) {
            p.addMoney(effect.value, '全民分红');
            result.affectedPlayers.push(p.id);
          }
        });
        result.log = `全民获得 $${effect.value} 红利`;
        result.moneyMovement = effect.value * allPlayers.length;
        break;
      }

      default:
        result.log = `${player.name}: ${effect.description}`;
        result.specialEffect = 'custom';
    }

    return result;
  }

  /** 检查卡牌条件 */
  checkConditions(conditions: CardCondition[], player: Player): boolean {
    for (const c of conditions) {
      if (c.minCash !== undefined && player.cash < c.minCash) return false;
      if (c.maxCash !== undefined && player.cash > c.maxCash) return false;
      if (c.minProperties !== undefined && player.ownedTiles.size < c.minProperties) return false;
      if (c.inJail !== undefined && player.inJail !== c.inJail) return false;
      if (c.minLayer !== undefined && player.currentLayer < c.minLayer) return false;
      if (c.hasStock !== undefined) {
        const hasStock = player.stockPortfolio.length > 0;
        if (c.hasStock && !hasStock) return false;
        if (!c.hasStock && hasStock) return false;
      }
    }
    return true;
  }

  /** 从牌堆中抽一张卡（考虑稀有度权重） */
  drawCard(cards: Card[], player: Player): Card | null {
    const available = cards.filter(c => {
      if (c.effects.length === 0) return true;
      return this.checkConditions(
        c.effects.filter(e => e.condition).map(e => e.condition!),
        player
      );
    });

    if (available.length === 0) return null;

    // 稀有度权重
    const weights = available.map(c => {
      switch (c.rarity) {
        case 'legendary': return 1;
        case 'rare': return 3;
        case 'uncommon': return 5;
        default: return 7;
      }
    });

    // Weighted random selection
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let r = this.rng.random() * totalWeight;
    for (let i = 0; i < available.length; i++) {
      r -= weights[i];
      if (r <= 0) return available[i];
    }
    return available[available.length - 1];
  }

  /** 获取执行日志 */
  getCardLog(): string[] { return [...this.cardLog]; }
  clearLog(): void { this.cardLog = []; }
  getExecutionCount(): number { return this.executionCount; }
  reset(): void { this.cardLog = []; this.executionCount = 0; }

  /** 获取卡牌统计 */
  getCardStats(): { total: number; byType: Record<string, number>; avgEffectsPerCard: number } {
    const byType: Record<string, number> = {};
    let totalEffects = 0;
    let totalCards = 0;

    for (const log of this.cardLog) {
      const type = log.split(':')[0] ?? 'unknown';
      byType[type] = (byType[type] ?? 0) + 1;
      totalCards++;
    }

    return {
      total: totalCards,
      byType,
      avgEffectsPerCard: totalCards > 0 ? totalEffects / totalCards : 0,
    };
  }

  /** 预览卡牌效果 */
  previewEffect(effect: CardEffect): string {
    switch (effect.type) {
      case CardEffectType.MONEY_ADD: return `+$${effect.value}`;
      case CardEffectType.MONEY_LOSE: return `-$${effect.value}`;
      case CardEffectType.MOVE_FORWARD: return `前进 ${effect.value} 步`;
      case CardEffectType.MOVE_BACKWARD: return `后退 ${effect.value} 步`;
      case CardEffectType.GO_TO_JAIL: return '入狱';
      case CardEffectType.GET_OUT_OF_JAIL: return '获得出狱卡';
      case CardEffectType.UPGRADE_FREE: return '免费升级';
      case CardEffectType.DOWNGRADE_RANDOM: return '地产降级';
      case CardEffectType.STEAL_PROPERTY: return '偷取地产';
      case CardEffectType.EXCHANGE_POSITION: return '交换位置';
      default: return effect.description;
    }
  }
}
