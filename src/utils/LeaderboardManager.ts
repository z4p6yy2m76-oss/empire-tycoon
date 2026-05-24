// ============================================================
// LeaderboardManager.ts — 排行榜系统
// 追踪历史最高分、排名记录
// ============================================================

export interface LeaderboardEntry {
  rank: number;
  playerName: string;
  netWorth: number;
  properties: number;
  turnCount: number;
  aiDifficulty: string;
  date: string;
  gameMode: string;
  achievements: number;
  duration: number;
}

export class LeaderboardManager {
  private static STORAGE_KEY = 'empire-tycoon-leaderboard';
  private entries: LeaderboardEntry[] = [];
  private maxEntries: number = 50;

  constructor() {
    this.load();
  }

  /** 添加新的排行榜记录 */
  addEntry(entry: Omit<LeaderboardEntry, 'rank' | 'date'>): LeaderboardEntry {
    const ranked: LeaderboardEntry = {
      ...entry,
      rank: 0,
      date: new Date().toISOString(),
    };

    this.entries.push(ranked);
    this.entries.sort((a, b) => b.netWorth - a.netWorth);
    this.reRank();
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(0, this.maxEntries);
    }

    this.save();
    return ranked;
  }

  /** 重新排名 */
  private reRank(): void {
    this.entries.forEach((e, i) => { e.rank = i + 1; });
  }

  /** 获取排行榜 */
  getEntries(): LeaderboardEntry[] {
    return [...this.entries];
  }

  /** 获取前 N 名 */
  getTopN(n: number = 10): LeaderboardEntry[] {
    return this.entries.slice(0, n);
  }

  /** 获取玩家最佳成绩 */
  getBestForPlayer(playerName: string): LeaderboardEntry | undefined {
    return this.entries
      .filter(e => e.playerName === playerName)
      .sort((a, b) => b.netWorth - a.netWorth)[0];
  }

  /** 按模式过滤 */
  getByMode(mode: string): LeaderboardEntry[] {
    return this.entries.filter(e => e.gameMode === mode);
  }

  /** 按难度过滤 */
  getByDifficulty(difficulty: string): LeaderboardEntry[] {
    return this.entries.filter(e => e.aiDifficulty === difficulty);
  }

  /** 获取统计 */
  getStatistics(): {
    totalEntries: number;
    averageNetWorth: number;
    averageTurns: number;
    mostCommonMode: string;
    highestEver: LeaderboardEntry | null;
  } {
    if (this.entries.length === 0) {
      return {
        totalEntries: 0, averageNetWorth: 0, averageTurns: 0,
        mostCommonMode: 'N/A', highestEver: null,
      };
    }

    const avgWorth = this.entries.reduce((s, e) => s + e.netWorth, 0) / this.entries.length;
    const avgTurns = this.entries.reduce((s, e) => s + e.turnCount, 0) / this.entries.length;

    const modeCounts = new Map<string, number>();
    for (const e of this.entries) {
      modeCounts.set(e.gameMode, (modeCounts.get(e.gameMode) ?? 0) + 1);
    }
    const mostCommon = [...modeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A';

    return {
      totalEntries: this.entries.length,
      averageNetWorth: Math.round(avgWorth),
      averageTurns: Math.round(avgTurns),
      mostCommonMode: mostCommon,
      highestEver: this.entries[0] ?? null,
    };
  }

  /** 清空排行榜 */
  clear(): void {
    this.entries = [];
    this.save();
  }

  /** 导出 CSV */
  exportCSV(): string {
    const header = '排名,玩家,资产,地产数,回合数,难度,模式,成就数,时长,日期';
    const rows = this.entries.map(e =>
      `${e.rank},${e.playerName},${e.netWorth},${e.properties},${e.turnCount},${e.aiDifficulty},${e.gameMode},${e.achievements},${e.duration},${e.date}`
    );
    return [header, ...rows].join('\n');
  }

  private save(): void {
    try {
      localStorage.setItem(LeaderboardManager.STORAGE_KEY, JSON.stringify(this.entries));
    } catch { /* ignore */ }
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(LeaderboardManager.STORAGE_KEY);
      if (raw) this.entries = JSON.parse(raw);
    } catch {
      this.entries = [];
    }
  }
}

export const leaderboard = new LeaderboardManager();
