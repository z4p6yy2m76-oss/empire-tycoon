import { MainMenuUI } from './MainMenuUI';
import { HUDUI } from './HUDUI';
import { ActionPanel } from './ActionPanel';
import { ModalUI } from './ModalUI';
import { EventLogUI } from './EventLogUI';
import { NotificationUI } from './NotificationUI';
import { DashboardUI } from './DashboardUI';
import { LobbyUI } from './LobbyUI';

export class UIManager {
  mainMenu: MainMenuUI;
  hud: HUDUI;
  actions: ActionPanel;
  modal: ModalUI;
  log: EventLogUI;
  notify: NotificationUI;
  dashboard: DashboardUI;
  lobby: LobbyUI;

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
    this.dashboard = new DashboardUI(this.root.querySelector('#dashboard')!);
    this.lobby = new LobbyUI();
  }

  enterGame(): void {
    this.mainMenu.hide();
    this.hud.show();
    this.actions.show();
    this.log.show();
    this.dashboard.show();
    this.shortcutBar.style.display = 'flex';
  }

  returnToMenu(): void {
    this.hud.hide();
    this.actions.hide();
    this.log.hide();
    this.dashboard.hide();
    this.modal.hide();
    this.mainMenu.show();
    this.actions.clear();
    this.shortcutBar.style.display = 'none';
  }

  setPaused(paused: boolean): void {
    if (paused) { this.actions.hide(); } else { this.actions.show(); }
  }
}

export const ui = new UIManager();
