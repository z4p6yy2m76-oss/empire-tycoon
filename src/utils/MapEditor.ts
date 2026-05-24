// ============================================================
// MapEditor.ts — 简易地图编辑器工具
// 用于设计和修改地图布局、验证地图数据完整性
// ============================================================

import type { MapLayerConfig, MapTileConfig } from '../data/MapConfig';
import { TileType } from '../entities/Tile';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  summary: string;
}

export class MapEditor {
  private layers: MapLayerConfig[] = [];
  private selectedLayer: number = 0;
  private selectedTile: number = -1;

  loadMap(layers: MapLayerConfig[]): void {
    this.layers = layers;
  }

  getLayers(): MapLayerConfig[] { return this.layers; }

  selectLayer(index: number): void {
    this.selectedLayer = Math.max(0, Math.min(this.layers.length - 1, index));
  }

  selectTile(index: number): void {
    this.selectedTile = index;
  }

  getCurrentLayer(): MapLayerConfig | undefined {
    return this.layers[this.selectedLayer];
  }

  getCurrentTile(): MapTileConfig | undefined {
    const layer = this.getCurrentLayer();
    if (!layer || this.selectedTile < 0) return undefined;
    return layer.tiles[this.selectedTile];
  }

  /** 验证地图数据完整性 */
  validate(): ValidationResult {
    const result: ValidationResult = { valid: true, errors: [], warnings: [], summary: '' };

    if (this.layers.length === 0) {
      result.errors.push('地图没有定义任何层');
      result.valid = false;
      return result;
    }

    const allIds = new Set<number>();

    for (const layer of this.layers) {
      // 检查每层至少有一个起始格
      const startTiles = layer.tiles.filter(t => t.type === TileType.START);
      if (startTiles.length === 0) {
        result.warnings.push(`层 "${layer.name}" 缺少起始格`);
      }

      // 检查 ID 重复
      for (const tile of layer.tiles) {
        if (allIds.has(tile.id)) {
          result.errors.push(`格子 ID #${tile.id} 重复`);
          result.valid = false;
        }
        allIds.add(tile.id);

        // 检查属性格必须有 property 配置
        if (tile.type === TileType.PROPERTY && !tile.property) {
          result.errors.push(`地产格 #${tile.id} "${tile.name}" 缺少 property 配置`);
          result.valid = false;
        }

        // 检查 Subway 格必须有目标层
        if (tile.type === TileType.SUBWAY && tile.targetLayer === undefined) {
          result.warnings.push(`地铁站 #${tile.id} "${tile.name}" 未指定目标层`);
        }
      }
    }

    // 检查层间跳转有效性
    for (const layer of this.layers) {
      for (const tile of layer.tiles) {
        if (tile.type === TileType.SUBWAY && tile.targetLayer !== undefined) {
          if (tile.targetLayer >= this.layers.length) {
            result.errors.push(`地铁站 #${tile.id} 目标层 ${tile.targetLayer} 超出范围`);
            result.valid = false;
          }
        }
      }
    }

    result.summary = result.valid
      ? `验证通过: ${this.layers.length} 层, 共 ${allIds.size} 格${result.warnings.length > 0 ? `, ${result.warnings.length} 个警告` : ''}`
      : `验证失败: ${result.errors.length} 个错误, ${result.warnings.length} 个警告`;

    return result;
  }

  /** 计算地图统计 */
  getStatistics(): Record<string, number> {
    const stats: Record<string, number> = {
      totalTiles: 0,
      startTiles: 0,
      propertyTiles: 0,
      eventTiles: 0,
      jailTiles: 0,
      casinoTiles: 0,
      stockTiles: 0,
      bankTiles: 0,
      subwayTiles: 0,
      taxTiles: 0,
      airportTiles: 0,
    };

    for (const layer of this.layers) {
      stats.totalTiles += layer.tiles.length;
      for (const tile of layer.tiles) {
        switch (tile.type) {
          case TileType.START: stats.startTiles++; break;
          case TileType.PROPERTY: stats.propertyTiles++; break;
          case TileType.EVENT: stats.eventTiles++; break;
          case TileType.JAIL: stats.jailTiles++; break;
          case TileType.CASINO: stats.casinoTiles++; break;
          case TileType.STOCK: stats.stockTiles++; break;
          case TileType.BANK: stats.bankTiles++; break;
          case TileType.SUBWAY: stats.subwayTiles++; break;
          case TileType.TAX: stats.taxTiles++; break;
          case TileType.AIRPORT: stats.airportTiles++; break;
        }
      }
    }

    return stats;
  }

  /** 获取最短循环路径 */
  getShortestLoop(): number[] {
    // 简单：返回当前位置开始绕一圈的路径
    const layer = this.getCurrentLayer();
    if (!layer) return [];
    return layer.tiles.map(t => t.id);
  }

  /** 搜索指定类型的格子 */
  findTilesByType(type: TileType): MapTileConfig[] {
    const results: MapTileConfig[] = [];
    for (const layer of this.layers) {
      for (const tile of layer.tiles) {
        if (tile.type === type) results.push(tile);
      }
    }
    return results;
  }

  /** 搜索指定名称的格子 */
  findTilesByName(name: string): MapTileConfig[] {
    const results: MapTileConfig[] = [];
    const lower = name.toLowerCase();
    for (const layer of this.layers) {
      for (const tile of layer.tiles) {
        if (tile.name.toLowerCase().includes(lower)) results.push(tile);
      }
    }
    return results;
  }

  /** 获取相邻格子的距离 */
  getAdjacentDistance(tile1: MapTileConfig, tile2: MapTileConfig): number {
    return Math.sqrt((tile2.x - tile1.x) ** 2 + (tile2.y - tile1.y) ** 2);
  }

  /** 导出为紧凑 JSON */
  exportCompact(): string {
    return JSON.stringify(
      this.layers.map(l => ({
        name: l.name,
        count: l.tiles.length,
        types: l.tiles.map(t => ({ id: t.id, n: t.name, t: t.type })),
      })),
      null, 2
    );
  }

  /** 导出完整的 JSON 用于分享 */
  exportFull(): string {
    return JSON.stringify(this.layers, null, 2);
  }

  /** 从 JSON 导入 */
  importJSON(json: string): boolean {
    try {
      const data = JSON.parse(json);
      if (Array.isArray(data) && data.length > 0 && data[0].name && data[0].tiles) {
        this.layers = data;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}
