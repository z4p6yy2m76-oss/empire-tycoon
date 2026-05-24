// ============================================================
// NetworkProtocol.ts — 联机消息协议定义
// 所有联机通信的消息类型
// ============================================================

export enum MessageType {
  // 房间
  CREATE_ROOM = 'CREATE_ROOM',
  JOIN_ROOM = 'JOIN_ROOM',
  LEAVE_ROOM = 'LEAVE_ROOM',
  ROOM_INFO = 'ROOM_INFO',
  ROOM_ERROR = 'ROOM_ERROR',

  // 准备
  PLAYER_READY = 'PLAYER_READY',
  GAME_START = 'GAME_START',

  // 游戏操作
  ROLL_DICE = 'ROLL_DICE',
  DICE_RESULT = 'DICE_RESULT',
  PLAYER_MOVE = 'PLAYER_MOVE',
  MOVE_PATH = 'MOVE_PATH',
  BUY_PROPERTY = 'BUY_PROPERTY',
  UPGRADE_PROPERTY = 'UPGRADE_PROPERTY',
  AUCTION_BID = 'AUCTION_BID',
  STOCK_TRADE = 'STOCK_TRADE',
  USE_CARD = 'USE_CARD',
  END_TURN = 'END_TURN',
  PAY_BAIL = 'PAY_BAIL',

  // 同步
  STATE_SYNC = 'STATE_SYNC',
  TURN_SYNC = 'TURN_SYNC',

  // 系统
  PLAYER_DISCONNECTED = 'PLAYER_DISCONNECTED',
  PLAYER_RECONNECTED = 'PLAYER_RECONNECTED',
  GAME_OVER = 'GAME_OVER',
  PING = 'PING',
  PONG = 'PONG',
  ERROR = 'ERROR',
}

export interface NetworkMessage {
  type: MessageType;
  roomCode?: string;
  playerId?: string;
  playerName?: string;
  payload?: unknown;
  timestamp: number;
}

export function createMessage(type: MessageType, extra?: Partial<NetworkMessage>): NetworkMessage {
  return {
    type,
    timestamp: Date.now(),
    ...extra,
  };
}

export function serializeMessage(msg: NetworkMessage): string {
  return JSON.stringify(msg);
}

export function deserializeMessage(raw: string): NetworkMessage | null {
  try {
    return JSON.parse(raw) as NetworkMessage;
  } catch {
    return null;
  }
}

// ---- 消息验证 ----
export function validateMessage(msg: unknown): msg is NetworkMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return typeof m.type === 'string' && Object.values(MessageType).includes(m.type as MessageType);
}

// ---- 消息工厂 ----
export function createRoomCreateMessage(playerName: string): NetworkMessage {
  return createMessage(MessageType.CREATE_ROOM, { playerName });
}

export function createJoinRoomMessage(roomCode: string, playerName: string): NetworkMessage {
  return createMessage(MessageType.JOIN_ROOM, { roomCode, playerName });
}

export function createReadyMessage(): NetworkMessage {
  return createMessage(MessageType.PLAYER_READY);
}

export function createDiceResultMessage(values: [number, number], total: number): NetworkMessage {
  return createMessage(MessageType.DICE_RESULT, {
    payload: { values, total },
  });
}

export function createMovePathMessage(playerId: string, path: number[]): NetworkMessage {
  return createMessage(MessageType.MOVE_PATH, {
    playerId,
    payload: { path },
  });
}

export function createStateSyncMessage(state: unknown): NetworkMessage {
  return createMessage(MessageType.STATE_SYNC, {
    payload: state,
  });
}

export function createPingMessage(): NetworkMessage {
  return createMessage(MessageType.PING);
}

// ---- 错误码 ----
export enum NetworkError {
  ROOM_NOT_FOUND = 'ROOM_NOT_FOUND',
  ROOM_FULL = 'ROOM_FULL',
  GAME_ALREADY_STARTED = 'GAME_ALREADY_STARTED',
  PLAYER_NOT_IN_ROOM = 'PLAYER_NOT_IN_ROOM',
  INVALID_MESSAGE = 'INVALID_MESSAGE',
  CONNECTION_LOST = 'CONNECTION_LOST',
  RECONNECT_FAILED = 'RECONNECT_FAILED',
  TIMEOUT = 'TIMEOUT',
}

export function createErrorMessage(error: NetworkError, detail?: string): NetworkMessage {
  return createMessage(MessageType.ERROR, {
    payload: { error, detail },
  });
}

// ---- 延迟/心跳 ----
export class NetworkLatencyTracker {
  private samples: number[] = [];
  private maxSamples: number = 20;

  recordLatency(ms: number): void {
    this.samples.push(ms);
    if (this.samples.length > this.maxSamples) this.samples.shift();
  }

  getAverageLatency(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }

  getP95Latency(): number {
    if (this.samples.length === 0) return 0;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const idx = Math.ceil(sorted.length * 0.95) - 1;
    return sorted[idx];
  }

  reset(): void { this.samples = []; }
}
