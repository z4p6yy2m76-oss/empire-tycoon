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
  }

  setMapLayers(layers: MapLayerConfig[]): void { this.mapLayers = layers; }
  setPlayers(players: Player[]): void { this.players = players; }
  getCamera(): Camera { return this.camera; }
  resize(w: number, h: number): void { this.camera.setCanvasSize(w, h); }

  // ---- 骰子动画 ----
  startDiceRoll(finalValues: [number, number]): void {
    this.diceValues = finalValues;
    this.diceRolling = true;
    this.diceTimer = 0;
  }
  private diceResultShow: boolean = false;
  private diceResultTimer: number = 0;

  private updateDiceAnim(dt: number): void {
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
    // 结果展示持续 2 秒
    if (this.diceResultShow) {
      this.diceResultTimer += dt;
      if (this.diceResultTimer > 2.5) {
        this.diceResultShow = false;
        this.diceDisplay = [0, 0]; // 隐藏
      }
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
    this.updateDiceAnim(dt);
    if (!this.animActive) return false;
    this.animProgress += dt * speed * this.animPath.length;
    if (this.animProgress >= 1) {
      this.animProgress = 1;
      this.animActive = false;
      return true;
    }
    return false;
  }

  // ---- 主渲染 ----
  render(dt: number): void {
    const ctx = this.ctx;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    this.camera.update();
    this.camera.apply(ctx);

    this.renderLayerBackground();
    this.renderGrid();
    this.renderMap();
    this.renderPieces();
    if (this.animActive && this.animPath.length > 1) {
      this.renderAnimPiece();
    }
    this.effects.render(ctx, { x: this.camera.x, y: this.camera.y, scale: this.camera.scale });
    this.renderLayerLabels();

    // 其他层玩家指示器
    this.renderOffLayerPlayers();

    this.camera.restore(ctx);

    // 骰子（屏幕坐标，不随摄像机缩放）
    this.renderDice(ctx.canvas.width, ctx.canvas.height);
  }

  // ---- 层背景（矩形棋盘底纹） ----
  private renderLayerBackground(): void {
    const ctx = this.ctx;
    // 棋盘矩形区域
    const bx = 130, by = 100, bw = 1140, bh = 700;
    ctx.fillStyle = COLORS.layerColors[this.currentLayerIndex] + '12';
    this.roundRect(bx, by, bw, bh, 16);
    ctx.fill();
    ctx.strokeStyle = COLORS.layerColors[this.currentLayerIndex] + '20';
    ctx.lineWidth = 2;
    this.roundRect(bx, by, bw, bh, 16);
    ctx.stroke();

    // 中心文字
    ctx.fillStyle = COLORS.layerColors[this.currentLayerIndex] + '15';
    ctx.font = 'bold 48px "Microsoft YaHei"';
    ctx.textAlign = 'center';
    ctx.fillText('EMPIRE', 700, 400);
    ctx.fillText('TYCOON', 700, 458);
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
    const size = 48, half = size / 2, radius = 8;

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

    // 地产已购标记
    if (tile.type === TileType.PROPERTY && tile.property) {
      const owner = this.players.find(p => p.ownedTiles.has(tile.id));
      if (owner) {
        ctx.fillStyle = owner.color;
        ctx.beginPath();
        ctx.arc(x + half - 7, y - half + 7, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.stroke();
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

  private renderLayerLabels(): void {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.layerColors[this.currentLayerIndex] + '80';
    ctx.font = 'bold 14px "Microsoft YaHei"';
    ctx.textAlign = 'center';
    const layer = this.mapLayers[this.currentLayerIndex];
    if (!layer) return;
    ctx.fillText(layer.name, 700, 24);
    ctx.font = '10px "Microsoft YaHei"';
    ctx.fillStyle = '#AAAAAA';
    const labels = this.mapLayers.map((l, i) => `${i === this.currentLayerIndex ? '▶ ' : ''}${l.name}`);
    ctx.fillText(labels.join('  |  '), 700, 40);
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

  switchLayer(index: number): void {
    this.currentLayerIndex = Math.max(0, Math.min(this.mapLayers.length - 1, index));
  }

  getCurrentLayer(): number { return this.currentLayerIndex; }

  /** 渲染其他层玩家位置指示器 */
  private renderOffLayerPlayers(): void {
    const ctx = this.ctx;
    const offLayerPlayers = this.players.filter(p => !p.bankrupt && p.currentLayer !== this.currentLayerIndex);
    if (offLayerPlayers.length === 0) return;

    // 在中心区域底部显示提示
    const bx = 380, by = 560, bw = 640, bh = 36;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    this.roundRect(bx, by, bw, bh, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    this.roundRect(bx, by, bw, bh, 18);
    ctx.stroke();

    ctx.fillStyle = '#AAA';
    ctx.font = '12px "Microsoft YaHei"';
    ctx.textAlign = 'center';
    const names = offLayerPlayers.map(p => {
      const layerName = this.mapLayers[p.currentLayer]?.name ?? '?';
      return `${p.name} (${layerName})`;
    }).join('  ·  ');
    ctx.fillText(`其他层: ${names}`, bx + bw / 2, by + bh / 2 + 5);

    // 在跳转点标记
    const layer = this.mapLayers[this.currentLayerIndex];
    if (!layer) return;
    for (const tile of layer.tiles) {
      if (tile.type === TileType.SUBWAY) {
        const hasPlayerThere = offLayerPlayers.some(p => {
          return true; // all off-layer players are "there"
        });
        if (hasPlayerThere) {
          ctx.fillStyle = '#FFD700';
          ctx.beginPath();
          ctx.arc(tile.x, tile.y - 30, 5, 0, Math.PI * 2);
          ctx.fill();
          // pulse
          const pulse = Math.sin(Date.now() / 500) * 0.5 + 0.5;
          ctx.fillStyle = `rgba(255,215,0,${0.15 + pulse * 0.2})`;
          ctx.beginPath();
          ctx.arc(tile.x, tile.y - 30, 9 + pulse * 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  /** 渲染骰子（屏幕中央，roll 时放大 + 不在 roll 时缩小放角落） */
  renderDice(canvasW: number, canvasH: number): void {
    if (!this.diceRolling && this.diceDisplay[0] === 0) return;
    const ctx = this.ctx;
    const rolling = this.diceRolling;
    const size = rolling ? 80 : 42;
    const gap = rolling ? 20 : 8;
    const totalW = size * 2 + gap;
    const x = rolling ? canvasW / 2 - totalW / 2 : canvasW - totalW - 20;
    const y = rolling ? canvasH / 2 - size / 2 - 30 : 76;

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
