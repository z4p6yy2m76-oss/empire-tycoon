// ============================================================
// LayoutConfig.ts — 全局动态视口网格系统
// 整个Canvas划分为4个绝对不重叠的矩形区域
// 所有渲染模块必须基于此配置计算坐标，禁止硬编码
// ============================================================

export interface ViewportBox {
  x: number; y: number;
  width: number; height: number;
}

export interface GameLayout {
  hud: ViewportBox;       // 顶部信息栏
  actions: ViewportBox;   // 底部操作按钮区
  dashboard: ViewportBox; // 右侧仪表盘
  board: ViewportBox;     // 棋盘区域（核心）
}

const HUD_HEIGHT = 56;
const ACTIONS_HEIGHT = 64;
const DASHBOARD_WIDTH = 260;

/**
 * 基于 canvas 实际尺寸，动态计算四大视口区域
 * 所有坐标相对于 canvas (0,0) 原点
 */
export function computeLayout(canvasW: number, canvasH: number): GameLayout {
  const hud: ViewportBox = {
    x: 0, y: 0,
    width: canvasW,
    height: HUD_HEIGHT,
  };

  const actions: ViewportBox = {
    x: 0,
    y: canvasH - ACTIONS_HEIGHT,
    width: canvasW - DASHBOARD_WIDTH,
    height: ACTIONS_HEIGHT,
  };

  const dashboard: ViewportBox = {
    x: canvasW - DASHBOARD_WIDTH,
    y: HUD_HEIGHT,
    width: DASHBOARD_WIDTH,
    height: canvasH - HUD_HEIGHT,
  };

  // 棋盘：嵌入剩余空间，上下左右留边距
  const boardMargin = 12;
  const board: ViewportBox = {
    x: boardMargin,
    y: HUD_HEIGHT + boardMargin,
    width: dashboard.x - boardMargin * 2,
    height: canvasH - HUD_HEIGHT - ACTIONS_HEIGHT - boardMargin * 2,
  };

  return { hud, actions, dashboard, board };
}

/**
 * 在棋盘矩形内计算正方形成比例内嵌区域（居中）
 * 棋盘格子在此正方形内绘制
 */
export function computeBoardInner(board: ViewportBox, aspectRatio: number = 1.0): ViewportBox {
  const maxW = board.width;
  const maxH = board.height;
  let w: number, h: number;

  if (maxW / maxH > aspectRatio) {
    // 宽度富余，以高度为准
    h = maxH;
    w = h * aspectRatio;
  } else {
    // 高度富余，以宽度为准
    w = maxW;
    h = w / aspectRatio;
  }

  return {
    x: board.x + (maxW - w) / 2,
    y: board.y + (maxH - h) / 2,
    width: w,
    height: h,
  };
}

/**
 * 在矩形边框上均匀分布 N 个点（用于矩形棋盘布局）
 * 返回每个点的 {x, y}, 起点为左上角，顺时针
 */
export function distributeOnRect(rect: ViewportBox, count: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  // 计算各边配比: 4角 + top + right + bottom + left = count
  const sideSlots = count - 4;
  const topCount = Math.round(sideSlots * 0.45);  // 上下各45%
  const bottomCount = topCount;
  const sideRemaining = sideSlots - topCount - bottomCount;
  const rightCount = Math.round(sideRemaining / 2);
  const leftCount = sideRemaining - rightCount;

  // 角落
  const TL = { x: rect.x, y: rect.y };
  const TR = { x: rect.x + rect.width, y: rect.y };
  const BR = { x: rect.x + rect.width, y: rect.y + rect.height };
  const BL = { x: rect.x, y: rect.y + rect.height };

  // 索引映射
  const iTR = topCount + 1;
  const iBR = iTR + rightCount + 1;
  const iBL = iBR + bottomCount + 1;

  for (let i = 0; i < count; i++) {
    if (i === 0) { points.push(TL); }
    else if (i === iTR) { points.push(TR); }
    else if (i === iBR) { points.push(BR); }
    else if (i === iBL) { points.push(BL); }
    else if (i > 0 && i < iTR) {
      const t = i / (topCount + 1);
      points.push({ x: Math.round(TL.x + rect.width * t), y: TL.y });
    }
    else if (i > iTR && i < iBR) {
      const t = (i - iTR) / (rightCount + 1);
      points.push({ x: TR.x, y: Math.round(TR.y + rect.height * t) });
    }
    else if (i > iBR && i < iBL) {
      const t = (i - iBR) / (bottomCount + 1);
      points.push({ x: Math.round(BR.x + (BL.x - BR.x) * t), y: BR.y });
    }
    else if (i > iBL) {
      const t = (i - iBL) / (leftCount + 1);
      points.push({ x: BL.x, y: Math.round(BL.y + (TL.y - BL.y) * t) });
    }
  }

  return points;
}

export const LAYOUT = {
  HUD_HEIGHT,
  ACTIONS_HEIGHT,
  DASHBOARD_WIDTH,
};
