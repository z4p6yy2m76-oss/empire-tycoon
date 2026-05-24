// ============================================================
// Camera.ts — 摄像机控制
// 支持缩放、拖拽、平滑跟随
// ============================================================

export class Camera {
  x: number = 0;
  y: number = 0;
  scale: number = 1;
  minScale: number = 0.3;
  maxScale: number = 3.0;
  targetX: number = 0;
  targetY: number = 0;
  targetScale: number = 1;
  private smoothing: number = 0.1;

  private canvasWidth: number;
  private canvasHeight: number;

  constructor(canvasWidth: number, canvasHeight: number) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
  }

  setCanvasSize(w: number, h: number): void {
    this.canvasWidth = w;
    this.canvasHeight = h;
  }

  centerOn(x: number, y: number): void {
    this.targetX = this.canvasWidth / 2 - x * this.scale;
    this.targetY = this.canvasHeight / 2 - y * this.scale;
  }

  focusOn(worldX: number, worldY: number): void {
    this.targetX = this.canvasWidth / 2 - worldX * this.targetScale;
    this.targetY = this.canvasHeight / 2 - worldY * this.targetScale;
  }

  zoom(delta: number, mouseX: number, mouseY: number): void {
    const oldScale = this.targetScale;
    this.targetScale = Math.max(this.minScale, Math.min(this.maxScale, this.targetScale - delta * 0.001));

    // 以鼠标位置为中心缩放
    const worldX = (mouseX - this.x) / oldScale;
    const worldY = (mouseY - this.y) / oldScale;
    this.targetX = mouseX - worldX * this.targetScale;
    this.targetY = mouseY - worldY * this.targetScale;
  }

  pan(dx: number, dy: number): void {
    this.targetX += dx;
    this.targetY += dy;
  }

  update(): void {
    this.x += (this.targetX - this.x) * this.smoothing;
    this.y += (this.targetY - this.y) * this.smoothing;
    this.scale += (this.targetScale - this.scale) * this.smoothing;
  }

  apply(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.scale, this.scale);
  }

  restore(ctx: CanvasRenderingContext2D): void {
    ctx.restore();
  }

  /** 屏幕坐标 → 世界坐标 */
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.x) / this.scale,
      y: (screenY - this.y) / this.scale,
    };
  }

  /** 世界坐标 → 屏幕坐标 */
  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: worldX * this.scale + this.x,
      y: worldY * this.scale + this.y,
    };
  }

  reset(): void {
    this.x = 0; this.y = 0;
    this.targetX = 0; this.targetY = 0;
    this.scale = 1; this.targetScale = 1;
  }
}
