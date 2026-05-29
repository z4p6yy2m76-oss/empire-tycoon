// ============================================================
// Renderer.ts — 主渲染器（棋盘+棋子+粒子）
// UI 已迁移到 HTML/CSS（src/ui/），Canvas 只负责游戏画面
// ============================================================

import type { MapLayerConfig, MapTileConfig } from '../data/MapConfig';
import { TileType } from '../entities/Tile';
import type { Player } from '../entities/Player';
import { state } from '../core/StateManager';
import { Camera } from './Camera';
import { Effects } from './Effects';
import { computeLayout, type GameLayout } from './LayoutConfig';

// 棋盘固有尺寸（与MapConfig一致）
const BOARD_W = 1000;
const BOARD_H = 720;

const COLORS = {
  bg: '#1a1a2e',
  tileBg: '#16213e',
  tileBorder: '#0f3460',
  start: '#2ECC71',
  property: '#F39C12',
  event: '#3498DB',
  jail: '#E74C3C',
  casino: '#E91E63',
  stock: '#FFD700',
  bank: '#1ABC9C',
  subway: '#9B59B6',
  tax: '#E67E22',
  airport: '#5DADE2',
  text: '#ECF0F1',
  gold: '#FFD700',
  layerColors: ['#E8D5B7', '#5D6D7E', '#AED6F1'],
};

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  camera: Camera;
  effects: Effects;
  private mapLayers: MapLayerConfig[] = [];
  private currentLayerIndex: number = 0;
  private players: Player[] = [];
  private propLevels: Map<number, number> = new Map();
  private layout!: GameLayout; // 动态布局，resize时更新
  // AI 气泡
  private bubbles: Array<{ x: number; y: number; text: string; color: string; life: number }> = [];
  // 经济周期视觉效果
  economyCycle: string = 'NORMAL';
  private cycleParticles: Array<{ x: number; y: number; vy: number; life: number; maxLife: number; size: number; color: string }> = [];

  private animProgress: number = 0;
  private animPath: number[] = [];
  private animActive: boolean = false;

  // 骰子动画
  diceValues: [number, number] = [1, 1];
  diceRolling: boolean = false;
  private diceTimer: number = 0;
  private diceDisplay: [number, number] = [0, 0];
  animSpeed: number = 0.15; // 可配置的动画速度
  diceDuration: number = 0.8; // seconds (public for speed control)

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.camera = new Camera(ctx.canvas.width, ctx.canvas.height);
    this.effects = new Effects();
    this.recalculateLayout();
  }

  setMapLayers(layers: MapLayerConfig[]): void { this.mapLayers = layers; }
  setPlayers(players: Player[]): void { this.players = players; }
  setPropertyLevels(levels: Map<number, number>): void { this.propLevels = levels; }
  getCamera(): Camera { return this.camera; }
  resize(w: number, h: number): void {
    this.camera.setCanvasSize(w, h);
    this.recalculateLayout();
  }

  /** 重新计算布局 */
  recalculateLayout(): void {
    this.layout = computeLayout(this.ctx.canvas.width, this.ctx.canvas.height);
  }

  getLayout(): GameLayout { return this.layout; }

  // ---- 骰子动画 ----
  startDiceRoll(finalValues: [number, number]): void {
    this.diceValues = finalValues;
    this.diceRolling = true;
    this.diceTimer = 0;
  }

  /** 回合结束时清除骰子显示 */
  hideDice(): void {
    this.diceRolling = false;
    this.diceResultShow = false;
    this.diceDisplay = [0, 0];
  }
  private diceResultShow: boolean = false;
  private diceResultTimer: number = 0;

  /** 每帧更新骰子动画（必须独立于移动动画，确保始终运行） */
  updateDiceAnim(dt: number): void {
    if (this.diceRolling) {
      this.diceTimer += dt;
      if (this.diceTimer >= this.diceDuration) {
        this.diceRolling = false;
        this.diceDisplay = this.diceValues;
        this.diceResultShow = true;
        this.diceResultTimer = 0;
      } else {
        // 快速切换随机面
        if (Math.random() < 0.3) {
          this.diceDisplay = [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)];
        }
      }
    }
    // 结果持续展示直到回合结束（由 hideDice 清除）
    if (this.diceResultShow) {
      this.diceResultTimer += dt;
    }
  }

  // ---- 移动动画 ----
  startMoveAnimation(path: number[]): void {
    this.animPath = path;
    this.animProgress = 0;
    this.animActive = true;
  }
  get isAnimating(): boolean { return this.animActive; }
  updateAnimProgress(dt: number): boolean {
    const speed = this.animSpeed;
    if (!this.animActive) return false;
    this.animProgress += dt * speed * this.animPath.length;
    if (this.animProgress >= 1) {
      this.animProgress = 1;
      this.animActive = false;
      return true;
    }
    return false;
  }

  // 基础缩放比（缓存）
  private baseScale: number = 1;

  // ---- 主渲染（一体化矩阵变换 + Camera交互） ----
  render(_dt: number): void {
    const ctx = this.ctx;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    const board = this.layout.board;
    this.camera.update();

    // === 一体化矩阵变换 ===
    ctx.save();
    // 层叠: 基础居中 + 用户拖拽偏移 + 用户缩放
    const cx = board.x + board.width / 2 + this.camera.x;
    const cy = board.y + board.height / 2 + this.camera.y;
    ctx.translate(cx, cy);
    this.baseScale = Math.min(board.width / BOARD_W, board.height / BOARD_H) * 0.92;
    const sc = this.baseScale * this.camera.scale;
    ctx.scale(sc, sc);

    this.renderBoardBg();
    this.renderGrid();
    this.renderMap();
    this.renderPieces();
    if (this.animActive && this.animPath.length > 1) this.renderAnimPiece();
    this.effects.render(ctx, { x: 0, y: 0, scale: 1 });
    this.renderWatermark();
    this.renderDice(w, h);
    this.renderBubbles();
    this.renderCrisisOverlay();
    this.renderCardPopup();
    ctx.restore();
    // === 一体化变换结束 ===

    this.renderLayerLabels();
    this.renderCycleParticles();
    this.renderOffLayerPlayersScreen();
  }

  // ---- 棋盘背景矩形（本地坐标，原点=棋盘中心） ----
  private renderBoardBg(): void {
    const ctx = this.ctx;
    const hw = BOARD_W / 2, hh = BOARD_H / 2;
    ctx.fillStyle = COLORS.layerColors[this.currentLayerIndex] + '12';
    this.roundRect(-hw, -hh, BOARD_W, BOARD_H, 16);
    ctx.fill();
    ctx.strokeStyle = COLORS.layerColors[this.currentLayerIndex] + '20';
    ctx.lineWidth = 2;
    this.roundRect(-hw, -hh, BOARD_W, BOARD_H, 16);
    ctx.stroke();
  }

  // ---- 水印（本地坐标，棋盘中心） ----
  private renderWatermark(): void {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.layerColors[this.currentLayerIndex] + '15';
    ctx.font = 'bold 50px "Microsoft YaHei"';
    ctx.textAlign = 'center';
    ctx.fillText('EMPIRE', 0, -30);
    ctx.fillText('TYCOON', 0, 30);
  }

  // ---- 其他层玩家指示器（屏幕空间） ----
  private renderOffLayerPlayersScreen(): void {
    const ctx = this.ctx;
    const offPlayers = this.players.filter(p => !p.bankrupt && p.currentLayer !== this.currentLayerIndex);
    if (offPlayers.length === 0) return;
    const board = this.layout.board;
    const bx = board.x + board.width / 2 - 250;
    const by = board.y + board.height - 30;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    this.roundRect(bx, by, 500, 26, 13);
    ctx.fill();
    ctx.fillStyle = '#AAA';
    ctx.font = '11px "Microsoft YaHei"';
    ctx.textAlign = 'center';
    const names = offPlayers.map(p => {
      const ln = this.mapLayers[p.currentLayer]?.name ?? '?';
      return `${p.name}(${ln})`;
    }).join(' · ');
    ctx.fillText(`其他层: ${names}`, bx + 250, by + 18);
  }

  // ---- 网格路径 ----
  private renderGrid(): void {
    const ctx = this.ctx;
    const layer = this.mapLayers[this.currentLayerIndex];
    if (!layer) return;
    ctx.strokeStyle = COLORS.layerColors[this.currentLayerIndex] + '25';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 8]);
    const tiles = layer.tiles;
    for (let i = 0; i < tiles.length; i++) {
      const curr = tiles[i];
      const next = tiles[(i + 1) % tiles.length];
      ctx.beginPath();
      ctx.moveTo(curr.x, curr.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // ---- 地图格子 ----
  private renderMap(): void {
    const layer = this.mapLayers[this.currentLayerIndex];
    if (!layer) return;
    for (const tile of layer.tiles) {
      this.renderTile(tile);
    }
  }

  private renderTile(tile: MapTileConfig): void {
    const ctx = this.ctx;
    const { x, y } = tile;
    const size = 54, half = size / 2, radius = 9;

    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    this.roundRect(x - half + 2, y - half + 2, size, size, radius);
    ctx.fill();

    // 渐变背景
    const baseColor = this.getTileColor(tile.type);
    const grad = ctx.createLinearGradient(x - half, y - half, x + half, y + half);
    grad.addColorStop(0, baseColor);
    grad.addColorStop(1, this.darken(baseColor, 0.3));
    ctx.fillStyle = grad;
    this.roundRect(x - half, y - half, size, size, radius);
    ctx.fill();

    // 边框
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1.5;
    this.roundRect(x - half, y - half, size, size, radius);
    ctx.stroke();

    // 类型 emoji 图标
    const icon = this.getTileIcon(tile.type);
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, x, y - 6);

    // 格子名称
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 9px "Microsoft YaHei"';
    ctx.fillText(tile.name.length > 3 ? tile.name.slice(0, 3) + '..' : tile.name, x, y + 14);

    // 地产已购标记 + 升级房屋
    if (tile.type === TileType.PROPERTY && tile.property) {
      const owner = this.players.find(p => p.ownedTiles.has(tile.id));
      if (owner) {
        // 业主色点
        ctx.fillStyle = owner.color;
        ctx.beginPath();
        ctx.arc(x + half - 7, y - half + 7, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 升级标记
        const lv = this.propLevels.get(tile.id) ?? 0;
        ctx.fillStyle = '#FFD700';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        if (lv >= 3) {
          ctx.fillText('🏨', x, y - half - 4);
        } else if (lv === 2) {
          ctx.fillText('🏠🏠', x, y - half - 4);
        } else if (lv === 1) {
          ctx.fillText('🏠', x, y - half - 4);
        }
      }
    }
  }

  // ---- 棋子 ----
  private renderPieces(): void {
    const layer = this.mapLayers[this.currentLayerIndex];
    if (!layer) return;

    const tilePlayers = new Map<number, Player[]>();
    for (const p of this.players) {
      if (p.bankrupt || p.currentLayer !== this.currentLayerIndex) continue;
      const tile = layer.tiles.find(t => t.id === p.currentTileId);
      if (!tile) continue;
      const pos = tile.position;
      if (!tilePlayers.has(pos)) tilePlayers.set(pos, []);
      tilePlayers.get(pos)!.push(p);
    }

    const currentPlayerId = state.getCurrentPlayerId();
    for (const [pos, players] of tilePlayers) {
      const tile = layer.tiles[pos];
      if (!tile) continue;
      const offsets = this.calculateOffsets(players.length, 16);
      players.forEach((p, i) => {
        const ox = tile.x + offsets[i].x;
        const oy = tile.y + offsets[i].y;
        this.renderPiece(ox, oy, p, p.id === currentPlayerId);
      });
    }
  }

  private renderPiece(x: number, y: number, player: Player, isCurrent: boolean): void {
    const ctx = this.ctx;
    const r = isCurrent ? 11 : 9;

    // 光晕（当前玩家）
    if (isCurrent) {
      ctx.fillStyle = 'rgba(255,215,0,0.3)';
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.arc(x + 1.5, y + 1.5, r, 0, Math.PI * 2);
    ctx.fill();

    // 主体
    const grad = ctx.createRadialGradient(x - 2, y - 2, 0, x, y, r);
    grad.addColorStop(0, this.lighten(player.color, 0.4));
    grad.addColorStop(1, this.darken(player.color, 0.2));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // 边框
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = isCurrent ? 2.5 : 1.5;
    ctx.stroke();

    // 首字母
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${r}px "Microsoft YaHei"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(player.name[0], x, y + 1);

    // AI 标记
    if (!player.isHuman) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x - 8, y - r - 8, 16, 10);
      ctx.fillStyle = '#FFD700';
      ctx.font = '6px "Microsoft YaHei"';
      ctx.fillText('AI', x, y - r - 3);
    }
  }

  private renderAnimPiece(): void {
    if (this.animPath.length < 2) return;
    const segIdx = Math.min(Math.floor(this.animProgress * (this.animPath.length - 1)), this.animPath.length - 2);
    const segFrac = (this.animProgress * (this.animPath.length - 1)) - segIdx;
    const fromId = this.animPath[segIdx];
    const toId = this.animPath[Math.min(segIdx + 1, this.animPath.length - 1)];
    const fromTile = this.findTile(fromId);
    const toTile = this.findTile(toId);
    if (!fromTile || !toTile) return;
    const ax = fromTile.x + (toTile.x - fromTile.x) * segFrac;
    const ay = fromTile.y + (toTile.y - fromTile.y) * segFrac;
    const player = state.getCurrentPlayer();
    if (!player) return;
    this.renderPiece(ax, ay, player, true);
  }

  // 屏幕空间层标签
  private renderLayerLabels(): void {
    const ctx = this.ctx;
    const board = this.layout.board;
    const bcx = board.x + board.width / 2;
    ctx.fillStyle = COLORS.layerColors[this.currentLayerIndex] + '80';
    ctx.font = 'bold 13px "Microsoft YaHei"';
    ctx.textAlign = 'center';
    const layer = this.mapLayers[this.currentLayerIndex];
    if (!layer) return;
    ctx.fillText(layer.name, bcx, board.y - 4);
    ctx.font = '10px "Microsoft YaHei"';
    ctx.fillStyle = '#AAA';
    const labels = this.mapLayers.map((l, i) => `${i === this.currentLayerIndex ? '▶ ' : ''}${l.name}`);
    ctx.fillText(labels.join('  |  '), bcx, board.y + 10);
  }

  // ---- 辅助 ----
  private findTile(id: number): MapTileConfig | undefined {
    for (const layer of this.mapLayers) {
      const t = layer.tiles.find(tt => tt.id === id);
      if (t) return t;
    }
    return undefined;
  }

  private getTileColor(type: TileType): string {
    const map: Record<string, string> = {
      [TileType.START]: COLORS.start, [TileType.PROPERTY]: COLORS.property,
      [TileType.EVENT]: COLORS.event, [TileType.JAIL]: COLORS.jail,
      [TileType.CASINO]: COLORS.casino, [TileType.STOCK]: COLORS.stock,
      [TileType.BANK]: COLORS.bank, [TileType.SUBWAY]: COLORS.subway,
      [TileType.TAX]: COLORS.tax, [TileType.AIRPORT]: COLORS.airport,
    };
    return map[type] ?? COLORS.tileBg;
  }

  private getTileIcon(type: TileType): string {
    const icons: Record<string, string> = {
      [TileType.START]: '🚩', [TileType.PROPERTY]: '🏠', [TileType.EVENT]: '🎲',
      [TileType.JAIL]: '🔒', [TileType.CASINO]: '🎰', [TileType.STOCK]: '📈',
      [TileType.BANK]: '🏦', [TileType.SUBWAY]: '🚇', [TileType.TAX]: '💰',
      [TileType.AIRPORT]: '✈️',
    };
    return icons[type] ?? '❓';
  }

  private calculateOffsets(count: number, radius: number): { x: number; y: number }[] {
    if (count === 1) return [{ x: 0, y: 0 }];
    if (count === 2) return [{ x: -8, y: -8 }, { x: 8, y: 8 }];
    if (count === 3) return [{ x: 0, y: -10 }, { x: -9, y: 7 }, { x: 9, y: 7 }];
    const offsets: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      offsets.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    }
    return offsets;
  }

  roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  private darken(hex: string, amount: number): string {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.max(0, (num >> 16) - Math.floor(255 * amount));
    const g = Math.max(0, ((num >> 8) & 0xFF) - Math.floor(255 * amount));
    const b = Math.max(0, (num & 0xFF) - Math.floor(255 * amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  private lighten(hex: string, amount: number): string {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.min(255, (num >> 16) + Math.floor(255 * amount));
    const g = Math.min(255, ((num >> 8) & 0xFF) + Math.floor(255 * amount));
    const b = Math.min(255, (num & 0xFF) + Math.floor(255 * amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  /** 显示 AI 气泡 */
  showBubble(x: number, y: number, text: string, color: string = '#FFD700'): void {
    this.bubbles.push({ x, y: y - 40, text, color, life: 2.5 });
  }

  private renderBubbles(): void {
    const ctx = this.ctx;
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.life -= 0.016;
      if (b.life <= 0) { this.bubbles.splice(i, 1); continue; }
      const alpha = Math.min(1, b.life);
      const by = b.y - (2.5 - b.life) * 10; // float up
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 1.5;
      const w = ctx.measureText(b.text).width + 20;
      const h = 24;
      this.roundRect(b.x - w / 2, by - h, w, h, 10);
      ctx.fill();
      this.roundRect(b.x - w / 2, by - h, w, h, 10);
      ctx.stroke();
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 11px "Microsoft YaHei"';
      ctx.textAlign = 'center';
      ctx.fillText(b.text, b.x, by - h / 2 + 5);
      ctx.restore();
    }
  }

  /** 渲染经济周期粒子 */
  private renderCycleParticles(): void {
    const ctx = this.ctx;
    for (let i = this.cycleParticles.length - 1; i >= 0; i--) {
      const p = this.cycleParticles[i];
      p.life -= 0.016;
      p.y += p.vy * 0.016;
      if (p.life <= 0) { this.cycleParticles.splice(i, 1); continue; }
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life / p.maxLife * 0.3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** 更新经济周期粒子（由 update 调用）*/
  updateCycleParticles(canvasW: number, canvasH: number): void {
    if (this.economyCycle === 'BOOM') {
      if (Math.random() < 0.3) this.cycleParticles.push({
        x: Math.random() * canvasW, y: canvasH + 10,
        vy: -40 - Math.random() * 60,
        life: 3 + Math.random() * 4, maxLife: 7,
        size: 1 + Math.random() * 2, color: '#FFD700'
      });
    } else if (this.economyCycle === 'RECESSION') {
      if (Math.random() < 0.5) this.cycleParticles.push({
        x: Math.random() * canvasW, y: -10,
        vy: 80 + Math.random() * 120,
        life: 2 + Math.random() * 3, maxLife: 5,
        size: 0.5 + Math.random() * 1.5, color: '#5DADE2'
      });
    }
  }

  // 灾变数据
  crisisText: string = '';
  crisisCountdown: number = 0;
  private crisisNew: boolean = false;
  private crisisAnimTimer: number = 0;
  // 卡牌展示
  private cardShowText: string = '';
  private cardShowEffect: string = '';
  private cardShowTimer: number = 0;

  /** 设置灾变展示 */
  setCrisis(text: string, countdown: number): void {
    if (text && text !== this.crisisText) {
      this.crisisNew = true;
      this.crisisAnimTimer = 0;
    }
    this.crisisText = text;
    this.crisisCountdown = countdown;
  }

  /** 展示抽到的卡牌 */
  showCardPopup(cardName: string, effect: string): void {
    this.cardShowText = cardName;
    this.cardShowEffect = effect;
    this.cardShowTimer = 3.0; // 显示3秒
  }

  /** 棋盘中心卡牌展示 */
  private renderCardPopup(): void {
    if (this.cardShowTimer <= 0) return;
    this.cardShowTimer -= 0.016;
    const ctx = this.ctx;
    const x = 0;
    const h = 54;
    const y = BOARD_H / 2 - h - 120;
    const w = 400;
    const alpha = Math.min(1, this.cardShowTimer / 0.5);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(30,40,80,0.95)';
    this.roundRect(x - w / 2, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    this.roundRect(x - w / 2, y, w, h, 12);
    ctx.stroke();

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 14px "Microsoft YaHei"';
    ctx.textAlign = 'center';
    ctx.fillText(`🃏 ${this.cardShowText}`, x, y + 22);
    ctx.fillStyle = '#FFF';
    ctx.font = '12px "Microsoft YaHei"';
    ctx.fillText(this.cardShowEffect, x, y + 42);
    ctx.restore();
  }

  /** 棋盘中心灾变倒计时（本地坐标） */
  private renderCrisisOverlay(): void {
    if (!this.crisisText || this.crisisCountdown <= 0) {
      this.crisisNew = false;
      return;
    }
    const ctx = this.ctx;
    const lines = this.crisisText.split('\n').filter(l => l.trim());
    const x = 0;
    const h = 22 + lines.length * 16;
    const y = BOARD_H / 2 - h - 60;
    const w = 500;

    // 新灾变出现动画（0→1秒缩放弹出）
    if (this.crisisNew) {
      this.crisisAnimTimer += 0.016;
      if (this.crisisAnimTimer > 1.2) this.crisisNew = false;
    }
    const animScale = this.crisisNew
      ? Math.min(1, this.crisisAnimTimer / 0.4) * (1 + Math.max(0, 0.3 - this.crisisAnimTimer) * 2)
      : 1;
    const alpha = this.crisisNew ? Math.min(1, this.crisisAnimTimer / 0.2) : 1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y + h / 2);
    ctx.scale(animScale, animScale);
    ctx.translate(-x, -(y + h / 2));

    ctx.fillStyle = 'rgba(180,20,20,0.9)';
    this.roundRect(x - w / 2, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = '#FF6B6B';
    ctx.lineWidth = 2;
    this.roundRect(x - w / 2, y, w, h, 14);
    ctx.stroke();

    // 新灾变闪光
    if (this.crisisNew && this.crisisAnimTimer < 0.8) {
      const flashAlpha = 1 - this.crisisAnimTimer / 0.8;
      ctx.fillStyle = `rgba(255,255,255,${flashAlpha * 0.3})`;
      this.roundRect(x - w / 2, y, w, h, 14);
      ctx.fill();
    }

    ctx.fillStyle = '#FFF';
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px "Microsoft YaHei"';
    ctx.fillText(`⚠ 灾变预警  [剩余 ${this.crisisCountdown} 回合]`, x, y + 22);
    ctx.font = 'bold 12px "Microsoft YaHei"';
    ctx.fillStyle = '#FFD700';
    lines.forEach((line, i) => {
      ctx.fillText(line, x, y + 40 + i * 18);
    });

    ctx.restore();
  }

  switchLayer(index: number): void {
    this.currentLayerIndex = Math.max(0, Math.min(this.mapLayers.length - 1, index));
  }

  getCurrentLayer(): number { return this.currentLayerIndex; }

  /** 渲染骰子（棋盘本地坐标，底部中心） */
  renderDice(_w: number, _h: number): void {
    if (!this.diceRolling && this.diceDisplay[0] === 0) return;
    const ctx = this.ctx;
    const rolling = this.diceRolling;
    const size = rolling ? 80 : 42;
    const gap = rolling ? 20 : 8;
    const totalW = size * 2 + gap;
    // 棋盘本地坐标：正中央
    const x = -totalW / 2;
    const y = -size / 2;

    const [v1, v2] = this.diceDisplay;

    // 骰子阴影
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    this.roundRect(x + 3, y + 3, size * 2 + gap, size + 6, 10);
    ctx.fill();

    // 背景面板
    ctx.fillStyle = 'rgba(22,33,62,0.85)';
    this.roundRect(x - 10, y - 10, size * 2 + gap + 20, size + 26, 12);
    ctx.fill();
    ctx.strokeStyle = '#FFD70033';
    ctx.lineWidth = 1;
    this.roundRect(x - 10, y - 10, size * 2 + gap + 20, size + 26, 12);
    ctx.stroke();

    // 标题
    if (this.diceRolling) {
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 14px "Microsoft YaHei"';
      ctx.textAlign = 'center';
      ctx.fillText('🎲 掷骰中...', x + size + gap / 2, y - 6);
    } else if (this.diceResultShow) {
      // 显示最终结果
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 16px "Microsoft YaHei"';
      ctx.textAlign = 'center';
      ctx.fillText(`🎯 ${v1 + v2} 步`, x + size + gap / 2, y - 6);
      // 底部步数提示
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 13px "Microsoft YaHei"';
      const totalW = size * 2 + gap;
      ctx.fillText(`${v1} + ${v2} = ${v1 + v2}`, x + totalW / 2, y + size + 22);
    }

    // 两颗骰子
    [v1, v2].forEach((val, idx) => {
      const dx = x + idx * (size + gap);
      // 骰子背景
      const bgGrad = ctx.createLinearGradient(dx, y, dx + size, y + size);
      bgGrad.addColorStop(0, '#FFFFFF');
      bgGrad.addColorStop(1, '#E8E8E8');
      ctx.fillStyle = bgGrad;
      this.roundRect(dx, y, size, size, 8);
      ctx.fill();
      ctx.strokeStyle = '#CCC';
      ctx.lineWidth = 1.5;
      this.roundRect(dx, y, size, size, 8);
      ctx.stroke();

      // 点数
      ctx.fillStyle = '#1a1a2e';
      const cx = dx + size / 2, cy = y + size / 2;
      const dots = this.getDiceDots(val);
      dots.forEach(([dotX, dotY]) => {
        ctx.beginPath();
        ctx.arc(cx + dotX * 10, cy + dotY * 10, 4.5, 0, Math.PI * 2);
        ctx.fill();
      });
    });
  }

  private getDiceDots(value: number): [number, number][] {
    const dots: Record<number, [number, number][]> = {
      1: [[0, 0]],
      2: [[-1, -1], [1, 1]],
      3: [[-1, -1], [0, 0], [1, 1]],
      4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
      5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
      6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
    };
    return dots[value] ?? dots[1];
  }
}
