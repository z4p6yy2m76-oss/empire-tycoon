// ============================================================
// AuctionSystem.ts — 拍卖系统
// 荷兰式拍卖：价格从高往下降，直到有人出价
// ============================================================

import { state } from '../core/StateManager';
import { bus } from '../core/EventBus';
import type { Player } from '../entities/Player';
import type { PropertyTile } from '../entities/Tile';

export enum AuctionPhase {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  ENDED = 'ENDED',
}

export class AuctionSystem {
  phase: AuctionPhase = AuctionPhase.IDLE;
  currentTile: PropertyTile | null = null;
  currentPrice: number = 0;
  minPrice: number = 0;
  priceStep: number = 100;
  bidders: Set<string> = new Set();
  winnerId: string | null = null;
  private decreaseInterval: number | null = null;

  /** 开始荷兰式拍卖 */
  startAuction(tile: PropertyTile, allPlayers: Player[]): void {
    this.phase = AuctionPhase.RUNNING;
    this.currentTile = tile;
    this.currentPrice = Math.floor(tile.getPrice() * 1.5);
    this.minPrice = Math.floor(tile.getPrice() * 0.2);
    this.priceStep = Math.floor(tile.getPrice() * 0.05);
    this.bidders = new Set(allPlayers.map(p => p.id));

    bus.emit('auction.start', {
      tileId: tile.id,
      startPrice: this.currentPrice,
    });
  }

  /** 价格下降一步 */
  tickPrice(): { currentPrice: number; minPrice: number; finished: boolean } {
    if (this.phase !== AuctionPhase.RUNNING) {
      return { currentPrice: this.currentPrice, minPrice: this.minPrice, finished: true };
    }

    this.currentPrice -= this.priceStep;
    if (this.currentPrice <= this.minPrice) {
      this.currentPrice = this.minPrice;
      this.endAuction(null);
      return { currentPrice: this.currentPrice, minPrice: this.minPrice, finished: true };
    }

    return { currentPrice: this.currentPrice, minPrice: this.minPrice, finished: false };
  }

  /** 玩家出价 */
  submitBid(player: Player): { accepted: boolean; message: string } {
    if (this.phase !== AuctionPhase.RUNNING) {
      return { accepted: false, message: '拍卖未进行中' };
    }

    if (!this.bidders.has(player.id)) {
      return { accepted: false, message: '你未参与此次拍卖' };
    }

    if (!player.canAfford(this.currentPrice)) {
      return { accepted: false, message: '资金不足' };
    }

    bus.emit('auction.bid', {
      playerId: player.id,
      amount: this.currentPrice,
    });

    this.endAuction(player.id);
    return { accepted: true, message: `出价成功! $${this.currentPrice}` };
  }

  /** 结束拍卖 */
  endAuction(winnerId: string | null): void {
    this.phase = AuctionPhase.ENDED;
    this.winnerId = winnerId;

    bus.emit('auction.end', {
      tileId: this.currentTile?.id ?? -1,
      winnerId,
      price: this.currentPrice,
    });

    if (winnerId && this.currentTile) {
      const player = state.getPlayer(winnerId);
      if (player && player.canAfford(this.currentPrice)) {
        player.cash -= this.currentPrice;
        this.currentTile.ownerId = winnerId;
        player.addProperty(this.currentTile.id, this.currentPrice);
      }
    }
  }

  /** 检查地块是否触发强制拍卖（玩家拒绝购买） */
  checkForceAuction(tile: PropertyTile, player: Player): boolean {
    if (tile.ownerId === null && player.id !== null && state.settings.enableAuction) {
      return true;
    }
    return false;
  }

  /** AI 竞价策略 */
  aiBidDecision(player: Player, personality: string): { shouldBid: boolean; maxPrice: number } {
    if (!this.currentTile) return { shouldBid: false, maxPrice: 0 };

    const fairPrice = this.currentTile.getPrice();
    let maxMultiplier = 0;

    switch (personality) {
      case 'aggressive': maxMultiplier = 1.3; break;
      case 'landlord':   maxMultiplier = 1.2; break;
      case 'gambler':    maxMultiplier = 1.1; break;
      case 'balanced':   maxMultiplier = 1.0; break;
      case 'conservative': maxMultiplier = 0.8; break;
      default:           maxMultiplier = 0.9;
    }

    const maxPrice = Math.floor(fairPrice * maxMultiplier);
    const shouldBid = this.currentPrice <= maxPrice && player.canAfford(this.currentPrice);

    return { shouldBid, maxPrice };
  }

  reset(): void {
    this.phase = AuctionPhase.IDLE;
    this.currentTile = null;
    this.currentPrice = 0;
    this.winnerId = null;
    this.bidders.clear();
    if (this.decreaseInterval !== null) {
      clearInterval(this.decreaseInterval);
      this.decreaseInterval = null;
    }
  }

  /** 获取拍卖状态摘要 */
  getStatusText(): string {
    if (this.phase === AuctionPhase.IDLE) return '无拍卖';
    if (this.phase === AuctionPhase.ENDED) return this.winnerId ? `已结束 - 胜者: ${this.winnerId}` : '流拍';
    return `进行中 - 当前价: $${this.currentPrice} - 底价: $${this.minPrice}`;
  }

  /** 预测建议出价（给 AI 用） */
  suggestBidPrice(tileValue: number): { suggestedBid: number; strategy: string } {
    // 低于市场价 80% 时建议出手
    if (this.currentPrice <= tileValue * 0.8) {
      return { suggestedBid: this.currentPrice, strategy: '立即出价 — 价格非常划算' };
    }

    // 等价格降一点
    if (this.currentPrice > tileValue * 1.1) {
      return { suggestedBid: 0, strategy: '等待降价 — 当前价格过高' };
    }

    return { suggestedBid: 0, strategy: '观望中 — 接近合理价位' };
  }

  /** 模拟拍卖结果（给困难 AI 用的预测） */
  predictOutcome(): { likelyWinner: string | null; estimatedPrice: number; confidence: number } {
    if (this.currentTile) {
      const fairPrice = this.currentTile.getPrice();
      const likelyPrice = Math.floor((this.currentPrice + this.minPrice) / 2);
      return {
        likelyWinner: this.bidders.size > 0 ? [...this.bidders][0] : null,
        estimatedPrice: Math.max(likelyPrice, this.minPrice),
        confidence: this.bidders.size === 1 ? 0.9 : this.bidders.size === 2 ? 0.6 : 0.3,
      };
    }
    return { likelyWinner: null, estimatedPrice: 0, confidence: 0 };
  }
}
