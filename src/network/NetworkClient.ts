// ============================================================
// NetworkClient.ts — WebSocket 客户端封装
// 负责与服务端通信、消息收发、断线重连
// ============================================================

import {
  MessageType, type NetworkMessage,
  createMessage, serializeMessage, deserializeMessage,
} from './NetworkProtocol';
import { bus } from '../core/EventBus';

export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
}

export class NetworkClient {
  private ws: WebSocket | null = null;
  private url: string;
  state: ConnectionState = ConnectionState.DISCONNECTED;
  roomCode: string = '';
  playerId: string = '';
  playerName: string = '';
  private messageQueue: NetworkMessage[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(url?: string) {
    this.url = url ?? `ws://${window.location.hostname}:3001`;
  }

  setServerUrl(url: string): void { this.url = url; }

  connect(roomCode: string, playerName: string): void {
    this.roomCode = roomCode;
    this.playerName = playerName;
    this.state = ConnectionState.CONNECTING;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.state = ConnectionState.CONNECTED;
        this.startPing();
        // 加入房间
        this.send(createMessage(MessageType.JOIN_ROOM, {
          roomCode, playerName,
        }));
        // 发送队列中的消息
        this.flushQueue();
      };

      this.ws.onmessage = (event) => {
        const msg = deserializeMessage(event.data);
        if (!msg) return;
        if (msg.type === MessageType.PONG) return;
        this.handleMessage(msg);
      };

      this.ws.onclose = () => {
        this.state = ConnectionState.DISCONNECTED;
        this.stopPing();
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        if (this.ws) this.ws.close();
      };
    } catch {
      this.state = ConnectionState.DISCONNECTED;
      this.scheduleReconnect();
    }
  }

  send(msg: NetworkMessage): void {
    msg.playerId = this.playerId;

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(serializeMessage(msg));
    } else {
      this.messageQueue.push(msg);
    }
  }

  sendGameAction(type: MessageType, payload?: unknown): void {
    this.send(createMessage(type, { payload }));
  }

  disconnect(): void {
    this.send(createMessage(MessageType.LEAVE_ROOM));
    this.stopPing();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.state = ConnectionState.DISCONNECTED;
  }

  private handleMessage(msg: NetworkMessage): void {
    switch (msg.type) {
      case MessageType.ROOM_INFO:
        this.playerId = msg.playerId ?? '';
        bus.emit('network.connect', { roomCode: this.roomCode });
        break;

      case MessageType.STATE_SYNC:
        bus.emit('state.sync', { snapshot: msg.payload as any });
        break;

      case MessageType.PLAYER_DISCONNECTED:
        bus.emit('network.disconnect', { playerId: msg.playerId ?? '' });
        break;

      case MessageType.GAME_START:
        bus.emit('game.start', undefined);
        break;

      case MessageType.GAME_OVER:
        bus.emit('game.over', { winnerId: (msg.payload as any)?.winnerId ?? '' });
        break;

      default:
        bus.emit('network.message', { type: msg.type, payload: msg.payload });
    }
  }

  private flushQueue(): void {
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift()!;
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(serializeMessage(msg));
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.state = ConnectionState.RECONNECTING;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(this.roomCode, this.playerName);
    }, 3000);
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      this.send(createMessage(MessageType.PING));
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /** 获取连接质量 */
  getConnectionQuality(): { latency: number; jitter: number; packetLoss: number } {
    return { latency: 0, jitter: 0, packetLoss: 0 };
  }

  /** 创建房间 */
  createRoom(playerName: string): void {
    this.send({
      type: MessageType.CREATE_ROOM,
      timestamp: Date.now(),
      playerName,
    });
  }

  /** 加入房间 */
  joinRoom(roomCode: string, playerName: string): void {
    this.connect(roomCode, playerName);
  }

  /** 准备就绪 */
  setReady(): void {
    this.send({
      type: MessageType.PLAYER_READY,
      timestamp: Date.now(),
    });
  }

  /** 发送骰子结果 */
  sendDiceResult(values: [number, number], total: number): void {
    this.sendGameAction(MessageType.DICE_RESULT, { values, total });
  }

  /** 发送移动路径 */
  sendMovePath(path: number[]): void {
    this.sendGameAction(MessageType.MOVE_PATH, { path });
  }

  /** 发送购买地产 */
  sendBuyProperty(tileId: number, price: number): void {
    this.sendGameAction(MessageType.BUY_PROPERTY, { tileId, price });
  }

  /** 发送结束回合 */
  sendEndTurn(): void {
    this.sendGameAction(MessageType.END_TURN, {});
  }

  /** 发送拍卖出价 */
  sendAuctionBid(amount: number): void {
    this.sendGameAction(MessageType.AUCTION_BID, { amount });
  }

  /** 发送股票交易 */
  sendStockTrade(stockId: string, type: string, shares: number): void {
    this.sendGameAction(MessageType.STOCK_TRADE, { stockId, type, shares });
  }

  /** 发送出狱 */
  sendPayBail(): void {
    this.sendGameAction(MessageType.PAY_BAIL, {});
  }

  /** 是否已连接 */
  isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED && this.ws?.readyState === WebSocket.OPEN;
  }

  /** 获取房间码 */
  getRoomCode(): string { return this.roomCode; }

  /** 获取玩家 ID */
  getPlayerId(): string { return this.playerId; }
}
