// ============================================================
// NotificationUI.ts — 浮动通知
// 屏幕中央大字提示：轮到 XX、金额变化、特殊事件
// ============================================================

export class NotificationUI {
  private el: HTMLElement;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(el: HTMLElement) {
    this.el = el;
  }

  /** 显示通知，duration 毫秒后自动消失 */
  show(text: string, duration: number = 2000, color: string = '#FFD700'): void {
    if (this.timer) clearTimeout(this.timer);

    this.el.textContent = text;
    this.el.style.color = color;
    this.el.classList.add('show');

    this.timer = setTimeout(() => {
      this.el.classList.remove('show');
      this.timer = null;
    }, duration);
  }

  /** 轮到某某 */
  playerTurn(name: string): void {
    this.show(`轮到 ${name}`, 1800, '#FFD700');
  }

  /** 金钱变化 */
  moneyChange(amount: number): void {
    if (amount > 0) {
      this.show(`+ $${amount.toLocaleString()}`, 1500, '#2ECC71');
    } else {
      this.show(`- $${Math.abs(amount).toLocaleString()}`, 1500, '#E74C3C');
    }
  }

  /** 入狱 */
  jailEntrance(name: string): void {
    this.show(`${name} 入狱!`, 2000, '#E74C3C');
  }

  /** 破产 */
  bankruptcy(name: string): void {
    this.show(`${name} 破产!`, 3000, '#E74C3C');
  }

  /** 抽卡 */
  cardDrawn(name: string): void {
    this.show(`${name} 抽到卡牌`, 1500, '#3498DB');
  }

  /** 层切换 */
  layerSwitch(layerName: string): void {
    this.show(`进入: ${layerName}`, 1500, '#9B59B6');
  }

  /** 拍卖开始 */
  auctionStart(tileName: string): void {
    this.show(`拍卖: ${tileName}`, 2000, '#F39C12');
  }
}
