// ============================================================
// EventLogUI.ts — 可拖拽 + 可调节大小的浮动事件日志
// ============================================================

export type LogCategory = 'income' | 'expense' | 'system' | 'warning';

export interface LogEntry {
  message: string;
  category: LogCategory;
  timestamp: number;
}

export class EventLogUI {
  private el: HTMLElement;
  private entries: LogEntry[] = [];
  private maxEntries: number = 80;
  private isDragging: boolean = false;
  private isResizing: boolean = false;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private origLeft: number = 0;
  private origTop: number = 0;
  private origWidth: number = 0;
  private origHeight: number = 0;
  private minWidth: number = 200;
  private minHeight: number = 120;
  private collapsed: boolean = false;

  constructor(el: HTMLElement) {
    this.el = el;

    // 初始位置：右下角
    this.el.style.position = 'absolute';
    this.el.style.right = '12px';
    this.el.style.bottom = '100px';
    this.el.style.width = '260px';
    this.el.style.maxHeight = 'none';
    this.el.style.height = '160px';
    this.el.style.overflow = 'hidden';
    this.el.style.resize = 'none';

    // 创建内部结构
    this.el.innerHTML = `
      <div class="log-header" style="
        display:flex;align-items:center;justify-content:space-between;
        padding:5px 10px;background:rgba(255,255,255,0.06);
        cursor:move;user-select:none;border-bottom:1px solid rgba(255,255,255,0.08);
        font-size:12px;color:#FFD700;font-weight:bold;
      ">
        <span>📋 事件日志</span>
        <span style="display:flex;gap:6px;">
          <button class="log-min-btn" style="
            background:rgba(255,255,255,0.1);border:none;color:#fff;
            width:20px;height:20px;border-radius:3px;cursor:pointer;
            font-size:14px;line-height:1;padding:0;
          " title="最小化">−</button>
        </span>
      </div>
      <div class="log-body" style="
        overflow-y:auto;padding:6px 10px;
        height:calc(100% - 32px);
      "></div>
      <div class="log-resize-handle" style="
        position:absolute;bottom:0;right:0;
        width:14px;height:14px;
        cursor:nwse-resize;
        background:linear-gradient(135deg,transparent 50%,rgba(255,255,255,0.2) 50%);
        border-radius:0 0 8px 0;
      "></div>
    `;

    // 绑定拖拽
    const header = this.el.querySelector('.log-header')! as HTMLElement;
    header.addEventListener('mousedown', (e) => this.onDragStart(e as MouseEvent));
    document.addEventListener('mousemove', (e) => this.onMove(e as MouseEvent));
    document.addEventListener('mouseup', () => this.onEnd());

    // 绑定缩放
    const resizeHandle = this.el.querySelector('.log-resize-handle')! as HTMLElement;
    resizeHandle.addEventListener('mousedown', (e) => this.onResizeStart(e as MouseEvent));

    // 最小化按钮
    const minBtn = this.el.querySelector('.log-min-btn')! as HTMLElement;
    minBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleCollapse();
    });

    // 双击标题折叠
    header.addEventListener('dblclick', () => this.toggleCollapse());
  }

  /** 获取日志内容容器 */
  private getBody(): HTMLElement {
    return this.el.querySelector('.log-body')! as HTMLElement;
  }

  /** 拖拽开始 */
  private onDragStart(e: MouseEvent): void {
    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    const rect = this.el.getBoundingClientRect();
    this.origLeft = rect.left;
    this.origTop = rect.top;
    this.el.style.right = 'auto';
    this.el.style.bottom = 'auto';
    this.el.style.left = this.origLeft + 'px';
    this.el.style.top = this.origTop + 'px';
    e.preventDefault();
  }

  /** 缩放开始 */
  private onResizeStart(e: MouseEvent): void {
    this.isResizing = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    const rect = this.el.getBoundingClientRect();
    this.origWidth = rect.width;
    this.origHeight = rect.height;
    this.origLeft = rect.left;
    this.origTop = rect.top;
    e.preventDefault();
    e.stopPropagation();
  }

  /** 移动/缩放中 */
  private onMove(e: MouseEvent): void {
    if (this.isDragging) {
      const dx = e.clientX - this.dragStartX;
      const dy = e.clientY - this.dragStartY;
      this.el.style.left = (this.origLeft + dx) + 'px';
      this.el.style.top = (this.origTop + dy) + 'px';
      // 限制不拖出屏幕
      this.clampPosition();
    }
    if (this.isResizing) {
      const dx = e.clientX - this.dragStartX;
      const dy = e.clientY - this.dragStartY;
      const newW = Math.max(this.minWidth, this.origWidth + dx);
      const newH = Math.max(this.minHeight, this.origHeight + dy);
      this.el.style.width = newW + 'px';
      this.el.style.height = newH + 'px';
      // 根据高度调整字体
      const fontSize = Math.max(10, Math.min(14, newH / 14));
      this.el.style.fontSize = fontSize + 'px';
    }
  }

  /** 结束拖拽/缩放 */
  private onEnd(): void {
    this.isDragging = false;
    this.isResizing = false;
  }

  /** 限制面板不超出屏幕 */
  private clampPosition(): void {
    const rect = this.el.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width;
    const maxY = window.innerHeight - 40;
    if (rect.left < 0) this.el.style.left = '0px';
    if (rect.top < 0) this.el.style.top = '0px';
    if (rect.left > maxX) this.el.style.left = maxX + 'px';
    if (rect.top > maxY) this.el.style.top = maxY + 'px';
  }

  /** 折叠/展开 */
  toggleCollapse(): void {
    this.collapsed = !this.collapsed;
    const body = this.getBody();
    const resizeHandle = this.el.querySelector('.log-resize-handle')! as HTMLElement;
    if (this.collapsed) {
      this.el.style.height = '32px';
      body.style.display = 'none';
      resizeHandle.style.display = 'none';
    } else {
      this.el.style.height = '160px';
      body.style.display = 'block';
      resizeHandle.style.display = 'block';
    }
  }

  // ---- 日志写入 ----

  add(message: string, category: LogCategory = 'system', playerName?: string, playerColor?: string): void {
    this.entries.push({ message, category, timestamp: Date.now() });
    if (this.entries.length > this.maxEntries) this.entries.shift();
    this.renderEntry(message, category, playerName, playerColor);
  }

  income(msg: string): void { this.add(msg, 'income'); }
  expense(msg: string): void { this.add(msg, 'expense'); }
  system(msg: string): void { this.add(msg, 'system'); }
  warning(msg: string): void { this.add(msg, 'warning'); }

  private renderEntry(message: string, category: LogCategory, playerName?: string, playerColor?: string): void {
    const body = this.getBody();
    if (this.collapsed) return;

    const div = document.createElement('div');
    div.className = `log-item log-${category}`;

    if (playerName && playerColor) {
      const s = document.createElement('span');
      s.textContent = playerName;
      s.style.cssText = `color:${playerColor};font-weight:bold;`;
      div.appendChild(s);
      const m = document.createElement('span');
      m.textContent = ' ' + message;
      div.appendChild(m);
    } else {
      div.textContent = message;
    }

    body.appendChild(div);
    body.scrollTop = body.scrollHeight;

    while (body.children.length > this.maxEntries) {
      body.firstChild?.remove();
    }
  }

  clear(): void {
    this.getBody().innerHTML = '';
    this.entries = [];
  }

  show(): void { this.el.style.display = 'block'; }
  hide(): void { this.el.style.display = 'none'; }
}
