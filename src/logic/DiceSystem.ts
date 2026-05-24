// ============================================================
// DiceSystem.ts — 骰子系统
// 管理投掷、双数连掷、监狱出狱判定
// ============================================================

import type { RandomGenerator } from '../core/RandomGenerator';
import { state } from '../core/StateManager';
import { bus } from '../core/EventBus';

export class DiceSystem {
  private rng: RandomGenerator;

  constructor(rng: RandomGenerator) {
    this.rng = rng;
  }

  /** 掷两个 6 面骰 */
  roll(): { values: [number, number]; total: number; isDoubles: boolean } {
    const d1 = this.rng.dice(6);
    const d2 = this.rng.dice(6);
    const total = d1 + d2;
    const isDoubles = d1 === d2;
    const values: [number, number] = [d1, d2];

    state.currentDice = values;

    if (isDoubles) {
      state.doublesCount++;
    } else {
      state.doublesCount = 0;
    }

    bus.emit('dice.roll', {
      playerId: state.getCurrentPlayerId(),
      values,
      total,
    });

    return { values, total, isDoubles };
  }

  /** 检查是否因连续双数入狱 */
  checkDoublesJail(): boolean {
    return state.doublesCount >= 3;
  }

  /** 监狱中尝试掷骰出狱 */
  rollForJail(): { values: [number, number]; isDoubles: boolean; escaped: boolean } {
    const d1 = this.rng.dice(6);
    const d2 = this.rng.dice(6);
    const isDoubles = d1 === d2;

    return { values: [d1, d2], isDoubles, escaped: isDoubles };
  }

  /** 获取步数 */
  getSteps(values: [number, number]): number {
    return values[0] + values[1];
  }

  /** 生成指定范围的随机步数（用于卡牌） */
  randomSteps(min: number, max: number): number {
    return this.rng.int(min, max);
  }

  /** 赌场轮盘赌 */
  casinoRoll(bet: number, choice: 'odd' | 'even' | number): { won: boolean; payout: number } {
    const result = this.rng.int(0, 36);
    let won = false;
    let multiplier = 0;

    if (typeof choice === 'number') {
      won = result === choice;
      multiplier = 35;
    } else if (choice === 'odd') {
      won = result % 2 === 1;
      multiplier = 2;
    } else {
      won = result % 2 === 0 && result !== 0;
      multiplier = 2;
    }

    return { won, payout: won ? bet * multiplier : 0 };
  }

  /** 赌场猜大小 */
  casinoDice(bet: number, choice: 'big' | 'small'): { won: boolean; payout: number } {
    const d1 = this.rng.dice(6);
    const d2 = this.rng.dice(6);
    const d3 = this.rng.dice(6);
    const total = d1 + d2 + d3;
    const isBig = total >= 11 && total <= 17;
    const isTriple = d1 === d2 && d2 === d3;

    const won = choice === 'big' ? (isBig && !isTriple) : (!isBig && !isTriple);
    return { won, payout: won ? bet * 2 : 0 };
  }
}
