// ============================================================
// ActionPanel.ts — 底部操作按钮区
// 动态生成购买/升级/拍卖/结束等按钮
// ============================================================

export interface ActionButton {
  id: string;
  text: string;
  cssClass: string;
  disabled?: boolean;
  onClick: () => void;
}

export class ActionPanel {
  private el: HTMLElement;
  private buttons: Map<string, HTMLButtonElement> = new Map();

  constructor(el: HTMLElement) {
    this.el = el;
  }

  /** 设置一组按钮 */
  setButtons(btns: ActionButton[]): void {
    this.clear();
    btns.forEach(b => this.addButton(b));
  }

  /** 添加单个按钮 */
  addButton(btn: ActionButton): void {
    const el = document.createElement('button');
    el.className = `action-btn ${btn.cssClass}${btn.disabled ? ' disabled' : ''}`;
    el.textContent = btn.text;
    if (btn.disabled) el.classList.add('disabled');
    el.addEventListener('click', () => {
      if (!btn.disabled) btn.onClick();
    });
    this.buttons.set(btn.id, el);
    this.el.appendChild(el);
  }

  /** 更新按钮状态 */
  updateButton(id: string, disabled: boolean, text?: string): void {
    const btn = this.buttons.get(id);
    if (!btn) return;
    if (disabled) {
      btn.classList.add('disabled');
    } else {
      btn.classList.remove('disabled');
    }
    if (text) btn.textContent = text;
  }

  /** 清空所有按钮 */
  clear(): void {
    this.el.innerHTML = '';
    this.buttons.clear();
  }

  show(): void { this.el.style.display = 'flex'; }
  hide(): void { this.el.style.display = 'none'; }
}
