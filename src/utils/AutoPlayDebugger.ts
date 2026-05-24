// ============================================================
// AutoPlayDebugger.ts — AI 自动测试 + Bug 检测
// 全 AI 高速对战，监控状态异常，自动报告
// ============================================================

import { state, GamePhase, AIDifficulty } from '../core/StateManager';
import { bus } from '../core/EventBus';
import type { Player } from '../entities/Player';

export interface BugReport {
  turnNumber: number;
  severity: 'critical' | 'warning' | 'info';
  category: string;
  message: string;
  details: string;
}

export class AutoPlayDebugger {
  private bugs: BugReport[] = [];
  private running: boolean = false;
  private speed: number = 50; // ms between turns
  private maxTurns: number = 500;
  private turnCount: number = 0;
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  /** 启动自动测试 */
  start(speedMs: number = 50, maxTurns: number = 500): void {
    this.speed = speedMs;
    this.maxTurns = maxTurns;
    this.bugs = [];
    this.turnCount = 0;
    this.running = true;

    console.log('🤖 [AutoPlay] 启动自动测试...');
    console.log(`   速度: ${speedMs}ms/回合 | 上限: ${maxTurns} 回合`);

    // 监听异常事件
    this.watchEvents();

    // 定时检查
    this.checkInterval = setInterval(() => {
      if (!this.running) return;
      this.checkInvariants();
      this.turnCount++;

      if (this.turnCount >= this.maxTurns) {
        this.stop();
        this.printReport();
      }
    }, speedMs);
  }

  /** 停止 */
  stop(): void {
    this.running = false;
    if (this.checkInterval) { clearInterval(this.checkInterval); this.checkInterval = null; }
  }

  /** 状态不变量检查 */
  private checkInvariants(): void {
    const players = [...state.players.values()];

    // 1. 现金不能为负
    for (const p of players) {
      if (!p.bankrupt && p.cash < 0) {
        this.report('critical', 'NEGATIVE_CASH', `${p.name} 现金为负: $${p.cash}`, `playerId=${p.id}`);
      }
    }

    // 2. 银行余额不能为负
    for (const p of players) {
      if (p.bankSavings < 0) {
        this.report('critical', 'NEGATIVE_SAVINGS', `${p.name} 银行存款为负`, `playerId=${p.id}`);
      }
    }

    // 3. 破产玩家不应再拥有资产
    for (const p of players) {
      if (p.bankrupt && (p.cash > 0 || p.ownedTiles.size > 0)) {
        this.report('warning', 'BANKRUPT_ASSETS', `${p.name} 已破产但仍持有资产`, `cash=${p.cash} tiles=${p.ownedTiles.size}`);
      }
    }

    // 4. 地产所有权不应重复
    const tileOwners = new Map<number, string>();
    for (const p of players) {
      for (const tId of p.ownedTiles) {
        if (tileOwners.has(tId)) {
          this.report('critical', 'DUPLICATE_OWNER', `地块#${tId} 多人持有`, `${tileOwners.get(tId)} 和 ${p.id}`);
        }
        tileOwners.set(tId, p.id);
      }
    }

    // 5. 游戏不应卡死（长时间无状态变化）
    if (state.phase === GamePhase.ROLLING && this.turnCount - (state.turnNumber) > 10) {
      this.report('warning', 'STUCK_IN_ROLLING', '游戏卡在掷骰阶段超过 10 回合', `turn=${state.turnNumber}`);
    }

    // 6. 活跃玩家数检查
    const activeCount = players.filter(p => !p.bankrupt).length;
    if (activeCount === 0) {
      this.report('critical', 'NO_ACTIVE_PLAYERS', '没有活跃玩家', `players=${players.length}`);
    }

    // 7. 总金额守恒检查（粗略）
    const totalCash = players.reduce((s, p) => s + p.cash + p.bankSavings, 0);
    if (totalCash < 0) {
      this.report('warning', 'TOTAL_NEGATIVE', `系统总现金为负: $${totalCash}`, '可能存在金额泄漏');
    }
  }

  /** 监听游戏事件 */
  private watchEvents(): void {
    bus.on('turn.start', () => {
      if (!this.running) return;
      const p = state.getCurrentPlayer();
      if (p && !p.bankrupt && p.inJail) {
        // 监狱中的 AI 应自动处理
      }
    });

    bus.on('game.over', (data) => {
      if (!this.running) return;
      this.report('info', 'GAME_OVER', `游戏结束: 胜者 ${data.winnerId}`, `回合=${state.turnNumber}`);
      this.stop();
      this.printReport();
    });

    bus.on('bankruptcy.complete', (data) => {
      if (!this.running) return;
      const p = state.getPlayer(data.playerId);
      this.report('info', 'BANKRUPTCY', `${p?.name ?? data.playerId} 破产`, `剩余 ${state.getActivePlayers().length} 人`);
    });
  }

  /** 记录 Bug */
  private report(severity: BugReport['severity'], category: string, message: string, details: string): void {
    const bug: BugReport = {
      turnNumber: state.turnNumber,
      severity, category, message, details,
    };
    this.bugs.push(bug);

    const emoji = severity === 'critical' ? '🔴' : severity === 'warning' ? '🟡' : '🔵';
    console.log(`${emoji} [${category}] T${bug.turnNumber}: ${message} | ${details}`);
  }

  /** 输出报告 */
  printReport(): void {
    const criticals = this.bugs.filter(b => b.severity === 'critical').length;
    const warnings = this.bugs.filter(b => b.severity === 'warning').length;
    const infos = this.bugs.filter(b => b.severity === 'info').length;

    console.log('\n═══════════════════════════════════');
    console.log('📋 AutoPlay 测试报告');
    console.log(`   回合数: ${state.turnNumber}`);
    console.log(`   发现 Bug: 🔴${criticals} 🟡${warnings} 🔵${infos}`);
    if (this.bugs.length === 0) {
      console.log('   ✅ 未发现异常!');
    } else {
      console.log('   详情:');
      this.bugs.forEach(b => {
        console.log(`   ${b.severity === 'critical' ? '🔴' : b.severity === 'warning' ? '🟡' : '🔵'} [T${b.turnNumber}] ${b.message}`);
      });
    }
    console.log('═══════════════════════════════════\n');
  }

  getBugs(): BugReport[] { return [...this.bugs]; }
  getBugCount(): number { return this.bugs.length; }
  isRunning(): boolean { return this.running; }
}

export const debugger_ = new AutoPlayDebugger();
