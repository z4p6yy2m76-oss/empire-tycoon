// ============================================================
// HUDUI.ts — 顶部信息栏
// 回合/CPI/经济周期/层信息 + 玩家状态卡片
// ============================================================

import { state } from '../core/StateManager';
import type { Player } from '../entities/Player';

export class HUDUI {
  private el: HTMLElement;
  private turnEl: HTMLElement;
  private cpiEl: HTMLElement;
  private cycleEl: HTMLElement;
  private layerEl: HTMLElement;
  private playersEl: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
    this.turnEl = el.querySelector('#hud-turn')!;
    this.cpiEl = el.querySelector('#hud-cpi')!;
    this.cycleEl = el.querySelector('#hud-cycle')!;
    this.layerEl = el.querySelector('#hud-layer')!;
    this.playersEl = el.querySelector('#hud-players')!;
  }

  /** 刷新 HUD 全部数据 */
  refresh(players: Player[], currentLayerName: string): void {
    // 回合信息
    this.turnEl.textContent = `第 ${state.roundNumber} 轮 · 回合 ${state.turnNumber}`;
    this.cpiEl.textContent = `CPI: ${state.economy.cpi.toFixed(1)} (x${state.economy.cpiMultiplier.toFixed(2)})`;

    this.cycleEl.textContent = `经济: 正常`;

    this.layerEl.textContent = currentLayerName;

    // 玩家卡片
    const currentId = state.getCurrentPlayerId();
    this.playersEl.innerHTML = players
      .filter(p => !p.bankrupt)
      .map(p => `
        <div class="hud-player-card${p.id === currentId ? ' active' : ''}${p.bankrupt ? ' bankrupt' : ''}">
          <span class="hud-player-dot" style="background:${p.color}"></span>
          <span class="hud-player-name">${p.name}</span>
          <span class="hud-player-cash">$${p.cash.toLocaleString()}</span>
          ${!p.isHuman ? '<span class="hud-player-ai-badge">AI</span>' : ''}
        </div>
      `).join('');
  }

  show(): void { this.el.style.display = 'flex'; }
  hide(): void { this.el.style.display = 'none'; }
}
