// ============================================================
// OnlineModalUI.ts — 联机模式自定义弹窗
// 替换浏览器原生 prompt()，提供身份选择→房间码→昵称三步流程
// 支持回车提交、ESC取消、输入校验、自定义样式投屏适配
// ============================================================

export type OnlineIdentity = 'host' | 'join';

export interface OnlineConfig {
  identity: OnlineIdentity;
  roomCode: string;
  nickname: string;
}

export class OnlineModalUI {
  private overlay: HTMLElement;
  private panelIdentity: HTMLElement;
  private panelCode: HTMLElement;
  private panelName: HTMLElement;
  private inputCode: HTMLInputElement;
  private inputName: HTMLInputElement;
  private errorCode: HTMLElement;
  private errorName: HTMLElement;
  private identity: OnlineIdentity = 'host';
  private resolve: ((result: OnlineConfig | null) => void) | null = null;

  constructor() {
    this.overlay = this.createOverlay();
    document.body.appendChild(this.overlay);

    this.panelIdentity = this.overlay.querySelector('#online-panel-identity')!;
    this.panelCode = this.overlay.querySelector('#online-panel-code')!;
    this.panelName = this.overlay.querySelector('#online-panel-name')!;
    this.inputCode = this.overlay.querySelector('#online-input-code')! as HTMLInputElement;
    this.inputName = this.overlay.querySelector('#online-input-name')! as HTMLInputElement;
    this.errorCode = this.overlay.querySelector('#online-error-code')!;
    this.errorName = this.overlay.querySelector('#online-error-name')!;

    this.bindEvents();
    this.bindKeyboard();
  }

  /** 显示弹窗，返回用户的选择结果（Promise） */
  show(): Promise<OnlineConfig | null> {
    return new Promise(resolve => {
      this.resolve = resolve;
      this.reset();
      this.overlay.style.display = 'flex';
    });
  }

  /** 重置所有面板状态 */
  private reset(): void {
    this.identity = 'host';
    this.inputCode.value = '';
    this.inputName.value = '';
    this.errorCode.textContent = '';
    this.errorName.textContent = '';
    this.inputCode.style.borderColor = '';
    this.inputName.style.borderColor = '';
    this.showPanel('identity');
  }

  /** 切换显示的面板 */
  private showPanel(panel: 'identity' | 'code' | 'name'): void {
    this.panelIdentity.style.display = panel === 'identity' ? 'block' : 'none';
    this.panelCode.style.display = panel === 'code' ? 'block' : 'none';
    this.panelName.style.display = panel === 'name' ? 'block' : 'none';

    // 自动聚焦输入框
    setTimeout(() => {
      if (panel === 'code') this.inputCode.focus();
      if (panel === 'name') this.inputName.focus();
    }, 100);
  }

  /** 输入校验：房间码必须4位字母或数字 */
  private validateCode(): boolean {
    const code = this.inputCode.value.trim().toUpperCase();
    this.inputCode.value = code; // 自动转大写

    if (code.length !== 4) {
      this.showError(this.errorCode, this.inputCode, '房间码需为 4 位字母或数字');
      return false;
    }
    if (!/^[A-Z0-9]{4}$/.test(code)) {
      this.showError(this.errorCode, this.inputCode, '房间码只能包含字母和数字');
      return false;
    }

    this.errorCode.textContent = '';
    this.inputCode.style.borderColor = '';
    return true;
  }

  /** 输入校验：昵称2-8个字符 */
  private validateName(): boolean {
    const name = this.inputName.value.trim();

    if (name.length < 2) {
      this.showError(this.errorName, this.inputName, '昵称至少 2 个字符');
      return false;
    }
    if (name.length > 8) {
      this.showError(this.errorName, this.inputName, '昵称最多 8 个字符');
      return false;
    }

    this.errorName.textContent = '';
    this.inputName.style.borderColor = '';
    return true;
  }

  /** 显示校验错误 */
  private showError(el: HTMLElement, input: HTMLInputElement, msg: string): void {
    el.textContent = msg;
    input.style.borderColor = '#E74C3C';
    input.focus();
  }

  /** 生成4位随机房间码 */
  static generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉容易混淆的 I O 0 1
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  // ---- 事件绑定 ----
  private bindEvents(): void {
    // Panel 1: 身份选择
    this.overlay.querySelector('#online-btn-host')!.addEventListener('click', () => {
      this.identity = 'host';
      this.inputName.value = '房主';
      this.showPanel('name');
    });

    this.overlay.querySelector('#online-btn-join')!.addEventListener('click', () => {
      this.identity = 'join';
      this.showPanel('code');
    });

    this.overlay.querySelector('#online-btn-cancel')!.addEventListener('click', () => {
      this.resolve?.(null);
      this.overlay.style.display = 'none';
    });

    // Panel 2: 房间码 → 下一步
    this.overlay.querySelector('#online-btn-code-next')!.addEventListener('click', () => {
      if (this.validateCode()) {
        this.inputName.value = '玩家';
        this.showPanel('name');
      }
    });

    this.overlay.querySelector('#online-btn-code-back')!.addEventListener('click', () => {
      this.showPanel('identity');
    });

    // Panel 3: 昵称 → 确认
    this.overlay.querySelector('#online-btn-name-confirm')!.addEventListener('click', () => {
      if (this.validateName()) {
        this.overlay.style.display = 'none';
        const result: OnlineConfig = {
          identity: this.identity,
          roomCode: this.identity === 'host'
            ? OnlineModalUI.generateRoomCode()
            : this.inputCode.value.trim().toUpperCase(),
          nickname: this.inputName.value.trim(),
        };
        this.resolve?.(result);
      }
    });

    this.overlay.querySelector('#online-btn-name-back')!.addEventListener('click', () => {
      if (this.identity === 'host') {
        this.showPanel('identity');
      } else {
        this.showPanel('code');
      }
    });

    // 点击遮罩关闭
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.resolve?.(null);
        this.overlay.style.display = 'none';
      }
    });
  }

  /** 键盘支持 */
  private bindKeyboard(): void {
    document.addEventListener('keydown', (e) => {
      if (this.overlay.style.display !== 'flex') return;

      if (e.key === 'Escape') {
        this.resolve?.(null);
        this.overlay.style.display = 'none';
        return;
      }

      if (e.key === 'Enter') {
        if (this.panelCode.style.display !== 'none') {
          (this.overlay.querySelector('#online-btn-code-next') as HTMLElement)?.click();
        } else if (this.panelName.style.display !== 'none') {
          (this.overlay.querySelector('#online-btn-name-confirm') as HTMLElement)?.click();
        }
      }
    });
  }

  // ---- 创建 DOM 结构（内联样式，投屏适配） ----
  private createOverlay(): HTMLElement {
    const div = document.createElement('div');
    div.id = 'online-modal';
    div.style.cssText = `
      display: none; position: fixed; inset: 0;
      background: rgba(0,0,0,0.6); z-index: 1000;
      align-items: center; justify-content: center;
    `;
    div.innerHTML = `
      <div style="
        background: #1a1a2e; border-radius: 16px; padding: 36px 40px;
        min-width: 420px; max-width: 480px; text-align: center;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1);
      ">

        <!-- Panel 1: 选择身份 -->
        <div id="online-panel-identity">
          <h2 style="margin:0 0 8px;font-size:24px;color:#FFD700;">选择身份</h2>
          <p style="font-size:14px;color:#999;margin-bottom:24px;">你是房主还是加入者？</p>
          <button id="online-btn-host" style="
            width:100%;padding:14px;font-size:18px;font-weight:bold;border:none;border-radius:10px;
            cursor:pointer;color:#fff;background:linear-gradient(135deg,#2ECC71,#27AE60);
            margin-bottom:12px;transition:filter 0.2s;
          ">创建房间（房主）</button>
          <button id="online-btn-join" style="
            width:100%;padding:14px;font-size:18px;font-weight:bold;border:none;border-radius:10px;
            cursor:pointer;color:#fff;background:linear-gradient(135deg,#3498DB,#2980B9);
            margin-bottom:16px;transition:filter 0.2s;
          ">加入房间</button>
          <button id="online-btn-cancel" style="
            background:none;border:1px solid #555;color:#999;padding:8px 32px;
            border-radius:8px;font-size:14px;cursor:pointer;
          ">取消</button>
        </div>

        <!-- Panel 2: 输入房间码 -->
        <div id="online-panel-code" style="display:none;">
          <h2 style="margin:0 0 8px;font-size:24px;color:#3498DB;">输入房间码</h2>
          <p style="font-size:14px;color:#999;margin-bottom:16px;">请输入房主提供的 4 位房间码</p>
          <input id="online-input-code" maxlength="4" placeholder="例如 8F3A" style="
            width:100%;padding:14px;font-size:28px;text-align:center;letter-spacing:8px;
            border:2px solid #3498DB;border-radius:10px;background:#0d1117;color:#FFF;
            outline:none;box-sizing:border-box;
          " />
          <p id="online-error-code" style="color:#E74C3C;font-size:14px;min-height:20px;margin:6px 0;"></p>
          <button id="online-btn-code-next" style="
            width:100%;padding:12px;font-size:18px;font-weight:bold;border:none;border-radius:10px;
            cursor:pointer;color:#fff;background:linear-gradient(135deg,#3498DB,#2980B9);
            margin-bottom:8px;transition:filter 0.2s;
          ">下一步</button>
          <button id="online-btn-code-back" style="
            background:none;border:1px solid #555;color:#999;padding:8px 32px;
            border-radius:8px;font-size:14px;cursor:pointer;
          ">返回</button>
        </div>

        <!-- Panel 3: 输入昵称 -->
        <div id="online-panel-name" style="display:none;">
          <h2 style="margin:0 0 8px;font-size:24px;color:#FFD700;">输入昵称</h2>
          <p style="font-size:14px;color:#999;margin-bottom:16px;">2-8 个字符</p>
          <input id="online-input-name" maxlength="8" placeholder="你的昵称" style="
            width:100%;padding:14px;font-size:22px;text-align:center;
            border:2px solid #FFD700;border-radius:10px;background:#0d1117;color:#FFF;
            outline:none;box-sizing:border-box;
          " />
          <p id="online-error-name" style="color:#E74C3C;font-size:14px;min-height:20px;margin:6px 0;"></p>
          <button id="online-btn-name-confirm" style="
            width:100%;padding:12px;font-size:18px;font-weight:bold;border:none;border-radius:10px;
            cursor:pointer;color:#fff;background:linear-gradient(135deg,#2ECC71,#27AE60);
            margin-bottom:8px;transition:filter 0.2s;
          ">确认，开始联机</button>
          <button id="online-btn-name-back" style="
            background:none;border:1px solid #555;color:#999;padding:8px 32px;
            border-radius:8px;font-size:14px;cursor:pointer;
          ">返回</button>
        </div>

      </div>
    `;

    // 按钮 hover 效果（全局）
    div.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('mouseenter', () => { btn.style.filter = 'brightness(1.2)'; });
      btn.addEventListener('mouseleave', () => { btn.style.filter = ''; });
    });

    return div;
  }
}

/** 单例 */
export const onlineModal = new OnlineModalUI();
