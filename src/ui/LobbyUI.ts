// ============================================================
// LobbyUI.ts — 联机等待房间面板
// 显示房间码、玩家列表、准备/开始按钮
// 适配投屏：大字号、高对比度、大按钮
// ============================================================

export interface LobbyPlayer {
  id: string;
  name: string;
  color: string;
  ready: boolean;
  isHost: boolean;
  isMe: boolean;
}

export class LobbyUI {
  private root: HTMLElement;
  private panel: HTMLElement;
  private roomCodeEl: HTMLElement;
  private playerListEl: HTMLElement;
  private btnStart: HTMLButtonElement;
  private btnReady: HTMLButtonElement;
  private btnLeave: HTMLButtonElement;
  private infoText: HTMLElement;

  private isHost: boolean = false;
  private amReady: boolean = false;

  // 回调：由 main.ts 注入
  onStartGame: (() => void) | null = null;
  onReadyToggle: (() => void) | null = null;
  onLeave: (() => void) | null = null;

  constructor() {
    this.root = document.getElementById('ui-layer')!;
    this.panel = this.createPanel();
    this.root.appendChild(this.panel);

    this.roomCodeEl = this.panel.querySelector('#lobby-room-code')!;
    this.playerListEl = this.panel.querySelector('#lobby-player-list')!;
    this.btnStart = this.panel.querySelector('#lobby-btn-start')! as HTMLButtonElement;
    this.btnReady = this.panel.querySelector('#lobby-btn-ready')! as HTMLButtonElement;
    this.btnLeave = this.panel.querySelector('#lobby-btn-leave')! as HTMLButtonElement;
    this.infoText = this.panel.querySelector('#lobby-info')!;

    this.bindEvents();
  }

  /** 显示面板（仅首次调用时初始化按钮状态） */
  show(roomCode: string, host: boolean): void {
    // 如果已经可见，不重置按钮状态（避免 ROOM_INFO 广播覆盖准备/开始按钮的当前状态）
    const wasVisible = this.isVisible();

    this.isHost = host;
    this.panel.style.display = 'flex';
    this.roomCodeEl.textContent = roomCode;

    if (!wasVisible) {
      // 首次显示：初始化按钮状态
      this.amReady = false;
      this.btnStart.style.display = host ? 'block' : 'none';
      this.btnStart.disabled = true;
      this.btnReady.style.display = host ? 'none' : 'block';
      this.btnReady.textContent = '准备';
      this.btnReady.style.background = 'linear-gradient(135deg, #2ECC71, #27AE60)';
      this.infoText.textContent = host
        ? '等待玩家加入...'
        : '点击「准备」确认就绪';
    }
  }

  /** 更新房间码文字（不改变按钮状态） */
  updateRoomCode(code: string): void {
    this.roomCodeEl.textContent = code;
  }

  /** 隐藏面板 */
  hide(): void {
    this.panel.style.display = 'none';
  }

  /** 是否可见 */
  isVisible(): boolean {
    return this.panel.style.display === 'flex';
  }

  /** 更新玩家列表 */
  updatePlayers(players: LobbyPlayer[]): void {
    this.playerListEl.innerHTML = players
      .sort((a, b) => (a.isHost ? -1 : b.isHost ? 1 : 0)) // 房主排最前
      .map(p => {
        const hostBadge = p.isHost
          ? '<span style="display:inline-block;background:rgba(255,215,0,0.2);color:#FFD700;padding:2px 8px;border-radius:4px;font-size:13px;margin-left:6px;">房主</span>'
          : '';
        const meBadge = p.isMe
          ? '<span style="display:inline-block;background:rgba(52,152,219,0.2);color:#3498DB;padding:2px 8px;border-radius:4px;font-size:13px;margin-left:4px;">我</span>'
          : '';
        const readyBadge = p.ready
          ? '<span style="display:inline-block;background:rgba(46,204,113,0.2);color:#2ECC71;padding:2px 8px;border-radius:4px;font-size:13px;margin-left:4px;">已准备</span>'
          : '<span style="display:inline-block;background:rgba(255,255,255,0.05);color:#95A5A6;padding:2px 8px;border-radius:4px;font-size:13px;margin-left:4px;">准备中</span>';

        return `
          <div style="
            display:flex;align-items:center;gap:12px;padding:12px 16px;
            background:rgba(255,255,255,0.03);border-radius:10px;
            border:1px solid rgba(255,255,255,0.06);
            ${p.isMe ? 'border-color:rgba(52,152,219,0.3);background:rgba(52,152,219,0.06);' : ''}
          ">
            <span style="width:16px;height:16px;border-radius:50%;background:${p.color};border:2px solid rgba(255,255,255,0.3);flex-shrink:0;"></span>
            <span style="flex:1;font-size:18px;font-weight:bold;color:#ECF0F1;">${p.name}</span>
            ${hostBadge}${meBadge}${readyBadge}
          </div>
        `;
      }).join('');

    // 控制开始按钮：至少2人
    if (this.isHost) {
      this.btnStart.disabled = players.length < 2;
    }
  }

  /** 更新准备按钮文字 */
  setReadyState(ready: boolean): void {
    this.amReady = ready;
    if (ready) {
      this.btnReady.textContent = '取消准备';
      this.btnReady.style.background = 'linear-gradient(135deg, #F39C12, #E67E22)';
    } else {
      this.btnReady.textContent = '准备';
      this.btnReady.style.background = 'linear-gradient(135deg, #2ECC71, #27AE60)';
    }
  }

  // ---- 事件绑定 ----
  private bindEvents(): void {
    this.btnStart.addEventListener('click', () => {
      console.log('[LobbyUI] btnStart 被点击, isHost:', this.isHost, 'disabled:', this.btnStart.disabled);
      this.onStartGame?.();
    });

    this.btnReady.addEventListener('click', () => {
      console.log('[LobbyUI] btnReady 被点击, isHost:', this.isHost, 'amReady:', this.amReady);
      this.onReadyToggle?.();
    });

    this.btnLeave.addEventListener('click', () => {
      console.log('[LobbyUI] btnLeave 被点击');
      this.onLeave?.();
    });

    // ESC 也可离开
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.panel.style.display === 'flex') {
        this.onLeave?.();
      }
    });
  }

  // ---- 创建 DOM 结构（内联样式，投屏适配） ----
  private createPanel(): HTMLElement {
    const div = document.createElement('div');
    div.id = 'lobby-panel';
    div.style.cssText = `
      position: absolute; inset: 0; display: none;
      flex-direction: column; align-items: center; justify-content: center;
      background: radial-gradient(ellipse at center, rgba(22,33,62,0.85) 0%, rgba(10,12,20,0.95) 100%);
      backdrop-filter: blur(8px); z-index: 35;
    `;
    div.innerHTML = `
      <div style="
        background: linear-gradient(180deg, rgba(30,40,70,0.98) 0%, rgba(22,33,62,0.98) 100%);
        border: 1px solid rgba(255,255,255,0.12); border-radius: 20px;
        padding: 40px 48px; min-width: 460px; max-width: 520px;
        text-align: center; box-shadow: 0 24px 80px rgba(0,0,0,0.6);
      ">

        <!-- 房间码（大字投屏） -->
        <div style="margin-bottom:8px;font-size:16px;color:#95A5A6;letter-spacing:2px;">房间码</div>
        <div id="lobby-room-code" style="
          font-size:56px;font-weight:bold;letter-spacing:12px;
          background:linear-gradient(135deg,#FFD700,#F39C12);
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;
          background-clip:text; margin-bottom:16px;
          font-family:'Courier New',monospace;
        ">----</div>

        <!-- 提示文字 -->
        <div id="lobby-info" style="
          font-size:14px;color:#95A5A6;margin-bottom:20px;
        ">等待玩家加入...</div>

        <!-- 玩家列表 -->
        <div id="lobby-player-list" style="
          display:flex;flex-direction:column;gap:8px;margin-bottom:24px;
          min-height:60px;
        ">
          <div style="font-size:14px;color:#7F8C8D;padding:20px;">暂无玩家</div>
        </div>

        <!-- 按钮区 -->
        <div style="display:flex;flex-direction:column;gap:10px;">

          <!-- 房主：开始游戏 -->
          <button id="lobby-btn-start" style="
            width:100%;padding:16px;font-size:20px;font-weight:bold;
            border:none;border-radius:12px;cursor:pointer;color:#fff;
            background:linear-gradient(135deg,#FFD700,#F39C12);
            transition:all 0.2s;display:none;
            box-shadow:0 6px 24px rgba(255,215,0,0.3);
          " disabled>开始游戏</button>

          <!-- 加入者：准备 / 取消准备 -->
          <button id="lobby-btn-ready" style="
            width:100%;padding:16px;font-size:20px;font-weight:bold;
            border:none;border-radius:12px;cursor:pointer;color:#fff;
            background:linear-gradient(135deg,#2ECC71,#27AE60);
            transition:all 0.2s;
            box-shadow:0 6px 24px rgba(46,204,113,0.3);
          ">准备</button>

          <!-- 离开房间 -->
          <button id="lobby-btn-leave" style="
            width:100%;padding:12px;font-size:14px;font-weight:bold;
            border:1px solid rgba(231,76,60,0.4);border-radius:10px;
            cursor:pointer;color:#E74C3C;
            background:rgba(231,76,60,0.08);
            transition:all 0.2s;margin-top:8px;
          ">离开房间</button>
        </div>

      </div>
    `;

    // hover 效果
    div.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('mouseenter', () => { btn.style.filter = 'brightness(1.2)'; });
      btn.addEventListener('mouseleave', () => { btn.style.filter = ''; });
    });

    return div;
  }
}
