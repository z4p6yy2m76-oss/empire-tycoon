// ============================================================
// RandomGenerator.ts — 带种子的伪随机数生成器
// 使用 mulberry32 算法，支持回放确定性
// ============================================================

export class RandomGenerator {
  private state: number;
  private initialSeed: number;

  constructor(seed?: number) {
    this.initialSeed = seed ?? Date.now();
    this.state = this.initialSeed;
  }

  get seed(): number { return this.initialSeed; }

  reset(): void { this.state = this.initialSeed; }

  setSeed(seed: number): void {
    this.initialSeed = seed;
    this.state = seed;
  }

  /** mulberry32 生成 [0, 2^32) */
  private next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6D2B79F5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [0, 1) */
  random(): number {
    return this.next();
  }

  /** [min, max) */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** [min, max] 闭区间整数 */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** n 面骰子，1~n */
  dice(sides: number = 6): number {
    return this.int(1, sides);
  }

  /** 从数组中随机选择 */
  pick<T>(arr: T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** Fisher-Yates 洗牌 */
  shuffle<T>(arr: T[]): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /** 概率测试，p in [0,1] */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** 正态分布采样 (Box-Muller) */
  normal(mean: number = 0, stdDev: number = 1): number {
    const u1 = this.next() || 1e-10;
    const u2 = this.next();
    return mean + stdDev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /** 带权重的随机选择 */
  weighted<T>(items: T[], weights: number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
}
