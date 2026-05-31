// ============================================================
// EventBus.ts — 泛型事件总线（发布-订阅模式）
// 解耦各模块通信，所有系统间消息通过此处流转
// ============================================================

export type EventMap = {
  'game.init': void;
  'game.start': void;
  'game.pause': void;
  'game.resume': void;
  'game.over': { winnerId: string };
  'turn.start': { playerId: string; turnNumber: number };
  'turn.end': { playerId: string };
  'dice.roll': { playerId: string; values: [number, number]; total: number };
  'player.move': { playerId: string; from: number; to: number; path: number[] };
  'player.land': { playerId: string; tileId: number };
  'money.change': { playerId: string; amount: number; reason: string; newBalance: number };
  'property.buy': { playerId: string; tileId: number; price: number };
  'property.upgrade': { playerId: string; tileId: number; level: number; cost: number };
  'property.rent': { ownerId: string; payerId: string; tileId: number; amount: number };
  'tile.trigger': { tileId: number; playerId: string };
  'card.draw': { playerId: string; cardId: string };
  'card.execute': { playerId: string; cardId: string };
  'auction.start': { tileId: number; startPrice: number };
  'auction.bid': { playerId: string; amount: number };
  'auction.end': { tileId: number; winnerId: string | null; price: number };
  'stock.update': { stockId: string; price: number; change: number };
  'stock.trade': { playerId: string; stockId: string; type: 'buy' | 'sell' | 'long' | 'short'; shares: number; price: number };
  'jail.enter': { playerId: string; turns: number };
  'jail.leave': { playerId: string; paid: number };
  'bankruptcy.start': { playerId: string };
  'bankruptcy.complete': { playerId: string; remaining: number };
  'layer.switch': { playerId: string; fromLayer: number; toLayer: number };
  'cpi.update': { value: number; multiplier: number };
  'network.connect': { roomCode: string };
  'network.disconnect': { playerId: string };
  'network.message': { type: string; payload: unknown; playerId?: string };
  'state.sync': { snapshot: GameSnapshot };
  'ui.button.click': { buttonId: string };
  'ui.modal.close': void;
  'camera.zoom': { scale: number };
  'camera.pan': { x: number; y: number };
};

export interface GameSnapshot {
  version: number;
  timestamp: number;
  players: unknown[];
  turn: unknown;
  economy: unknown;
  stocks: unknown[];
  seed: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEventMap = Record<string, any>;

export class EventBus<T extends AnyEventMap = EventMap> {
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  on<K extends keyof T>(event: K, handler: (payload: T[K]) => void): () => void {
    const key = event as string;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(handler as (...args: unknown[]) => void);
    return () => this.off(event, handler);
  }

  off<K extends keyof T>(event: K, handler: (payload: T[K]) => void): void {
    const key = event as string;
    this.listeners.get(key)?.delete(handler as (...args: unknown[]) => void);
  }

  emit<K extends keyof T>(event: K, payload: T[K]): void {
    const key = event as string;
    this.listeners.get(key)?.forEach(fn => fn(payload));
  }

  once<K extends keyof T>(event: K, handler: (payload: T[K]) => void): void {
    const wrapper = (payload: T[K]) => {
      this.off(event, wrapper);
      handler(payload);
    };
    this.on(event, wrapper);
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const bus = new EventBus();
