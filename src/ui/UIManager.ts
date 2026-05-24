// ============================================================
// UIManager.ts — UI 总管
// 管理所有 HTML UI 模块的引用、生命周期、事件路由
// ============================================================

import { MainMenuUI } from './MainMenuUI';
import { HUDUI } from './HUDUI';
import { ActionPanel } from './ActionPanel';
import { ModalUI } from './ModalUI';
import { EventLogUI } from './EventLogUI';
import { NotificationUI } from './NotificationUI';

export class UIManager {
  mainMenu: MainMenuUI;
  hud: HUDUI;
  actions: ActionPanel;
  modal: ModalUI;
  log: EventLogUI;
  notify: NotificationUI;

  private root: HTMLElement;
  private shortcutBar: HTMLElement;

  constructor() {
    this.root = document.getElementById('ui-layer')!;
    this.shortcutBar = document.getElementById('shortcut-bar')!;

    this.mainMenu = new MainMenuUI(this.root.querySelector('#main-menu')!);
    this.hud = new HUDUI(this.root.querySelector('#hud-bar')!);
    this.actions = new ActionPanel(this.root.querySelector('#action-panel')!);
    this.modal = new ModalUI(this.root.querySelector('#modal-overlay')!, this.root.querySelector('#modal-content')!);
    this.log = new EventLogUI(this.root.querySelector('#event-log')!);
    this.notify = new NotificationUI(this.root.querySelector('#notification')!);
  }

  /** 切换到游戏内 UI（隐藏菜单，显示 HUD） */
  enterGame(): void {
    this.mainMenu.hide();
    this.hud.show();
    this.actions.show();
    this.log.show();
    this.shortcutBar.style.display = 'flex';
  }

  /** 返回主菜单 */
  returnToMenu(): void {
    this.hud.hide();
    this.actions.hide();
    this.log.hide();
    this.modal.hide();
    this.mainMenu.show();
    this.actions.clear();
    this.shortcutBar.style.display = 'none';
  }

  /** 暂停状态 */
  setPaused(paused: boolean): void {
    if (paused) {
      this.actions.hide();
    } else {
      this.actions.show();
    }
  }
}

export const ui = new UIManager();
