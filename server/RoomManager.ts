// ============================================================
// RoomManager.ts — 房间管理
// 创建/销毁房间、生成房间码、查询房间
// ============================================================

import { GameSession } from './GameSession';
import type { NetworkMessage } from '../src/network/NetworkProtocol';

export class RoomManager {
  private rooms: Map<string, GameSession> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    // 每5分钟清理空房间
    this.cleanupTimer = setInterval(() => this.cleanup(), 300000);
  }

  /** 生成 4 位房间码 */
  createRoom(): { roomCode: string; session: GameSession } {
    const roomCode = this.generateCode();
    const session = new GameSession(roomCode);
    this.rooms.set(roomCode, session);
    return { roomCode, session };
  }

  /** 查找房间 */
  getRoom(roomCode: string): GameSession | undefined {
    return this.rooms.get(roomCode);
  }

  /** 加入房间 */
  joinRoom(
    roomCode: string,
    playerId: string,
    playerName: string,
    ws: import('ws').WebSocket,
  ): { success: boolean; message: string; session?: GameSession } {
    const session = this.rooms.get(roomCode);
    if (!session) return { success: false, message: '房间不存在' };
    if (session.gameStarted) return { success: false, message: '游戏已开始' };
    if (session.players.size >= 4) return { success: false, message: '房间已满' };

    const colors = ['#E74C3C', '#3498DB', '#2ECC71', '#F39C12'];
    const color = colors[session.players.size % colors.length];

    const added = session.addPlayer(playerId, playerName, ws, color);
    if (!added) return { success: false, message: '加入失败' };

    return { success: true, message: '加入成功', session };
  }

  /** 销毁房间 */
  destroyRoom(roomCode: string): void {
    this.rooms.delete(roomCode);
  }

  /** 获取所有房间码 */
  getRoomCodes(): string[] {
    return [...this.rooms.keys()];
  }

  /** 清空房间 */
  cleanup(): void {
    for (const [code, session] of this.rooms) {
      if (session.isEmpty()) {
        this.rooms.delete(code);
      }
    }
  }

  /** 生成不重复的 4 位码 */
  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing I/O/0/1
    let code: string;
    do {
      code = '';
      for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
    } while (this.rooms.has(code));
    return code;
  }

  shutdown(): void {
    clearInterval(this.cleanupTimer);
    this.rooms.clear();
  }
}
