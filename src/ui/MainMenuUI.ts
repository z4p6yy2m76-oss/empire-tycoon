// ============================================================
// MainMenuUI.ts — 主菜单
// Logo、模式选择卡片、难度切换
// ============================================================

import { state, GameMode, AIDifficulty } from '../core/StateManager';

export class MainMenuUI {
  private el: HTMLElement;
  private cards: NodeListOf<HTMLElement>;
  private diffBtns: NodeListOf<HTMLElement>;

  onStartGame: ((mode: GameMode) => void) | null = null;

  constructor(el: HTMLElement) {
    this.el = el;

    // 模式卡片点击
    this.cards = el.querySelectorAll('.menu-card');
    this.cards.forEach(card => {
      card.addEventListener('click', () => {
        const mode = card.dataset.mode as string;
        const gameMode = mode === 'ai' ? GameMode.AI_SINGLE
          : mode === 'hotseat' ? GameMode.HOT_SEAT
          : GameMode.ONLINE;
        if (gameMode === GameMode.ONLINE) {
          this.handleOnlineMode();
          return;
        }
        state.settings.mode = gameMode;
        state.settings.playerCount = mode === 'ai' ? 4 : 4;
        state.settings.humanPlayers = mode === 'ai' ? 1 : 4;
        this.onStartGame?.(gameMode);
      });
    });

    // 难度按钮
    this.diffBtns = el.querySelectorAll('.menu-diff-btn');
    this.diffBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const diff = btn.dataset.diff as string;
        state.settings.aiDifficulty = diff as AIDifficulty;
        this.diffBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  }

  private handleOnlineMode(): void {
    // 直接进入联机流程，房间码/身份/昵称由 OnlineModalUI 自定义弹窗收集
    state.settings.mode = GameMode.ONLINE;
    this.onStartGame?.(GameMode.ONLINE);
  }

  show(): void { this.el.style.display = 'flex'; }
  hide(): void { this.el.style.display = 'none'; }
}
