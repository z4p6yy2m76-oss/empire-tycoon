// ============================================================
// AchievementSystem.ts — 成就系统
// 追踪玩家成就、解锁条件、奖励
// ============================================================

import type { Player } from '../entities/Player';
import { state } from '../core/StateManager';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  check: (player: Player) => boolean;
  reward?: () => void;
  hidden?: boolean;
}

export enum AchievementCategory {
  WEALTH = 'WEALTH',
  PROPERTY = 'PROPERTY',
  TRADING = 'TRADING',
  SOCIAL = 'SOCIAL',
  SKILL = 'SKILL',
  SPECIAL = 'SPECIAL',
}

export interface UnlockedAchievement {
  achievementId: string;
  playerId: string;
  turnNumber: number;
  timestamp: number;
}

export class AchievementSystem {
  private achievements: Map<string, Achievement> = new Map();
  private unlocked: UnlockedAchievement[] = [];

  constructor() {
    this.registerAchievements();
  }

  private registerAchievements(): void {
    const list: Achievement[] = [
      {
        id: 'first_million', name: '第一个一百万', description: '净资产达到 $1,000,000',
        icon: '💰', category: AchievementCategory.WEALTH,
        check: (p) => p.netWorth >= 1_000_000,
      },
      {
        id: 'millionaire', name: '百万富翁', description: '现金达到 $100,000',
        icon: '💵', category: AchievementCategory.WEALTH,
        check: (p) => p.cash >= 100_000,
      },
      {
        id: 'landlord_5', name: '小地主', description: '拥有 5 处地产',
        icon: '🏠', category: AchievementCategory.PROPERTY,
        check: (p) => p.ownedTiles.size >= 5,
      },
      {
        id: 'landlord_15', name: '大地主', description: '拥有 15 处地产',
        icon: '🏰', category: AchievementCategory.PROPERTY,
        check: (p) => p.ownedTiles.size >= 15,
      },
      {
        id: 'monopoly', name: '垄断者', description: '垄断一个色组的所有地产',
        icon: '👑', category: AchievementCategory.PROPERTY,
        check: (p) => p.ownedTiles.size >= 3,

      },
      {
        id: 'max_upgrade', name: '满级建筑', description: '将一处地产升到最高级',
        icon: '🏗️', category: AchievementCategory.PROPERTY,
        check: (_p) => true,
      },
      {
        id: 'stock_trader', name: '股票交易员', description: '完成 10 次股票交易',
        icon: '📈', category: AchievementCategory.TRADING,
        check: (_p) => true,
      },
      {
        id: 'short_seller', name: '空头之王', description: '做空赚取 $5,000 以上',
        icon: '📉', category: AchievementCategory.TRADING,
        check: (_p) => true,
      },
      {
        id: 'auction_win_3', name: '拍卖行家', description: '赢得 3 次拍卖',
        icon: '🔨', category: AchievementCategory.TRADING,
        check: (_p) => true,
      },
      {
        id: 'bankrupt_opponent', name: '商战胜利', description: '让对手破产',
        icon: '💀', category: AchievementCategory.SOCIAL,
        check: (_p) => true,
      },
      {
        id: 'jail_escape', name: '越狱高手', description: '掷对子成功出狱',
        icon: '🔓', category: AchievementCategory.SKILL,
        check: (_p) => true,
      },
      {
        id: 'casino_win', name: '赌神附体', description: '在赌场赢 $10,000',
        icon: '🎰', category: AchievementCategory.SKILL,
        check: (_p) => true,
      },
      {
        id: 'lucky_draw', name: '天选之人', description: '抽到传说级卡牌',
        icon: '✨', category: AchievementCategory.SPECIAL,
        check: (_p) => true,
      },
      {
        id: 'no_loans', name: '无债一身轻', description: '从没借过贷款到达第 20 回合',
        icon: '🛡️', category: AchievementCategory.SKILL,
        check: (_p) => true,
      },
      {
        id: 'layer_traveler', name: '层间旅者', description: '在一局中完成所有层间跳转',
        icon: '🚇', category: AchievementCategory.SPECIAL,
        check: (_p) => true,
      },
      {
        id: 'comeback', name: '绝地翻盘', description: '现金低于 $500 后最终获胜',
        icon: '🔥', category: AchievementCategory.SPECIAL,
        check: (_p) => true,
        hidden: true,
      },
      {
        id: 'speedrun', name: '闪电战', description: '在 20 回合内获胜',
        icon: '⚡', category: AchievementCategory.SPECIAL,
        check: (_p) => true,
        hidden: true,
      },
      {
        id: 'pacifist', name: '和平主义者', description: '从不收取过路费并获胜',
        icon: '☮️', category: AchievementCategory.SPECIAL,
        check: (_p) => true,
        hidden: true,
      },
    ];

    for (const a of list) {
      this.achievements.set(a.id, a);
    }
  }

  /** 检查所有成就 */
  checkAll(player: Player): Achievement[] {
    const newlyUnlocked: Achievement[] = [];
    for (const [, achievement] of this.achievements) {
      if (this.isUnlocked(achievement.id, player.id)) continue;
      if (achievement.check(player)) {
        this.unlock(achievement.id, player.id);
        newlyUnlocked.push(achievement);
      }
    }
    return newlyUnlocked;
  }

  /** 检查单个成就 */
  checkAchievement(achievementId: string, player: Player): boolean {
    const achievement = this.achievements.get(achievementId);
    if (!achievement) return false;
    if (this.isUnlocked(achievementId, player.id)) return false;
    if (achievement.check(player)) {
      this.unlock(achievementId, player.id);
      return true;
    }
    return false;
  }

  /** 解锁成就 */
  private unlock(achievementId: string, playerId: string): void {
    this.unlocked.push({
      achievementId,
      playerId,
      turnNumber: state.turnNumber,
      timestamp: Date.now(),
    });
  }

  /** 检查是否已解锁 */
  isUnlocked(achievementId: string, playerId: string): boolean {
    return this.unlocked.some(
      u => u.achievementId === achievementId && u.playerId === playerId
    );
  }

  /** 获取玩家的已解锁成就 */
  getPlayerAchievements(playerId: string): { achievement: Achievement; unlockedAt: UnlockedAchievement }[] {
    return this.unlocked
      .filter(u => u.playerId === playerId)
      .map(u => ({
        achievement: this.achievements.get(u.achievementId)!,
        unlockedAt: u,
      }))
      .filter(x => x.achievement);
  }

  /** 获取所有成就（包括未解锁的） */
  getAllAchievements(): Achievement[] {
    return [...this.achievements.values()];
  }

  /** 按分类获取 */
  getByCategory(category: AchievementCategory): Achievement[] {
    return [...this.achievements.values()].filter(a => a.category === category);
  }

  /** 获取成就进度 */
  getProgress(playerId: string): { unlocked: number; total: number; percent: number } {
    const total = this.achievements.size;
    const unlocked = this.unlocked.filter(u => u.playerId === playerId).length;
    return { unlocked, total, percent: total > 0 ? unlocked / total : 0 };
  }

  reset(): void {
    this.unlocked = [];
  }
}
