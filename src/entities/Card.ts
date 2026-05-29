// ============================================================
// Card.ts — 卡牌实体及效果执行系统
// 所有卡牌效果数据驱动，通过 executeScript 函数执行
// ============================================================

import type { Player } from './Player';
import { state } from '../core/StateManager';

export enum CardType {
  CHANCE = 'CHANCE',     // 机会卡
  DESTINY = 'DESTINY',   // 命运卡
  SPECIAL = 'SPECIAL',   // 特殊卡
}

export enum CardEffectType {
  MONEY_ADD = 'MONEY_ADD',
  MONEY_LOSE = 'MONEY_LOSE',
  MONEY_FROM_ALL = 'MONEY_FROM_ALL',
  MONEY_TO_ALL = 'MONEY_TO_ALL',
  MOVE_FORWARD = 'MOVE_FORWARD',
  MOVE_BACKWARD = 'MOVE_BACKWARD',
  TELEPORT = 'TELEPORT',
  TELEPORT_LAYER = 'TELEPORT_LAYER',
  GO_TO_JAIL = 'GO_TO_JAIL',
  GET_OUT_OF_JAIL = 'GET_OUT_OF_JAIL',
  SKIP_TURN = 'SKIP_TURN',
  EXTRA_TURN = 'EXTRA_TURN',
  PROPERTY_TAX = 'PROPERTY_TAX',
  PROPERTY_REPAIR = 'PROPERTY_REPAIR',
  COLLECT_RENT = 'COLLECT_RENT',
  STOCK_BONUS = 'STOCK_BONUS',
  CPI_CHANGE = 'CPI_CHANGE',
  UPGRADE_FREE = 'UPGRADE_FREE',
  DOWNGRADE_RANDOM = 'DOWNGRADE_RANDOM',
  STEAL_PROPERTY = 'STEAL_PROPERTY',
  BANK_INTEREST = 'BANK_INTEREST',
  LOTTERY = 'LOTTERY',
  EXCHANGE_POSITION = 'EXCHANGE_POSITION',
  AUCTION_FORCE = 'AUCTION_FORCE',
  DIVIDEND = 'DIVIDEND',
}

export interface CardEffect {
  type: CardEffectType;
  value: number;
  target?: 'self' | 'random_opponent' | 'all_opponents' | 'all_players' | 'bank';
  description: string;
  condition?: CardCondition;
}

export interface CardCondition {
  minCash?: number;
  maxCash?: number;
  minProperties?: number;
  inJail?: boolean;
  minLayer?: number;
  hasStock?: boolean;
}

export interface CardConfig {
  id: string;
  name: string;
  type: CardType;
  effects: CardEffect[];
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  flavor: string;
}

export class Card {
  id: string;
  name: string;
  type: CardType;
  effects: CardEffect[];
  rarity: string;
  flavor: string;

  constructor(config: CardConfig) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.effects = config.effects;
    this.rarity = config.rarity;
    this.flavor = config.flavor;
  }

  /** 检查卡牌条件是否满足 */
  checkCondition(player: Player): boolean {
    if (!this.effects[0]?.condition) return true;
    const c = this.effects[0].condition;
    if (c.minCash !== undefined && player.cash < c.minCash) return false;
    if (c.maxCash !== undefined && player.cash > c.maxCash) return false;
    if (c.minProperties !== undefined && player.ownedTiles.size < c.minProperties) return false;
    if (c.inJail !== undefined && player.inJail !== c.inJail) return false;
    if (c.minLayer !== undefined && player.currentLayer < c.minLayer) return false;
    return true;
  }

  /** 获取卡牌效果摘要 */
  getSummary(): string {
    return this.effects.map(e => e.description).join('；');
  }
}

// ============================================================
// 卡牌执行器
// ============================================================
export function executeCardEffect(
  effect: CardEffect,
  player: Player,
  allPlayers: Player[],
  executeScript?: (cmd: string, ctx: Record<string, unknown>) => void,
): string {
  let logMsg = '';

  switch (effect.type) {
    case CardEffectType.MONEY_ADD:
      player.addMoney(effect.value, `卡牌: ${effect.description}`);
      logMsg = `${player.name} 获得 $${effect.value}`;
      break;

    case CardEffectType.MONEY_LOSE:
      player.payAmount(effect.value);
      logMsg = `${player.name} 失去 $${effect.value}`;
      break;

    case CardEffectType.MONEY_FROM_ALL: {
      const others = allPlayers.filter(p => p.id !== player.id && !p.bankrupt);
      const perPlayer = Math.floor(effect.value / Math.max(1, others.length));
      others.forEach(p => {
        if (p.payAmount(perPlayer)) player.addMoney(perPlayer, '收钱');
      });
      logMsg = `${player.name} 向每位对手收取 $${perPlayer}`;
      break;
    }

    case CardEffectType.MONEY_TO_ALL: {
      const others = allPlayers.filter(p => p.id !== player.id && !p.bankrupt);
      const perPlayer = Math.floor(effect.value / Math.max(1, others.length));
      const total = perPlayer * others.length;
      if (player.payAmount(total)) {
        others.forEach(p => p.addMoney(perPlayer, `${player.name} 派钱`));
      }
      logMsg = `${player.name} 向每位对手支付 $${perPlayer}`;
      break;
    }

    case CardEffectType.MOVE_FORWARD:
      player.stepsRemaining = effect.value;
      logMsg = `${player.name} 前进 ${effect.value} 步`;
      break;

    case CardEffectType.MOVE_BACKWARD:
      player.stepsRemaining = -effect.value;
      logMsg = `${player.name} 后退 ${effect.value} 步`;
      break;

    case CardEffectType.TELEPORT:
      player.currentTileId = effect.value;
      logMsg = `${player.name} 传送到格子 ${effect.value}`;
      break;

    case CardEffectType.GO_TO_JAIL:
      player.inJail = true;
      player.jailTurns = 3;
      logMsg = `${player.name} 被送进监狱`;
      break;

    case CardEffectType.GET_OUT_OF_JAIL:
      player.hasGetOutOfJailCard = true;
      logMsg = `${player.name} 获得出狱卡`;
      break;

    case CardEffectType.PROPERTY_TAX: {
      const tax = player.ownedTiles.size * effect.value;
      player.payAmount(tax);
      logMsg = `${player.name} 缴纳地产税 $${tax}`;
      break;
    }

    case CardEffectType.BANK_INTEREST:
      player.cash += Math.floor(player.bankSavings * effect.value);
      logMsg = `${player.name} 获得银行利息`;
      break;

    case CardEffectType.LOTTERY: {
      const won = Math.random() < effect.value;
      const prize = won ? 5000 : 0;
      if (won) player.addMoney(prize, '彩票中奖');
      logMsg = won ? `${player.name} 彩票中奖 $${prize}!` : `${player.name} 彩票没中...`;
      break;
    }

    case CardEffectType.COLLECT_RENT: {
      const rent = player.ownedTiles.size * 200;
      player.addMoney(rent, '统一收租');
      logMsg = `${player.name} 收取租金 $${rent}`;
      break;
    }

    case CardEffectType.SKIP_TURN:
      player.skipNextTurn = true;
      logMsg = `${player.name} 跳过下回合`;
      break;

    case CardEffectType.EXTRA_TURN:
      logMsg = `${player.name} 获得额外回合`;
      break;

    case CardEffectType.PROPERTY_REPAIR: {
      const cost = player.ownedTiles.size * (effect.value || 300);
      player.payAmount(cost);
      logMsg = `${player.name} 支付维修费 $${cost}`;
      break;
    }

    case CardEffectType.STOCK_BONUS:
      player.addMoney(effect.value || 2000, '股票红利');
      logMsg = `${player.name} 获得股票红利 $${effect.value || 2000}`;
      break;

    case CardEffectType.CPI_CHANGE:
      state.economy.cpi += effect.value;
      state.economy.cpiMultiplier = state.economy.cpi / 100;
      logMsg = `CPI ${effect.value > 0 ? '+' : ''}${effect.value}`;
      break;

    case CardEffectType.UPGRADE_FREE:
      logMsg = `${player.name} 获得免费升级机会`;
      break;

    case CardEffectType.DOWNGRADE_RANDOM: {
      const owned = [...player.ownedTiles];
      if (owned.length > 0) {
        const pick = owned[Math.floor(Math.random() * owned.length)];
        logMsg = `${player.name} 的地产 #${pick} 被降级`;
      } else {
        logMsg = `${player.name} 没有地产可降级`;
      }
      break;
    }

    case CardEffectType.STEAL_PROPERTY: {
      const targets = allPlayers.filter(p => p.id !== player.id && !p.bankrupt && p.ownedTiles.size > 0);
      if (targets.length > 0) {
        const victim = targets[Math.floor(Math.random() * targets.length)];
        const tileIds = [...victim.ownedTiles];
        const stolen = tileIds[Math.floor(Math.random() * tileIds.length)];
        victim.ownedTiles.delete(stolen);
        player.ownedTiles.add(stolen);
        logMsg = `${player.name} 偷走 ${victim.name} 的地产 #${stolen}`;
      } else {
        logMsg = '没有可偷的地产';
      }
      break;
    }

    case CardEffectType.EXCHANGE_POSITION: {
      const others = allPlayers.filter(p => p.id !== player.id && !p.bankrupt);
      if (others.length > 0) {
        const target = others[Math.floor(Math.random() * others.length)];
        [player.currentTileId, target.currentTileId] = [target.currentTileId, player.currentTileId];
        [player.currentLayer, target.currentLayer] = [target.currentLayer, player.currentLayer];
        logMsg = `${player.name} 与 ${target.name} 交换位置`;
      }
      break;
    }

    case CardEffectType.AUCTION_FORCE: {
      const owned = [...player.ownedTiles];
      if (owned.length > 0) {
        const pick = owned[Math.floor(Math.random() * owned.length)];
        player.ownedTiles.delete(pick);
        logMsg = `${player.name} 的地产 #${pick} 被强制拍卖`;
      }
      break;
    }

    case CardEffectType.DIVIDEND: {
      allPlayers.forEach(p => {
        if (!p.bankrupt) p.addMoney(effect.value || 1000, '全民分红');
      });
      logMsg = `全民获得 $${effect.value || 1000} 分红`;
      break;
    }

    case CardEffectType.TELEPORT_LAYER: {
      player.currentLayer = Math.min(2, Math.max(0, effect.value));
      player.currentTileId = -1; // 标记需要重置，由 main.ts 处理
      logMsg = `${player.name} 传送到第 ${player.currentLayer} 层`;
      break;
    }

    default:
      logMsg = `${player.name}: ${effect.description}`;
  }

  return logMsg;
}
