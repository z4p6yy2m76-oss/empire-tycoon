// ============================================================
// MathUtils.ts — 数学工具函数
// ============================================================

/** 钳制值到 [min, max] */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 线性插值 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 角度转弧度 */
export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** 弧度转角度 */
export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** 两点距离 */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/** 格式化金额 */
export function formatMoney(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`;
  return `$${amount}`;
}

/** 百分比 */
export function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** 简单的 UUID（非标准，够用） */
export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** 延迟执行（Promise） */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
