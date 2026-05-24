// ============================================================
// TurnSystem.ts — 回合控制系统
// 管理回合流程：掷骰→移动→触发→过渡→下一人
// ============================================================

import { GamePhase, state } from '../core/StateManager';
import { bus } from '../core/EventBus';
import type { Player } from '../entities/Player';

export enum TurnStep {
  IDLE = 'IDLE',
  ROLL_DICE = 'ROLL_DICE',
  MOVE = 'MOVE',
  LAND = 'LAND',
  RESOLVE = 'RESOLVE',
  END = 'END',
}

export class TurnSystem {
  currentStep: TurnStep = TurnStep.IDLE;

  /** 开始新回合 */
  beginTurn(player: Player): void {
    this.currentStep = TurnStep.ROLL_DICE;
    state.phase = GamePhase.ROLLING;
    state.turnNumber++;
    if (player.id === state.playerOrder[0]) {
      state.roundNumber++;
    }
    player.turnsPlayed++;
    bus.emit('turn.start', { playerId: player.id, turnNumber: state.turnNumber });
  }

  /** 掷骰完成后的移动阶段 */
  startMove(player: Player, steps: number): void {
    this.currentStep = TurnStep.MOVE;
    state.phase = GamePhase.MOVING;
    player.stepsRemaining = steps;
  }

  /** 移动完成后触发格子效果 */
  startLand(player: Player, tileId: number): void {
    this.currentStep = TurnStep.LAND;
    state.phase = GamePhase.TILE_TRIGGER;
    bus.emit('player.land', { playerId: player.id, tileId });
    bus.emit('tile.trigger', { tileId, playerId: player.id });
  }

  /** 格子效果处理完后 */
  resolveStep(player: Player): void {
    this.currentStep = TurnStep.RESOLVE;
  }

  /** 结束当前玩家的回合 */
  endTurn(player: Player): void {
    this.currentStep = TurnStep.END;
    player.tickBuffs();
    state.doublesCount = 0;
    bus.emit('turn.end', { playerId: player.id });

    // 检查游戏结束条件
    const activePlayers = state.getActivePlayers();
    if (activePlayers.length <= 1) {
      state.phase = GamePhase.GAME_OVER;
      bus.emit('game.over', {
        winnerId: activePlayers[0]?.id ?? 'none',
      });
      return;
    }

    // 下一玩家
    state.advancePlayer();
    const nextPlayer = state.getCurrentPlayer();

    if (nextPlayer) {
      if (nextPlayer.skipNextTurn) {
        nextPlayer.skipNextTurn = false;
        state.advancePlayer();
      }
      state.phase = GamePhase.TURN_TRANSITION;
    }
  }

  /** 处理跳过回合等特殊情况 */
  shouldSkipTurn(player: Player): boolean {
    if (player.bankrupt) return true;
    if (player.skipNextTurn) {
      player.skipNextTurn = false;
      return true;
    }
    return false;
  }

  /** 获取当前活跃玩家人数 */
  getActiveCount(): number {
    return state.getActivePlayers().length;
  }

  /** 检查是否游戏结束 */
  checkGameOver(): boolean {
    return this.getActiveCount() <= 1;
  }
}
