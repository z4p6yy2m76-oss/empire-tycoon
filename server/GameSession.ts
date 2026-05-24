// ============================================================
// GameSession.ts — 游戏会话管理
// 维护一个房间的游戏状态、回合控制、断线恢复
// ============================================================

import type { NetworkMessage } from '../src/network/NetworkProtocol';
import { MessageType } from '../src/network/NetworkProtocol';

export interface SessionPlayer {
  id: string;
  name: string;
  ws: import('ws').WebSocket;
  ready: boolean;
  connected: boolean;
  color: string;
}

export class GameSession {
  roomCode: string;
  players: Map<string, SessionPlayer> = new Map();
  playerOrder: string[] = [];
  currentPlayerIndex: number = 0;
  gameStarted: boolean = false;

  // 保存完整游戏状态用于断线重连
  gameState: unknown = null;
  private stateHistory: unknown[] = [];

  constructor(roomCode: string) {
    this.roomCode = roomCode;
  }

  addPlayer(id: string, name: string, ws: import('ws').WebSocket, color: string): boolean {
    if (this.players.size >= 4) return false;
    if (this.gameStarted) return false;

    this.players.set(id, { id, name, ws, ready: false, connected: true, color });
    this.playerOrder.push(id);

    // 通知所有人
    this.broadcast({
      type: MessageType.ROOM_INFO,
      roomCode: this.roomCode,
      playerId: id,
      playerName: name,
      timestamp: Date.now(),
      payload: {
        players: [...this.players.values()].map(p => ({
          id: p.id, name: p.name, ready: p.ready, connected: p.connected, color: p.color,
        })),
      },
    });

    return true;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    this.playerOrder = this.playerOrder.filter(pid => pid !== id);

    this.broadcast({
      type: MessageType.PLAYER_DISCONNECTED,
      playerId: id,
      timestamp: Date.now(),
    });
  }

  setReady(playerId: string): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;
    player.ready = true;

    // 检查所有人是否就绪
    const allReady = [...this.players.values()].every(p => p.ready);
    if (allReady && this.players.size >= 2) {
      this.startGame();
      return true;
    }
    return false;
  }

  startGame(): void {
    this.gameStarted = true;
    this.currentPlayerIndex = 0;
    const firstPlayer = this.players.get(this.playerOrder[0]);

    this.broadcast({
      type: MessageType.GAME_START,
      timestamp: Date.now(),
      payload: {
        playerOrder: this.playerOrder,
        firstPlayer: firstPlayer?.id ?? '',
        players: [...this.players.values()].map(p => ({
          id: p.id, name: p.name, color: p.color, ready: p.ready,
        })),
      },
    });
  }

  /** 处理游戏操作消息，广播给其他玩家 */
  relayAction(fromId: string, msg: NetworkMessage): void {
    // 保存状态快照
    if (msg.type === MessageType.STATE_SYNC) {
      this.gameState = msg.payload;
      this.stateHistory.push(msg.payload);
      if (this.stateHistory.length > 20) this.stateHistory.shift();
    }

    // 广播给所有其他玩家
    for (const [id, player] of this.players) {
      if (id !== fromId && player.connected && player.ws.readyState === 1) {
        player.ws.send(JSON.stringify(msg));
      }
    }
  }

  /** 广播给所有人 */
  broadcast(msg: NetworkMessage): void {
    const data = JSON.stringify(msg);
    for (const [, player] of this.players) {
      if (player.connected && player.ws.readyState === 1) {
        player.ws.send(data);
      }
    }
  }

  /** 广播给指定玩家 */
  sendTo(playerId: string, msg: NetworkMessage): void {
    const player = this.players.get(playerId);
    if (player && player.connected && player.ws.readyState === 1) {
      player.ws.send(JSON.stringify(msg));
    }
  }

  /** 处理断线 */
  handleDisconnect(playerId: string): void {
    const player = this.players.get(playerId);
    if (player) {
      player.connected = false;
      this.broadcast({
        type: MessageType.PLAYER_DISCONNECTED,
        playerId,
        timestamp: Date.now(),
      });
    }
  }

  /** 处理重连 */
  handleReconnect(playerId: string, ws: import('ws').WebSocket): void {
    const player = this.players.get(playerId);
    if (!player) return;

    player.connected = true;
    player.ws = ws;

    // 发送完整状态恢复
    if (this.gameState) {
      ws.send(JSON.stringify({
        type: MessageType.STATE_SYNC,
        timestamp: Date.now(),
        payload: {
          ...(this.gameState as object),
          currentPlayerIndex: this.currentPlayerIndex,
        },
      }));
    }

    this.broadcast({
      type: MessageType.PLAYER_RECONNECTED,
      playerId,
      timestamp: Date.now(),
    });
  }

  /** 推进到下一玩家 */
  nextPlayer(): string | null {
    if (this.playerOrder.length === 0) return null;

    const activePlayers = this.playerOrder.filter(id => this.players.has(id));
    if (activePlayers.length === 0) return null;

    const currentId = this.playerOrder[this.currentPlayerIndex];
    const activeIdx = activePlayers.indexOf(currentId);
    const nextIdx = (activeIdx + 1) % activePlayers.length;
    this.currentPlayerIndex = this.playerOrder.indexOf(activePlayers[nextIdx]);

    return activePlayers[nextIdx];
  }

  getPlayerCount(): number { return this.players.size; }
  getCurrentPlayer(): SessionPlayer | undefined {
    return this.players.get(this.playerOrder[this.currentPlayerIndex]);
  }

  isEmpty(): boolean {
    return this.players.size === 0 || [...this.players.values()].every(p => !p.connected);
  }

  /** 获取房间摘要信息 */
  getSummary(): object {
    return {
      roomCode: this.roomCode,
      playerCount: this.players.size,
      gameStarted: this.gameStarted,
      currentTurn: this.currentPlayerIndex,
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, ready: p.ready, connected: p.connected,
      })),
    };
  }

  /** 验证操作是否合法 */
  validateAction(playerId: string, actionType: string): { valid: boolean; reason: string } {
    if (!this.gameStarted) {
      return { valid: false, reason: '游戏尚未开始' };
    }

    const currentPlayer = this.getCurrentPlayer();
    if (!currentPlayer) {
      return { valid: false, reason: '找不到当前玩家' };
    }

    if (currentPlayer.id !== playerId) {
      return { valid: false, reason: '不是你的回合' };
    }

    // 验证具体操作类型的合法性
    const validActions = [
      'ROLL_DICE', 'DICE_RESULT', 'PLAYER_MOVE', 'BUY_PROPERTY',
      'UPGRADE_PROPERTY', 'AUCTION_BID', 'STOCK_TRADE',
      'USE_CARD', 'END_TURN', 'PAY_BAIL', 'SKIP',
    ];

    if (!validActions.includes(actionType)) {
      return { valid: false, reason: `无效的操作类型: ${actionType}` };
    }

    return { valid: true, reason: 'ok' };
  }

  /** 强制踢出玩家 */
  kickPlayer(playerId: string): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;

    // 关闭连接
    if (player.ws.readyState === 1) {
      player.ws.close(4001, '你被踢出房间');
    }

    this.removePlayer(playerId);
    return true;
  }

  /** 房间是否可加入 */
  canJoin(): boolean {
    return !this.gameStarted && this.players.size < 4;
  }

  /** 获取房主 ID */
  getHostId(): string | undefined {
    return this.playerOrder[0];
  }

  /** 转交房主 */
  transferHost(oldHostId: string): string | undefined {
    const idx = this.playerOrder.indexOf(oldHostId);
    if (idx < 0) return undefined;

    // 找到下一个在线玩家
    for (let i = 1; i < this.playerOrder.length; i++) {
      const nextId = this.playerOrder[(idx + i) % this.playerOrder.length];
      const next = this.players.get(nextId);
      if (next && next.connected) {
        // 交换到第一个位置
        this.playerOrder.splice(idx, 1);
        this.playerOrder.unshift(oldHostId);
        // Actually make the new host first
        this.playerOrder = this.playerOrder.filter(id => id !== nextId);
        this.playerOrder.unshift(nextId);
        return nextId;
      }
    }

    return undefined;
  }
}

export default GameSession;
