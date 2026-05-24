// ============================================================
// InputManager.ts — 鼠标/键盘输入管理
// 将原始事件映射为游戏坐标和语义操作
// ============================================================

export interface MouseState {
  x: number;          // 画布坐标
  y: number;
  worldX: number;     // 世界坐标（考虑摄像机偏移）
  worldY: number;
  down: boolean;
  pressed: boolean;   // 本帧刚按下
  released: boolean;  // 本帧刚释放
  dragging: boolean;
  dragStartX: number;
  dragStartY: number;
  dragDx: number;
  dragDy: number;
}

export interface KeyState {
  pressed: Set<string>;
  justPressed: Set<string>;
  justReleased: Set<string>;
}

export class InputManager {
  private canvas: HTMLCanvasElement;
  private cameraTransform: { offsetX: number; offsetY: number; scale: number };

  mouse: MouseState = {
    x: 0, y: 0, worldX: 0, worldY: 0,
    down: false, pressed: false, released: false,
    dragging: false, dragStartX: 0, dragStartY: 0, dragDx: 0, dragDy: 0,
  };

  keys: KeyState = {
    pressed: new Set(),
    justPressed: new Set(),
    justReleased: new Set(),
  };

  private justPressedSet = new Set<string>();
  private justReleasedSet = new Set<string>();
  private prevPressed = new Set<string>();
  private prevMouseDown = false;

  // 回调
  onClick: ((worldX: number, worldY: number) => void) | null = null;
  onRightClick: ((worldX: number, worldY: number) => void) | null = null;
  onDrag: ((dx: number, dy: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.cameraTransform = { offsetX: 0, offsetY: 0, scale: 1 };
    this.bindEvents();
  }

  setCameraTransform(offsetX: number, offsetY: number, scale: number): void {
    this.cameraTransform = { offsetX, offsetY, scale };
  }

  private bindEvents(): void {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
      this.mouse.worldX = (this.mouse.x - this.cameraTransform.offsetX) / this.cameraTransform.scale;
      this.mouse.worldY = (this.mouse.y - this.cameraTransform.offsetY) / this.cameraTransform.scale;
      if (this.mouse.dragging) {
        this.mouse.dragDx = this.mouse.x - this.mouse.dragStartX;
        this.mouse.dragDy = this.mouse.y - this.mouse.dragStartY;
        this.onDrag?.(this.mouse.dragDx, this.mouse.dragDy);
        this.mouse.dragStartX = this.mouse.x;
        this.mouse.dragStartY = this.mouse.y;
      }
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouse.down = true;
        this.mouse.pressed = true;
        this.mouse.dragStartX = this.mouse.x;
        this.mouse.dragStartY = this.mouse.y;
        this.mouse.dragging = true;
      }
    });

    this.canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        if (!this.mouse.dragging || (Math.abs(this.mouse.dragDx) < 3 && Math.abs(this.mouse.dragDy) < 3)) {
          this.onClick?.(this.mouse.worldX, this.mouse.worldY);
        }
        this.mouse.down = false;
        this.mouse.released = true;
        this.mouse.dragging = false;
        this.mouse.dragDx = 0;
        this.mouse.dragDy = 0;
      }
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.onRightClick?.(this.mouse.worldX, this.mouse.worldY);
    });

    window.addEventListener('keydown', (e) => {
      this.justPressedSet.add(e.key);
      this.keys.pressed.add(e.key);
    });

    window.addEventListener('keyup', (e) => {
      this.justReleasedSet.add(e.key);
      this.keys.pressed.delete(e.key);
    });

    // 触摸事件
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = touch.clientX - rect.left;
      this.mouse.y = touch.clientY - rect.top;
      this.mouse.pressed = true;
      this.mouse.dragging = true;
      this.mouse.dragStartX = this.mouse.x;
      this.mouse.dragStartY = this.mouse.y;
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = touch.clientX - rect.left;
      this.mouse.y = touch.clientY - rect.top;
      this.mouse.worldX = (this.mouse.x - this.cameraTransform.offsetX) / this.cameraTransform.scale;
      this.mouse.worldY = (this.mouse.y - this.cameraTransform.offsetY) / this.cameraTransform.scale;
      if (this.mouse.dragging) {
        this.mouse.dragDx = this.mouse.x - this.mouse.dragStartX;
        this.mouse.dragDy = this.mouse.y - this.mouse.dragStartY;
      }
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (!this.mouse.dragging || (Math.abs(this.mouse.dragDx) < 5 && Math.abs(this.mouse.dragDy) < 5)) {
        this.onClick?.(this.mouse.worldX, this.mouse.worldY);
      }
      this.mouse.down = false;
      this.mouse.released = true;
      this.mouse.dragging = false;
      this.mouse.dragDx = 0;
      this.mouse.dragDy = 0;
    }, { passive: false });
  }

  /** 每帧结束时调用，清除单帧状态 */
  endFrame(): void {
    this.mouse.pressed = false;
    this.mouse.released = false;
    this.keys.justPressed = new Set(this.justPressedSet);
    this.keys.justReleased = new Set(this.justReleasedSet);
    this.justPressedSet.clear();
    this.justReleasedSet.clear();
  }
}
