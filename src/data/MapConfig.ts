// ============================================================
// MapConfig.ts — 三层地图数据定义
// 地面层 + 地下铁层 + 天空层，每层约 30 格
// ============================================================

import { TileType } from '../entities/Tile';
import type { PropertyConfig } from '../entities/Tile';
import { GameSettings, GameMode } from '../core/StateManager';

export interface MapLayerConfig {
  name: string;
  index: number;
  color: string;
  tiles: MapTileConfig[];
}

export interface MapTileConfig {
  id: number;
  name: string;
  type: TileType;
  position: number;
  x: number;
  y: number;
  // Property
  property?: PropertyConfig;
  // Start
  salary?: number;
  // Jail
  bailAmount?: number;
  // Subway
  targetLayer?: number;
  targetPosition?: number;
  // Tax
  taxRate?: number;
  fixedAmount?: number;
  // Event
  cardCategory?: 'chance' | 'destiny';
}

// ---- 色组定义 ----
const COLOR_GROUPS: Record<string, { name: string; prices: number[]; rents: number[][]; upgradeCosts: number[] }> = {
  brown:   { name: '棕',   prices: [600, 600],   rents: [[20,40],[60,120],[180,360],[360,600]], upgradeCosts: [300, 400, 600] },
  cyan:    { name: '青',   prices: [800, 800, 900], rents: [[30,60],[80,160],[240,480],[400,720]], upgradeCosts: [400, 500, 700] },
  purple:  { name: '紫',   prices: [1000,1100,1200], rents: [[40,80],[120,240],[350,650],[550,900]], upgradeCosts: [500,600,800] },
  orange:  { name: '橙',   prices: [1400,1500,1600], rents: [[50,100],[150,300],[450,800],[700,1100]], upgradeCosts: [700,800,900] },
  red:     { name: '红',   prices: [1800,1900,2000], rents: [[60,120],[200,380],[550,950],[850,1300]], upgradeCosts: [900,1000,1100] },
  yellow:  { name: '黄',   prices: [2200,2300,2400], rents: [[70,140],[240,480],[650,1100],[1000,1500]], upgradeCosts: [1000,1100,1200] },
  green:   { name: '绿',   prices: [2600,2700,2800], rents: [[80,160],[280,560],[750,1200],[1100,1700]], upgradeCosts: [1100,1200,1300] },
  blue:    { name: '蓝',   prices: [3000,3200], rents: [[100,200],[350,600],[850,1300],[1200,1800]], upgradeCosts: [1200,1400,1600] },
};

// ---- 生成单层地图（矩形棋盘） ----
const TL = { x: 150, y: 100 };
const TR = { x: 1250, y: 100 };
const BR = { x: 1250, y: 800 };
const BL = { x: 150, y: 800 };

function getRectPos(idx: number, totalCount: number): { x: number; y: number } {
  // 30格布局: 4角 + 9(上) + 4(右) + 9(下) + 4(左) = 30
  // 通用公式: N = 4 + 2*TB + 2*LR, TB≈LR*2
  const sideTotal = totalCount - 4;
  const tb = Math.round(sideTotal * 0.69); // 上下各占约69%
  const lr = sideTotal - tb;
  const topCount = Math.round(tb / 2);
  const sideCount = Math.round(lr / 2);
  const botCount = tb - topCount;
  const leftCount = lr - sideCount;

  // 索引区间
  const iTR = topCount + 1;
  const iBR = iTR + sideCount + 1;
  const iBL = iBR + botCount + 1;
  const iEnd = iBL + leftCount + 1;

  if (idx === 0) return { x: TL.x, y: TL.y };
  if (idx === iTR) return { x: TR.x, y: TR.y };
  if (idx === iBR) return { x: BR.x, y: BR.y };
  if (idx === iBL) return { x: BL.x, y: BL.y };

  // 侧边格子插值：范围从 1/(n+1) 到 n/(n+1)，避免与角落重叠
  if (idx > 0 && idx < iTR) {
    const t = (idx) / (topCount + 1);
    return { x: Math.round(TL.x + (TR.x - TL.x) * t), y: TL.y };
  }
  if (idx > iTR && idx < iBR) {
    const t = (idx - iTR) / (sideCount + 1);
    return { x: TR.x, y: Math.round(TR.y + (BR.y - TR.y) * t) };
  }
  if (idx > iBR && idx < iBL) {
    const t = (idx - iBR) / (botCount + 1);
    return { x: Math.round(BR.x + (BL.x - BR.x) * t), y: BR.y };
  }
  // left side going up
  if (idx > iBL && idx < iEnd) {
    const t = (idx - iBL) / (leftCount + 1);
    return { x: BL.x, y: Math.round(BL.y + (TL.y - BL.y) * t) };
  }
  return { x: TL.x, y: TL.y };
}

function buildLayer(
  layerIndex: number,
  layerName: string,
  color: string,
  baseId: number,
  tileConfigs: any[],
  _radiusX: number,
  _radiusY: number,
  _centerX: number,
  _centerY: number,
): MapTileConfig[] {
  const count = tileConfigs.length;
  const tiles: MapTileConfig[] = [];

  for (let i = 0; i < count; i++) {
    const pos = getRectPos(i, count);
    const cfg = tileConfigs[i];
    tiles.push({
      id: baseId + i,
      name: cfg.name,
      type: cfg.type,
      position: i,
      x: pos.x,
      y: pos.y,
      ...(cfg.extra ?? {}),
      ...(cfg.property ? { property: cfg.property } : {}),
    });
  }

  return tiles;
}

// ---- 地产格子配置 ----
function prop(name: string, colorGroup: string, price: number, upgrades: number[], rents: number[][], mortgage: number): Partial<MapTileConfig> {
  return {
    name, type: TileType.PROPERTY,
    property: { basePrice: price, upgradeCosts: upgrades, rentTable: rents, colorGroup, mortgageValue: mortgage },
  } as Partial<MapTileConfig>;
}

// ---- 三层地图定义 ----
export function buildMapConfig(_settings?: GameSettings): MapLayerConfig[] {
  // 地面层 — 帝都金融街
  const groundTiles: any[] = [
    { name: '起点',              type: TileType.START,     extra: { salary: 2000 } },
    prop('王府井',   'brown',  600,  [300,400,600],  [[20,40],[60,120],[180,360],[360,600]],  300),
    { name: '机会',              type: TileType.EVENT,     extra: { cardCategory: 'chance' } },
    prop('南锣鼓巷', 'brown',  600,  [300,400,600],  [[20,40],[60,120],[180,360],[360,600]],  300),
    { name: '税务局',            type: TileType.TAX,       extra: { taxRate: 0.1 } },
    { name: '地铁1号线',         type: TileType.SUBWAY,    extra: { targetLayer: 1, targetPosition: 0 } },
    prop('三里屯',   'cyan',   800,  [400,500,700],  [[30,60],[80,160],[240,480],[400,720]],  400),
    { name: '命运',              type: TileType.EVENT,     extra: { cardCategory: 'destiny' } },
    prop('国贸CBD',  'cyan',   800,  [400,500,700],  [[30,60],[80,160],[240,480],[400,720]],  400),
    prop('蓝色港湾', 'cyan',   900,  [400,500,700],  [[30,60],[80,160],[240,480],[400,720]],  450),
    { name: '监狱',              type: TileType.JAIL,      extra: { bailAmount: 1000 } },
    prop('中关村',   'purple', 1000, [500,600,800],  [[40,80],[120,240],[350,650],[550,900]], 500 ),
    { name: '股票交易所',        type: TileType.STOCK },
    prop('望京SOHO', 'purple', 1100, [500,600,800],  [[40,80],[120,240],[350,650],[550,900]], 550 ),
    prop('金融街',   'purple', 1200, [500,600,800],  [[40,80],[120,240],[350,650],[550,900]], 600 ),
    { name: '地铁2号线',         type: TileType.SUBWAY,    extra: { targetLayer: 1, targetPosition: 10 } },
    prop('新光天地', 'orange', 1400, [700,800,900],  [[50,100],[150,300],[450,800],[700,1100]], 700 ),
    { name: '机会',              type: TileType.EVENT,     extra: { cardCategory: 'chance' } },
    prop('SKP商场',  'orange', 1500, [700,800,900],  [[50,100],[150,300],[450,800],[700,1100]], 750 ),
    prop('太古里',   'orange', 1600, [700,800,900],  [[50,100],[150,300],[450,800],[700,1100]], 800 ),
    { name: '机场',              type: TileType.AIRPORT },
    prop('陆家嘴',   'red',    1800, [900,1000,1100],[[60,120],[200,380],[550,950],[850,1300]], 900 ),
    { name: '命运',              type: TileType.EVENT,     extra: { cardCategory: 'destiny' } },
    prop('静安寺',   'red',    1900, [900,1000,1100],[[60,120],[200,380],[550,950],[850,1300]], 950 ),
    prop('新天地',   'red',    2000, [900,1000,1100],[[60,120],[200,380],[550,950],[850,1300]],1000 ),
    { name: '赌场',              type: TileType.CASINO },
    prop('珠江新城', 'yellow', 2200, [1000,1100,1200],[[70,140],[240,480],[650,1100],[1000,1500]],1100 ),
    prop('福田CBD',  'yellow', 2300, [1000,1100,1200],[[70,140],[240,480],[650,1100],[1000,1500]],1150 ),
    { name: '银行',              type: TileType.BANK },
    prop('前海自贸区','yellow', 2400, [1000,1100,1200],[[70,140],[240,480],[650,1100],[1000,1500]],1200 ),
  ];

  // 地下铁层 — 地下商业王国
  const undergroundTiles: any[] = [
    { name: '地下城入口',        type: TileType.START,     extra: { salary: 1500 } },
    prop('赛博数码城','green',  2600, [1100,1200,1300],[[80,160],[280,560],[750,1200],[1100,1700]],1300 ),
    { name: '机会',              type: TileType.EVENT,     extra: { cardCategory: 'chance' } },
    prop('电竞中心',  'green',  2700, [1100,1200,1300],[[80,160],[280,560],[750,1200],[1100,1700]],1350 ),
    { name: '地铁3号线',         type: TileType.SUBWAY,    extra: { targetLayer: 0, targetPosition: 6 } },
    prop('VR体验馆',  'green',  2800, [1100,1200,1300],[[80,160],[280,560],[750,1200],[1100,1700]],1400 ),
    { name: '命运',              type: TileType.EVENT,     extra: { cardCategory: 'destiny' } },
    prop('暗网黑市',  'blue',   3000, [1200,1400,1600],[[100,200],[350,600],[850,1300],[1200,1800]],1500 ),
    { name: '赌场',              type: TileType.CASINO },
    prop('秘密金库',  'blue',   3200, [1200,1400,1600],[[100,200],[350,600],[850,1300],[1200,1800]],1600 ),
    { name: '税务局',            type: TileType.TAX,       extra: { fixedAmount: 800 } },
    { name: '地铁4号线',         type: TileType.SUBWAY,    extra: { targetLayer: 0, targetPosition: 16 } },
    prop('潮玩街区',  'green',  2600, [1100,1200,1300],[[80,160],[280,560],[750,1200],[1100,1700]],1300 ),
    { name: '股票交易所',        type: TileType.STOCK },
    prop('地下酒吧',  'red',    1850, [900,1000,1100],[[60,120],[200,380],[550,950],[850,1300]], 925 ),
    { name: '机会',              type: TileType.EVENT,     extra: { cardCategory: 'chance' } },
    prop('涂鸦墙',    'red',    1950, [900,1000,1100],[[60,120],[200,380],[550,950],[850,1300]], 975 ),
    { name: '地铁5号线',         type: TileType.SUBWAY,    extra: { targetLayer: 0, targetPosition: 21 } },
    prop('防空洞商铺','orange', 1450, [700,800,900],  [[50,100],[150,300],[450,800],[700,1100]], 725 ),
    { name: '银行',              type: TileType.BANK },
    prop('地下车库',  'orange', 1550, [700,800,900],  [[50,100],[150,300],[450,800],[700,1100]], 775 ),
    { name: '命运',              type: TileType.EVENT,     extra: { cardCategory: 'destiny' } },
    { name: '监狱',              type: TileType.JAIL,      extra: { bailAmount: 1200 } },
    prop('神秘基地',  'purple', 1150, [500,600,800],  [[40,80],[120,240],[350,650],[550,900]], 575 ),
    prop('末日避难所','purple', 1250, [500,600,800],  [[40,80],[120,240],[350,650],[550,900]], 625 ),
    { name: '机场',              type: TileType.AIRPORT },
    prop('下水道集市','cyan',   850,  [400,500,700],  [[30,60],[80,160],[240,480],[400,720]],  425 ),
    { name: '地铁6号线',         type: TileType.SUBWAY,    extra: { targetLayer: 2, targetPosition: 5 } },
    { name: '机会',              type: TileType.EVENT,     extra: { cardCategory: 'chance' } },
    prop('幽灵站台',  'brown',  650,  [300,400,600],  [[20,40],[60,120],[180,360],[360,600]],  325 ),
  ];

  // 天空层 — 云端未来城
  const skyTiles: any[] = [
    { name: '云端入口',          type: TileType.START,     extra: { salary: 3000 } },
    prop('太空酒店',  'blue',   3100, [1200,1400,1600],[[100,200],[350,600],[850,1300],[1200,1800]],1550 ),
    { name: '命运',              type: TileType.EVENT,     extra: { cardCategory: 'destiny' } },
    prop('轨道电梯',  'blue',   3300, [1200,1400,1600],[[100,200],[350,600],[850,1300],[1200,1800]],1650 ),
    { name: '股票交易所',        type: TileType.STOCK },
    { name: '直升机坪',          type: TileType.SUBWAY,    extra: { targetLayer: 0, targetPosition: 21 } },
    prop('卫星控制中心','yellow',2250, [1000,1100,1200],[[70,140],[240,480],[650,1100],[1000,1500]],1125 ),
    { name: '机会',              type: TileType.EVENT,     extra: { cardCategory: 'chance' } },
    prop('反重力实验室','red',  2050, [900,1000,1100],[[60,120],[200,380],[550,950],[850,1300]],1025 ),
    { name: '赌场',              type: TileType.CASINO },
    prop('天文台',    'red',    2100, [900,1000,1100],[[60,120],[200,380],[550,950],[850,1300]],1050 ),
    { name: '机场',              type: TileType.AIRPORT },
    prop('悬浮别墅',  'yellow', 2350, [1000,1100,1200],[[70,140],[240,480],[650,1100],[1000,1500]],1175 ),
    { name: '直升机坪2号',       type: TileType.SUBWAY,    extra: { targetLayer: 0, targetPosition: 11 } },
    prop('云中花园',  'green',  2700, [1100,1200,1300],[[80,160],[280,560],[750,1200],[1100,1700]],1350 ),
    { name: '银行',              type: TileType.BANK },
    prop('高空赌场',  'orange', 1600, [700,800,900],  [[50,100],[150,300],[450,800],[700,1100]], 800 ),
    { name: '命运',              type: TileType.EVENT,     extra: { cardCategory: 'destiny' } },
    prop('天空农场',  'orange', 1650, [700,800,900],  [[50,100],[150,300],[450,800],[700,1100]], 825 ),
    { name: '监狱',              type: TileType.JAIL,      extra: { bailAmount: 2000 } },
    prop('飞艇码头',  'purple', 1250, [500,600,800],  [[40,80],[120,240],[350,650],[550,900]], 625 ),
    { name: '机会',              type: TileType.EVENT,     extra: { cardCategory: 'chance' } },
    prop('漂浮岛屿',  'cyan',   900,  [400,500,700],  [[30,60],[80,160],[240,480],[400,720]],  450 ),
    { name: '直升机坪3号',       type: TileType.SUBWAY,    extra: { targetLayer: 1, targetPosition: 25 } },
    prop('星际码头',  'cyan',   950,  [400,500,700],  [[30,60],[80,160],[240,480],[400,720]],  475 ),
    { name: '税务局',            type: TileType.TAX,       extra: { taxRate: 0.12 } },
    prop('月面基地',  'brown',  700,  [300,400,600],  [[20,40],[60,120],[180,360],[360,600]],  350 ),
    { name: '命运',              type: TileType.EVENT,     extra: { cardCategory: 'destiny' } },
    prop('深空探测站','brown',  750,  [300,400,600],  [[20,40],[60,120],[180,360],[360,600]],  375 ),
    { name: '机场',              type: TileType.AIRPORT },
  ];

  return [
    {
      name: '帝都金融街', index: 0, color: '#E8D5B7',
      tiles: buildLayer(0, '地面', '#E8D5B7', 0, groundTiles, 400, 320, 700, 450),
    },
    {
      name: '地下商业王国', index: 1, color: '#2C3E50',
      tiles: buildLayer(1, '地下', '#2C3E50', 100, undergroundTiles, 340, 280, 700, 450),
    },
    {
      name: '云端未来城', index: 2, color: '#87CEEB',
      tiles: buildLayer(2, '天空', '#87CEEB', 200, skyTiles, 370, 300, 700, 450),
    },
  ];
}

export function getTileById(layers: MapLayerConfig[], id: number): MapTileConfig | undefined {
  for (const layer of layers) {
    const tile = layer.tiles.find(t => t.id === id);
    if (tile) return tile;
  }
  return undefined;
}

export function getTilePosition(layers: MapLayerConfig[], id: number): { layer: number; position: number; x: number; y: number } | undefined {
  for (const layer of layers) {
    const tile = layer.tiles.find(t => t.id === id);
    if (tile) return { layer: layer.index, position: tile.position, x: tile.x, y: tile.y };
  }
  return undefined;
}
