// ============================================================
// MapConfig.ts — 三层地图数据定义
// 均匀矩形棋盘布局，坐标固定不变
// 棋盘通过 Camera transform 整体缩放/平移适配视口
// ============================================================

import { TileType } from '../entities/Tile';
import type { PropertyConfig } from '../entities/Tile';

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
  property?: PropertyConfig;
  salary?: number;
  bailAmount?: number;
  targetLayer?: number;
  targetPosition?: number;
  taxRate?: number;
  fixedAmount?: number;
  cardCategory?: 'chance' | 'destiny';
}

// ---- 地产格子配置 ----
function prop(name: string, colorGroup: string, price: number, upgrades: number[], rents: number[][], mortgage: number): any {
  // 租金 = 原始 rents × 3 倍（让过路费有痛感）
  const boostedRents = rents.map(row => row.map(r => r * 3));
  return { name, type: TileType.PROPERTY, property: { basePrice: price, upgradeCosts: upgrades, rentTable: boostedRents, colorGroup, mortgageValue: mortgage } };
}

// ---- 完全对称的矩形棋盘布局 ----
// 四周格子数量对称：上=7 右=6 下=7 左=6 + 4角 = 30格
const BOARD_W = 1000;
const BOARD_H = 720;
const TOP = 7, RIGHT = 6, BOTTOM = 7, LEFT = 6;
const TL = { x: -BOARD_W / 2, y: -BOARD_H / 2 };
const TR = { x:  BOARD_W / 2, y: -BOARD_H / 2 };
const BR = { x:  BOARD_W / 2, y:  BOARD_H / 2 };
const BL = { x: -BOARD_W / 2, y:  BOARD_H / 2 };
const iTR = TOP + 1;
const iBR = iTR + RIGHT + 1;
const iBL = iBR + BOTTOM + 1;

/** 对称均匀分布 N 个点 (从左上角开始，顺时针) */
function distributeOnRect(count: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    if (i === 0) { pts.push(TL); }
    else if (i === iTR) { pts.push(TR); }
    else if (i === iBR) { pts.push(BR); }
    else if (i === iBL) { pts.push(BL); }
    else if (i > 0 && i < iTR) {
      pts.push({ x: Math.round(TL.x + BOARD_W * i / (TOP + 1)), y: TL.y });
    }
    else if (i > iTR && i < iBR) {
      pts.push({ x: TR.x, y: Math.round(TR.y + BOARD_H * (i - iTR) / (RIGHT + 1)) });
    }
    else if (i > iBR && i < iBL) {
      pts.push({ x: Math.round(BR.x - BOARD_W * (i - iBR) / (BOTTOM + 1)), y: BR.y });
    }
    else if (i > iBL) {
      pts.push({ x: BL.x, y: Math.round(BL.y - BOARD_H * (i - iBL) / (LEFT + 1)) });
    }
  }
  return pts;
}

// ---- 生成地图 ----
export function buildMapConfig(): MapLayerConfig[] {
  // 地面层
  const groundTiles: any[] = [
    { name: '起点', type: TileType.START, extra: { salary: 2000 } },
    prop('王府井', 'brown', 600, [300,400,600], [[20,40],[60,120],[180,360],[360,600]], 300),
    { name: '机会', type: TileType.EVENT, extra: { cardCategory: 'chance' } },
    prop('南锣鼓巷', 'brown', 600, [300,400,600], [[20,40],[60,120],[180,360],[360,600]], 300),
    { name: '税务局', type: TileType.TAX, extra: { taxRate: 0.15 } },
    { name: '地铁1号线', type: TileType.SUBWAY, extra: { targetLayer: 1, targetPosition: 0 } },
    prop('三里屯', 'cyan', 800, [400,500,700], [[30,60],[80,160],[240,480],[400,720]], 400),
    { name: '命运', type: TileType.EVENT, extra: { cardCategory: 'destiny' } },
    prop('国贸CBD', 'cyan', 800, [400,500,700], [[30,60],[80,160],[240,480],[400,720]], 400),
    prop('蓝色港湾', 'cyan', 900, [400,500,700], [[30,60],[80,160],[240,480],[400,720]], 450),
    { name: '监狱', type: TileType.JAIL, extra: { bailAmount: 1000 } },
    prop('中关村', 'purple', 1000, [500,600,800], [[40,80],[120,240],[350,650],[550,900]], 500),
    { name: '股票交易所', type: TileType.STOCK },
    prop('望京SOHO', 'purple', 1100, [500,600,800], [[40,80],[120,240],[350,650],[550,900]], 550),
    prop('金融街', 'purple', 1200, [500,600,800], [[40,80],[120,240],[350,650],[550,900]], 600),
    { name: '地铁2号线', type: TileType.SUBWAY, extra: { targetLayer: 1, targetPosition: 10 } },
    prop('新光天地', 'orange', 1400, [700,800,900], [[50,100],[150,300],[450,800],[700,1100]], 700),
    { name: '机会', type: TileType.EVENT, extra: { cardCategory: 'chance' } },
    prop('SKP商场', 'orange', 1500, [700,800,900], [[50,100],[150,300],[450,800],[700,1100]], 750),
    prop('太古里', 'orange', 1600, [700,800,900], [[50,100],[150,300],[450,800],[700,1100]], 800),
    { name: '机场', type: TileType.AIRPORT },
    prop('陆家嘴', 'red', 1800, [900,1000,1100],[[60,120],[200,380],[550,950],[850,1300]], 900),
    { name: '命运', type: TileType.EVENT, extra: { cardCategory: 'destiny' } },
    prop('静安寺', 'red', 1900, [900,1000,1100],[[60,120],[200,380],[550,950],[850,1300]], 950),
    prop('新天地', 'red', 2000, [900,1000,1100],[[60,120],[200,380],[550,950],[850,1300]],1000),
    { name: '赌场', type: TileType.CASINO },
    prop('珠江新城', 'yellow', 2200, [1000,1100,1200],[[70,140],[240,480],[650,1100],[1000,1500]],1100),
    prop('福田CBD', 'yellow', 2300, [1000,1100,1200],[[70,140],[240,480],[650,1100],[1000,1500]],1150),
    { name: '银行', type: TileType.BANK },
    prop('前海自贸区','yellow', 2400, [1000,1100,1200],[[70,140],[240,480],[650,1100],[1000,1500]],1200),
  ];

  // 地下层
  const undergroundTiles: any[] = [
    { name: '地下城入口', type: TileType.START, extra: { salary: 1500 } },
    prop('赛博数码城','green', 2600, [1100,1200,1300],[[80,160],[280,560],[750,1200],[1100,1700]],1300),
    { name: '机会', type: TileType.EVENT, extra: { cardCategory: 'chance' } },
    prop('电竞中心', 'green', 2700, [1100,1200,1300],[[80,160],[280,560],[750,1200],[1100,1700]],1350),
    { name: '地铁3号线', type: TileType.SUBWAY, extra: { targetLayer: 0, targetPosition: 6 } },
    prop('VR体验馆', 'green', 2800, [1100,1200,1300],[[80,160],[280,560],[750,1200],[1100,1700]],1400),
    { name: '命运', type: TileType.EVENT, extra: { cardCategory: 'destiny' } },
    prop('暗网黑市', 'blue', 3000, [1200,1400,1600],[[100,200],[350,600],[850,1300],[1200,1800]],1500),
    { name: '赌场', type: TileType.CASINO },
    prop('秘密金库', 'blue', 3200, [1200,1400,1600],[[100,200],[350,600],[850,1300],[1200,1800]],1600),
    { name: '税务局', type: TileType.TAX, extra: { fixedAmount: 800 } },
    { name: '地铁4号线', type: TileType.SUBWAY, extra: { targetLayer: 0, targetPosition: 16 } },
    prop('潮玩街区', 'green', 2600, [1100,1200,1300],[[80,160],[280,560],[750,1200],[1100,1700]],1300),
    { name: '股票交易所', type: TileType.STOCK },
    prop('地下酒吧', 'red', 1850, [900,1000,1100],[[60,120],[200,380],[550,950],[850,1300]], 925),
    { name: '机会', type: TileType.EVENT, extra: { cardCategory: 'chance' } },
    prop('涂鸦墙', 'red', 1950, [900,1000,1100],[[60,120],[200,380],[550,950],[850,1300]], 975),
    { name: '地铁5号线', type: TileType.SUBWAY, extra: { targetLayer: 0, targetPosition: 21 } },
    prop('防空洞商铺','orange', 1450, [700,800,900], [[50,100],[150,300],[450,800],[700,1100]], 725),
    { name: '银行', type: TileType.BANK },
    prop('地下车库', 'orange', 1550, [700,800,900], [[50,100],[150,300],[450,800],[700,1100]], 775),
    { name: '命运', type: TileType.EVENT, extra: { cardCategory: 'destiny' } },
    { name: '监狱', type: TileType.JAIL, extra: { bailAmount: 1200 } },
    prop('神秘基地', 'purple', 1150, [500,600,800], [[40,80],[120,240],[350,650],[550,900]], 575),
    prop('末日避难所','purple', 1250, [500,600,800], [[40,80],[120,240],[350,650],[550,900]], 625),
    { name: '机场', type: TileType.AIRPORT },
    prop('下水道集市','cyan', 850, [400,500,700], [[30,60],[80,160],[240,480],[400,720]], 425),
    { name: '地铁6号线', type: TileType.SUBWAY, extra: { targetLayer: 2, targetPosition: 5 } },
    { name: '机会', type: TileType.EVENT, extra: { cardCategory: 'chance' } },
    prop('幽灵站台', 'brown', 650, [300,400,600], [[20,40],[60,120],[180,360],[360,600]], 325),
  ];

  // 天空层
  const skyTiles: any[] = [
    { name: '云端入口', type: TileType.START, extra: { salary: 3000 } },
    prop('太空酒店', 'blue', 3100, [1200,1400,1600],[[100,200],[350,600],[850,1300],[1200,1800]],1550),
    { name: '命运', type: TileType.EVENT, extra: { cardCategory: 'destiny' } },
    prop('轨道电梯', 'blue', 3300, [1200,1400,1600],[[100,200],[350,600],[850,1300],[1200,1800]],1650),
    { name: '股票交易所', type: TileType.STOCK },
    { name: '直升机坪', type: TileType.SUBWAY, extra: { targetLayer: 0, targetPosition: 21 } },
    prop('卫星控制中心','yellow', 2250, [1000,1100,1200],[[70,140],[240,480],[650,1100],[1000,1500]],1125),
    { name: '机会', type: TileType.EVENT, extra: { cardCategory: 'chance' } },
    prop('反重力实验室','red', 2050, [900,1000,1100],[[60,120],[200,380],[550,950],[850,1300]],1025),
    { name: '赌场', type: TileType.CASINO },
    prop('天文台', 'red', 2100, [900,1000,1100],[[60,120],[200,380],[550,950],[850,1300]],1050),
    { name: '机场', type: TileType.AIRPORT },
    prop('悬浮别墅', 'yellow', 2350, [1000,1100,1200],[[70,140],[240,480],[650,1100],[1000,1500]],1175),
    { name: '直升机坪2号', type: TileType.SUBWAY, extra: { targetLayer: 0, targetPosition: 11 } },
    prop('云中花园', 'green', 2700, [1100,1200,1300],[[80,160],[280,560],[750,1200],[1100,1700]],1350),
    { name: '银行', type: TileType.BANK },
    prop('高空赌场', 'orange', 1600, [700,800,900], [[50,100],[150,300],[450,800],[700,1100]], 800),
    { name: '命运', type: TileType.EVENT, extra: { cardCategory: 'destiny' } },
    prop('天空农场', 'orange', 1650, [700,800,900], [[50,100],[150,300],[450,800],[700,1100]], 825),
    { name: '监狱', type: TileType.JAIL, extra: { bailAmount: 2000 } },
    prop('飞艇码头', 'purple', 1250, [500,600,800], [[40,80],[120,240],[350,650],[550,900]], 625),
    { name: '机会', type: TileType.EVENT, extra: { cardCategory: 'chance' } },
    prop('漂浮岛屿', 'cyan', 900, [400,500,700], [[30,60],[80,160],[240,480],[400,720]], 450),
    { name: '直升机坪3号', type: TileType.SUBWAY, extra: { targetLayer: 1, targetPosition: 25 } },
    prop('星际码头', 'cyan', 950, [400,500,700], [[30,60],[80,160],[240,480],[400,720]], 475),
    { name: '税务局', type: TileType.TAX, extra: { taxRate: 0.12 } },
    prop('月面基地', 'brown', 700, [300,400,600], [[20,40],[60,120],[180,360],[360,600]], 350),
    { name: '命运', type: TileType.EVENT, extra: { cardCategory: 'destiny' } },
    prop('深空探测站','brown', 750, [300,400,600], [[20,40],[60,120],[180,360],[360,600]], 375),
    { name: '机场', type: TileType.AIRPORT },
  ];

  function buildLayer(baseId: number, configs: any[]): MapTileConfig[] {
    const points = distributeOnRect(configs.length);
    return configs.map((cfg, i) => ({
      id: baseId + i,
      name: cfg.name,
      type: cfg.type,
      position: i,
      x: Math.round(points[i].x),
      y: Math.round(points[i].y),
      ...(cfg.extra ?? {}),
      ...(cfg.property ?? {}),
    }));
  }

  return [
    { name: '帝都金融街', index: 0, color: '#E8D5B7', tiles: buildLayer(0, groundTiles) },
    { name: '地下商业王国', index: 1, color: '#5D6D7E', tiles: buildLayer(100, undergroundTiles) },
    { name: '云端未来城', index: 2, color: '#AED6F1', tiles: buildLayer(200, skyTiles) },
  ];
}

export function getTileById(layers: MapLayerConfig[], id: number): MapTileConfig | undefined {
  for (const layer of layers) {
    const tile = layer.tiles.find(t => t.id === id);
    if (tile) return tile;
  }
  return undefined;
}
