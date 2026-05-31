// ============================================================
// ModalUI.ts — 弹窗系统
// 卡牌展示、拍卖界面、地产详情、游戏结束结算
// ============================================================

export interface ModalButton {
  text: string;
  cssClass: string;
  onClick: () => void;
}

export class ModalUI {
  private overlay: HTMLElement;
  private content: HTMLElement;

  constructor(overlay: HTMLElement, content: HTMLElement) {
    this.overlay = overlay;
    this.content = content;
    // 点击遮罩关闭
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.hide();
    });
  }

  /** 通用弹窗 */
  show(title: string, body: string, buttons: ModalButton[] = []): void {
    this.content.className = 'modal-card';
    const btnHtml = buttons.map((b, i) =>
      `<button class="modal-btn ${b.cssClass}" data-modal-btn="${i}">${b.text}</button>`
    ).join('');

    this.content.innerHTML = `
      <div class="modal-title">${title}</div>
      <div class="modal-body">${body}</div>
      ${btnHtml ? `<div>${btnHtml}</div>` : ''}
    `;

    // 绑定按钮事件
    buttons.forEach((b, i) => {
      const el = this.content.querySelector(`[data-modal-btn="${i}"]`);
      if (el) el.addEventListener('click', b.onClick);
    });

    this.overlay.classList.add('visible');
  }

  /** 游戏结束弹窗 */
  showGameOver(winnerName: string, winnerColor: string, netWorth: number, cash: number, properties: number, turns: number, onReplay: () => void, onMenu: () => void): void {
    this.content.className = 'modal-card gameover';
    this.content.innerHTML = `
      <div style="font-size:42px;margin-bottom:8px;">🏆</div>
      <div class="modal-title" style="color:${winnerColor};">${winnerName} 获胜!</div>
      <div class="gameover-stats">
        <div class="gameover-stat">
          <div class="gameover-stat-val">$${netWorth.toLocaleString()}</div>
          <div class="gameover-stat-label">总资产</div>
        </div>
        <div class="gameover-stat">
          <div class="gameover-stat-val">$${cash.toLocaleString()}</div>
          <div class="gameover-stat-label">现金</div>
        </div>
        <div class="gameover-stat">
          <div class="gameover-stat-val">${properties}</div>
          <div class="gameover-stat-label">地产</div>
        </div>
        <div class="gameover-stat">
          <div class="gameover-stat-val">${turns}</div>
          <div class="gameover-stat-label">回合</div>
        </div>
      </div>
      <div style="margin-top:16px;">
        <button class="modal-btn btn-buy" id="btn-replay">再来一局</button>
        <button class="modal-btn btn-end-turn" id="btn-menu">返回菜单</button>
      </div>
    `;
    this.content.querySelector('#btn-replay')?.addEventListener('click', onReplay);
    this.content.querySelector('#btn-menu')?.addEventListener('click', onMenu);
    this.overlay.classList.add('visible');
  }

  /** 卡牌弹窗 */
  showCard(cardName: string, cardDesc: string, flavor: string, onClose: () => void): void {
    this.show(cardName, `${cardDesc}<br><br><em style="color:#95A5A6;font-size:12px;">${flavor}</em>`, [
      { text: '确定', cssClass: 'btn-end-turn', onClick: () => { onClose(); this.hide(); } }
    ]);
  }

  /** 拍卖弹窗 */
  showAuction(tileName: string, currentPrice: number, minPrice: number, onBid: () => void, onPass: () => void): void {
    this.show('荷兰式拍卖', `
      <div style="font-size:18px;color:#F39C12;margin:8px 0;">${tileName}</div>
      <div style="font-size:28px;font-weight:bold;color:#FFD700;">$${currentPrice.toLocaleString()}</div>
      <div style="font-size:12px;color:#95A5A6;">底价: $${minPrice.toLocaleString()}</div>
    `, [
      { text: '出价竞拍', cssClass: 'btn-auction', onClick: () => { onBid(); this.hide(); } },
      { text: '放弃', cssClass: 'btn-skip', onClick: () => { onPass(); this.hide(); } },
    ]);
  }

  /** 股票交易面板 */
  showStockPanel(stocks: Array<{ id: string; symbol: string; name: string; price: number; change: number; trend: string; }>, cash: number, onBuy: (stockId: string, shares: number) => void, onSell: (stockId: string) => void, onShort: (stockId: string, shares: number) => void, onClose: () => void): void {
    this.content.className = 'modal-card';
    this.content.style.maxWidth = '600px';
    const rows = stocks.map(s => {
      const color = s.change >= 0 ? '#2ECC71' : '#E74C3C';
      const arrow = s.change >= 0 ? '▲' : '▼';
      return `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
          <td style="padding:6px 8px;font-size:13px;color:#FFD700;">${s.symbol}</td>
          <td style="padding:6px 8px;font-size:12px;color:#CCC;">${s.name}</td>
          <td style="padding:6px 8px;font-size:14px;font-weight:bold;color:${color};">$${s.price} <span style="font-size:11px;">${arrow}${Math.abs(s.change)}</span></td>
          <td style="padding:6px 8px;font-size:11px;color:#95A5A6;">${s.trend}</td>
          <td style="padding:6px 4px;">
            <button class="modal-btn btn-buy stock-buy-btn" data-stock="${s.id}" style="padding:4px 10px;font-size:11px;margin:0 2px;">买入</button>
            <button class="modal-btn btn-danger stock-short-btn" data-stock="${s.id}" style="padding:4px 10px;font-size:11px;margin:0 2px;">做空</button>
          </td>
        </tr>`;
    }).join('');

    this.content.innerHTML = `
      <div class="modal-title">📈 股票交易所</div>
      <div style="font-size:12px;color:#2ECC71;margin-bottom:8px;">现金: $${cash.toLocaleString()}</div>
      <div style="max-height:320px;overflow-y:auto;">
        <table style="width:100%;border-collapse:collapse;">${rows}</table>
      </div>
      <div style="margin-top:12px;font-size:10px;color:#666;">
        买入=做多(低买高卖) | 做空=借股卖出(高卖低买回购)
      </div>
      <button class="modal-btn btn-skip" id="stock-close-btn" style="margin-top:10px;">离开交易所</button>
    `;

    // 绑定事件
    this.content.querySelectorAll('.stock-buy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const stockId = (btn as HTMLElement).dataset.stock!;
        const shares = 10; // 默认买入10股
        if (shares > 0) onBuy(stockId, shares);
      });
    });
    this.content.querySelectorAll('.stock-short-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const stockId = (btn as HTMLElement).dataset.stock!;
        const shares = 10; // 默认做空10股
        if (shares > 0) onShort(stockId, shares);
      });
    });
    this.content.querySelector('#stock-close-btn')?.addEventListener('click', () => { this.hide(); onClose(); });

    this.overlay.classList.add('visible');
  }

  hide(): void {
    this.overlay.classList.remove('visible');
    (this.content as HTMLElement).style.maxWidth = '';
  }
}
