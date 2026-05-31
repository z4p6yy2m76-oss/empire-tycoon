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
  private intentionalDisconnect: boolean = false; // 用户主动离开房间时不重连

  // ===== 联机展示配置 - Cloudflare Tunnel 适配 =====
  // 不再写死端口 3001，改为使用当前页面的域名 + /ws 路径
  // Vite 代理会把 /ws 转发到本机 WebSocket 服务器
  // 协议自动适配：本地用 ws://，Cloudflare Tunnel 环境用 wss://
  constructor(url?: string) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = url ?? `${proto}//${window.location.host}/ws`;
  }

  setServerUrl(url: string): void { this.url = url; }

  connect(roomCode: string, playerName: string, createNew: boolean = false): void {
    this.roomCode = roomCode;
    this.playerName = playerName;
    this.state = ConnectionState.CONNECTING;
    this.intentionalDisconnect = false; // 重置主动断开标记

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.state = ConnectionState.CONNECTED;
        this.startPing();
        // 创建房间 or 加入房间
        if (createNew) {
          this.send(createMessage(MessageType.CREATE_ROOM, { playerName }));
        } else {
          this.send(createMessage(MessageType.JOIN_ROOM, { roomCode, playerName }));
        }
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
    // 自动附加 playerId 和 roomCode，服务端靠这些字段定位房间和玩家
    msg.playerId = msg.playerId || this.playerId;
    msg.roomCode = msg.roomCode || this.roomCode;

    console.log('[NetClient] send type=', msg.type, 'roomCode=', msg.roomCode, 'playerId=', msg.playerId, 'ws.readyState=', this.ws?.readyState);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(serializeMessage(msg));
      console.log('[NetClient] 消息已通过 WebSocket 发送');
    } else {
      this.messageQueue.push(msg);
      console.log('[NetClient] WebSocket未打开, 消息入队列 (队列长度:', this.messageQueue.length, ')');
    }
  }

  sendGameAction(type: MessageType, payload?: unknown): void {
    this.send(createMessage(type, { payload }));
  }

  disconnect(): void {
    this.intentionalDisconnect = true; // 阻止自动重连
    this.send(createMessage(MessageType.LEAVE_ROOM));
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null; // 解绑 onclose，防止触发 scheduleReconnect
      this.ws.close();
      this.ws = null;
    }
    this.state = ConnectionState.DISCONNECTED;
    this.roomCode = '';
    this.playerId = '';
  }

  private handleMessage(msg: NetworkMessage): void {
    switch (msg.type) {
      // ===== 房间信息：更新 roomCode + 转发完整消息给 main.ts 处理玩家列表 =====
      case MessageType.ROOM_INFO:
        // 只在 playerId 尚未设置时写入（首次 ROOM_INFO 胜出）。
        // addPlayer 广播的 ROOM_INFO 携带的是新加入者的 playerId，不能覆盖本地已设的 ID。
        if (msg.playerId && !this.playerId) {
          this.playerId = msg.playerId;
          console.log('[NetClient] playerId 首次设置:', this.playerId);
        }
        if (msg.roomCode) this.roomCode = msg.roomCode;
        console.log('[NetClient] ROOM_INFO 处理完成, playerId:', this.playerId, 'roomCode:', this.roomCode);
        bus.emit('network.connect', { roomCode: this.roomCode });
        // 同时转发到 network.message，让 main.ts 重建玩家列表
        bus.emit('network.message', { type: msg.type, payload: msg.payload, playerId: msg.playerId });
        break;

      case MessageType.STATE_SYNC:
        bus.emit('state.sync', { snapshot: msg.payload as any });
        break;

      case MessageType.PLAYER_DISCONNECTED:
        bus.emit('network.disconnect', { playerId: msg.playerId ?? '' });
        break;

      // ===== 游戏开始：传递完整 payload + 同时转发到 network.message =====
      case MessageType.GAME_START:
        bus.emit('game.start', undefined);
        bus.emit('network.message', { type: msg.type, payload: msg.payload });
        break;

      case MessageType.GAME_OVER:
        bus.emit('game.over', { winnerId: (msg.payload as any)?.winnerId ?? '' });
        break;

      // ===== 其他消息（PLAYER_READY 等）统一走 network.message =====
      default:
        bus.emit('network.message', { type: msg.type, payload: msg.payload, playerId: msg.playerId });
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
    if (this.intentionalDisconnect) return; // 用户主动离开，不重连
    if (this.reconnectTimer) return;
    this.state = ConnectionState.RECONNECTING;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.intentionalDisconnect) {
        this.connect(this.roomCode, this.playerName);
      }
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

  /** 房主强制开局（需至少2人在房间） */
  forceStartGame(): void {
    console.log('[forceStartGame] ===== 客户端发起强制开局 =====');
    console.log('[forceStartGame] playerId:', this.playerId, '(空=true)');
    console.log('[forceStartGame] roomCode:', this.roomCode, '(空=true)');
    console.log('[forceStartGame] ws.readyState:', this.ws?.readyState, '(1=OPEN)');
    console.log('[forceStartGame] isConnected:', this.isConnected());
    this.send({
      type: MessageType.START_GAME,
      timestamp: Date.now(),
    });
    console.log('[forceStartGame] START_GAME 消息已调用 send()');
  }

  /** 准备就绪（加入者切换准备状态） */
  setReady(): void {
    console.log('[NetClient] setReady, ws.readyState=', this.ws?.readyState, 'roomCode=', this.roomCode, 'playerId=', this.playerId);
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
