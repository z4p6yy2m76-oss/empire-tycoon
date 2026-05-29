// ============================================================
// DashboardUI.ts — 右侧 Bloomberg 风格数据仪表盘
// CPI趋势/股票行情/玩家状态/经济周期
// ============================================================

import { state } from '../core/StateManager';
import { type StockEntry } from '../core/StateManager';
import type { Player } from '../entities/Player';

export class DashboardUI {
  private el: HTMLElement;
  private economyEl: HTMLElement;
  private stocksEl: HTMLElement;
  private playersEl: HTMLElement;
  private crisisEl: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
    this.economyEl = el.querySelector('#dash-economy')!;
    this.stocksEl = el.querySelector('#dash-stocks')!;
    this.playersEl = el.querySelector('#dash-players')!;
    this.crisisEl = el.querySelector('#dash-crisis')!;
  }

  refresh(players: Player[], stocks: StockEntry[], cycle: string, crisis: string | null): void {
    // 经济指标
    const cpiPct = Math.round((state.economy.cpi - 100));
    const cpiBarWidth = Math.min(100, Math.max(0, state.economy.cpi / 2));
    const cycleClass = cycle === 'BOOM' ? 'dash-cycle-boom' : cycle === 'RECESSION' ? 'dash-cycle-recession' : 'dash-cycle-normal';
    const cycleLabel = cycle === 'BOOM' ? '繁荣' : cycle === 'RECESSION' ? '衰退' : '正常';
    this.economyEl.innerHTML = `
      <div class="dash-title">📊 经济指标</div>
      <div style="font-size:22px;font-weight:bold;color:#FFF;">CPI ${state.economy.cpi.toFixed(1)}</div>
      <div style="font-size:11px;color:#AAA;">${cpiPct >= 0 ? '+' : ''}${cpiPct} pts</div>
      <div class="dash-cpi-bar"><div class="dash-cpi-fill" style="width:${cpiBarWidth}%"></div></div>
      <div style="margin-top:6px;font-size:11px;">
        <span style="color:#AAA;">利率 ${(state.economy.interestRate * 100).toFixed(1)}%</span>
        <span class="dash-cycle-tag ${cycleClass}" style="margin-left:8px;">${cycleLabel}</span>
      </div>
    `;

    // 股票行情
    let stockHtml = '<div class="dash-title">📈 股票行情</div>';
    stocks.slice(0, 6).forEach(s => {
      const prev = s.history.length >= 2 ? s.history[s.history.length - 2] : s.price;
      const change = s.price - prev;
      const cls = change >= 0 ? 'dash-stock-up' : 'dash-stock-down';
      const arrow = change >= 0 ? '▲' : '▼';
      stockHtml += `<div class="dash-stock-row"><span style="color:#FFD700;">${s.symbol}</span> <span style="color:#AAA;font-size:10px;">${s.name}</span><span class="${cls}">$${s.price} ${arrow}</span></div>`;
    });
    this.stocksEl.innerHTML = stockHtml;

    // 玩家状态
    let playerHtml = '<div class="dash-title">👥 玩家资产</div>';
    players.filter(p => !p.bankrupt).sort((a, b) => b.netWorth - a.netWorth).forEach(p => {
      const persona = !p.isHuman ? this.getPersona(p.aiPersonality) : '';
      playerHtml += `<div class="dash-player-mini">
        <span class="dash-player-dot" style="background:${p.color}"></span>
        <span style="flex:1;color:#ECF0F1">${p.name}</span>
        <span style="color:#2ECC71;">$${p.netWorth.toLocaleString()}</span>
        <span style="color:#666;font-size:9px;">${persona}</span>
      </div>`;
    });
    this.playersEl.innerHTML = playerHtml;

    // 灾变提醒
    if (crisis) {
      this.crisisEl.style.display = 'block';
      this.crisisEl.innerHTML = `<div class="dash-title">⚠️ 灾变预警</div><div style="font-size:11px;color:#E74C3C;">${crisis}</div>`;
    } else {
      this.crisisEl.style.display = 'none';
    }
  }

  private getPersona(personality: string): string {
    const map: Record<string, string> = {
      conservative: '保守', aggressive: '激进', balanced: '均衡',
      gambler: '赌徒', landlord: '地主', random: '随机',
    };
    return map[personality] ?? '';
  }

  show(): void { this.el.style.display = 'flex'; }
  hide(): void { this.el.style.display = 'none'; }
}
