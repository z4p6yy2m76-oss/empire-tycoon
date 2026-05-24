// ============================================================
// MovementSystem.ts — 移动系统
// A* 寻路 + 三层地图层间跳转 + 移动动画插值
// ============================================================

import type { Player } from '../entities/Player';
import type { MapLayerConfig, MapTileConfig } from '../data/MapConfig';
import { TileType } from '../entities/Tile';
import { bus } from '../core/EventBus';

export interface PathNode {
  tileId: number;
  layer: number;
  position: number;
  g: number;  // cost from start
  h: number;  // heuristic to goal
  f: number;  // g + h
  parent: PathNode | null;
}

export class MovementSystem {
  private mapLayers: MapLayerConfig[];

  constructor(mapLayers: MapLayerConfig[]) {
    this.mapLayers = mapLayers;
  }

  setMapLayers(layers: MapLayerConfig[]): void {
    this.mapLayers = layers;
  }

  /** 计算从当前位置走 steps 步后的终点 */
  calculateDestination(player: Player, steps: number): number {
    const currentLayer = player.currentLayer;
    const currentPos = player.currentTileId;
    const layer = this.mapLayers[currentLayer];
    if (!layer) return currentPos;

    // 正向前进
    if (steps >= 0) {
      let remaining = steps;
      let currentTile: MapTileConfig | undefined = layer.tiles.find(t => t.id === currentPos);
      if (!currentTile) return currentPos;

      while (remaining > 0) {
        const nextPos: number = (currentTile.position + 1) % layer.tiles.length;
        currentTile = layer.tiles[nextPos];
        remaining--;
      }
      return currentTile.id;
    }

    // 负向后退
    let remaining = Math.abs(steps);
    let currentTile = layer.tiles.find(t => t.id === currentPos);
    if (!currentTile) return currentPos;

    while (remaining > 0) {
      const prevPos: number = (currentTile.position - 1 + layer.tiles.length) % layer.tiles.length;
      currentTile = layer.tiles[prevPos];
      remaining--;
    }
    return currentTile.id;
  }

  /** A* 寻路：从当前位置到目标格子的最短路径 */
  findPath(
    fromTileId: number,
    toTileId: number,
    fromLayer: number,
  ): number[] {
    const startNode: PathNode = {
      tileId: fromTileId,
      layer: fromLayer,
      position: this.getTilePosition(fromTileId, fromLayer),
      g: 0,
      h: 0,
      f: 0,
      parent: null,
    };

    const targetPos = this.getTileGlobalPos(toTileId);
    if (targetPos === null) return [fromTileId];

    const openSet: PathNode[] = [startNode];
    const closedSet = new Set<string>();

    let iterations = 0;
    const maxIterations = 500;

    while (openSet.length > 0 && iterations < maxIterations) {
      iterations++;
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift()!;

      const key = `${current.layer}-${current.tileId}`;
      if (current.tileId === toTileId) {
        return this.reconstructPath(current);
      }

      if (closedSet.has(key)) continue;
      closedSet.add(key);

      const neighbors = this.getNeighbors(current);
      for (const neighbor of neighbors) {
        const nKey = `${neighbor.layer}-${neighbor.tileId}`;
        if (closedSet.has(nKey)) continue;

        const existingIdx = openSet.findIndex(
          n => n.layer === neighbor.layer && n.tileId === neighbor.tileId
        );

        if (existingIdx === -1) {
          openSet.push(neighbor);
        } else if (neighbor.g < openSet[existingIdx].g) {
          openSet[existingIdx] = neighbor;
        }
      }
    }

    // 若 A* 无解，返回直线走法
    return this.calculateStraightPath(fromTileId, toTileId, fromLayer);
  }

  private getNeighbors(node: PathNode): PathNode[] {
    const neighbors: PathNode[] = [];
    const layer = this.mapLayers[node.layer];
    if (!layer) return neighbors;

    // 同层前移
    const nextPos = (node.position + 1) % layer.tiles.length;
    this.addNeighbor(neighbors, node, layer.tiles[nextPos].id, node.layer, nextPos, 1);

    // 同层后移
    const prevPos = (node.position - 1 + layer.tiles.length) % layer.tiles.length;
    this.addNeighbor(neighbors, node, layer.tiles[prevPos].id, node.layer, prevPos, 1);

    // 检查层间跳转（地铁站）
    const currentTile = layer.tiles[node.position];
    if (currentTile.type === TileType.SUBWAY) {
      const targetLayer = (currentTile as any).targetLayer as number;
      const targetPos = (currentTile as any).targetPosition as number;
      if (targetLayer !== undefined && targetLayer !== node.layer) {
        const tl = this.mapLayers[targetLayer];
        if (tl && targetPos < tl.tiles.length) {
          this.addNeighbor(neighbors, node, tl.tiles[targetPos].id, targetLayer, targetPos, 2);
        }
      }
    }

    // 机场传送
    if (currentTile.type === TileType.AIRPORT) {
      // 随机传送——在 A* 中只考虑同层起点
      const targetLayer = (node.layer + 1) % this.mapLayers.length;
      const tl = this.mapLayers[targetLayer];
      if (tl) {
        this.addNeighbor(neighbors, node, tl.tiles[0].id, targetLayer, 0, 5);
      }
    }

    return neighbors;
  }

  private addNeighbor(
    neighbors: PathNode[],
    current: PathNode,
    tileId: number,
    layer: number,
    position: number,
    cost: number,
  ): void {
    const targetGlobal = this.getTileGlobalPosById(tileId, layer);
    if (targetGlobal === null) return;

    // 曼哈顿距离启发式（基于全局位置）
    const h = targetGlobal;
    const g = current.g + cost;
    neighbors.push({
      tileId, layer, position,
      g, h: 1, f: g + h,
      parent: current,
    });
  }

  private reconstructPath(node: PathNode): number[] {
    const path: number[] = [];
    let current: PathNode | null = node;
    while (current) {
      path.unshift(current.tileId);
      current = current.parent;
    }
    return path;
  }

  /** 获取格子在当前层的位置索引 */
  private getTilePosition(tileId: number, layerIdx: number): number {
    const layer = this.mapLayers[layerIdx];
    if (!layer) return 0;
    const tile = layer.tiles.find(t => t.id === tileId);
    return tile ? tile.position : 0;
  }

  /** 获取全局位置（用于跨层比较） */
  private getTileGlobalPos(tileId: number): number | null {
    for (const layer of this.mapLayers) {
      const tile = layer.tiles.find(t => t.id === tileId);
      if (tile) return layer.index * 100 + tile.position;
    }
    return null;
  }

  private getTileGlobalPosById(tileId: number, layerIdx: number): number | null {
    const layer = this.mapLayers[layerIdx];
    if (!layer) return null;
    const tile = layer.tiles.find(t => t.id === tileId);
    if (!tile) return null;
    return layerIdx * 100 + tile.position;
  }

  /** 直接步进路径（不走 A*，保证步数精确） */
  buildForwardPath(player: { currentTileId: number; currentLayer: number }, steps: number): number[] {
    const layer = this.mapLayers[player.currentLayer];
    if (!layer) return [player.currentTileId];

    const startTile = layer.tiles.find(t => t.id === player.currentTileId);
    if (!startTile) return [player.currentTileId];

    const path: number[] = [player.currentTileId];
    let pos = startTile.position;

    for (let i = 1; i <= steps; i++) {
      pos = (pos + 1) % layer.tiles.length;
      path.push(layer.tiles[pos].id);
    }

    return path;
  }

  /** 直线的环形走法 */
  private calculateStraightPath(fromId: number, toId: number, layer: number): number[] {
    const ly = this.mapLayers[layer];
    if (!ly) return [fromId];

    const fromTile = ly.tiles.find(t => t.id === fromId);
    const toTile = ly.tiles.find(t => t.id === toId);
    if (!fromTile || !toTile) return [fromId];

    const path: number[] = [];
    let pos = fromTile.position;
    const target = toTile.position;

    while (pos !== target) {
      pos = (pos + 1) % ly.tiles.length;
      path.push(ly.tiles[pos].id);
    }

    return [fromId, ...path];
  }

  /** 移动时的层切换 */
  checkLayerTransition(player: Player, fromTileId: number, toTileId: number): void {
    const fromLayer = this.getTileLayer(fromTileId);
    const toLayer = this.getTileLayer(toTileId);

    if (fromLayer !== toLayer && toLayer !== undefined) {
      player.currentLayer = toLayer;
      bus.emit('layer.switch', {
        playerId: player.id,
        fromLayer: fromLayer ?? player.currentLayer,
        toLayer,
      });
    }
  }

  private getTileLayer(tileId: number): number | undefined {
    for (const layer of this.mapLayers) {
      if (layer.tiles.some(t => t.id === tileId)) return layer.index;
    }
    return undefined;
  }

  /** 获取移动路径上的所有格子（用于路过触发） */
  getPassedTiles(fromId: number, toId: number, layer: number): number[] {
    const ly = this.mapLayers[layer];
    if (!ly) return [];

    const fromTile = ly.tiles.find(t => t.id === fromId);
    const toTile = ly.tiles.find(t => t.id === toId);
    if (!fromTile || !toTile) return [];

    const passed: number[] = [];
    let pos = fromTile.position;
    const target = toTile.position;

    // 不包含起始格
    while (pos !== target) {
      pos = (pos + 1) % ly.tiles.length;
      if (pos !== target) {
        passed.push(ly.tiles[pos].id);
      }
    }

    return passed;
  }

  /** 从路径计算移动动画的中间点（线性插值位置） */
  interpolatePath(path: number[], currentLayer: number, progress: number): { x: number; y: number; layer: number } | null {
    if (path.length === 0) return null;

    const segIdx = Math.min(Math.floor(progress * (path.length - 1)), path.length - 2);
    const segFrac = (progress * (path.length - 1)) - segIdx;

    const fromId = path[segIdx];
    const toId = path[Math.min(segIdx + 1, path.length - 1)];

    const fromTile = this.findTile(fromId);
    const toTile = this.findTile(toId);

    if (!fromTile || !toTile) {
      const ft = fromTile ?? toTile;
      return ft ? { x: ft.x, y: ft.y, layer: currentLayer } : null;
    }

    return {
      x: fromTile.x + (toTile.x - fromTile.x) * segFrac,
      y: fromTile.y + (toTile.y - fromTile.y) * segFrac,
      layer: currentLayer,
    };
  }

  private findTile(tileId: number): MapTileConfig | undefined {
    for (const layer of this.mapLayers) {
      const tile = layer.tiles.find(t => t.id === tileId);
      if (tile) return tile;
    }
    return undefined;
  }

  /** 计算两个位置之间的最短距离（步数） */
  calculateDistance(fromId: number, toId: number, layer: number): number {
    const ly = this.mapLayers[layer];
    if (!ly) return Infinity;

    const fromTile = ly.tiles.find(t => t.id === fromId);
    const toTile = ly.tiles.find(t => t.id === toId);
    if (!fromTile || !toTile) return Infinity;

    // 顺时针距离
    const forward = (toTile.position - fromTile.position + ly.tiles.length) % ly.tiles.length;
    // 逆时针距离
    const backward = (fromTile.position - toTile.position + ly.tiles.length) % ly.tiles.length;

    return Math.min(forward, backward);
  }

  /** 预测到达某位置需要的步数（含层间跳转） */
  estimateStepsTo(fromId: number, targetLayer: number, targetPos: number, currentLayer: number): number {
    if (currentLayer === targetLayer) {
      return this.calculateDistance(fromId, this.mapLayers[currentLayer]?.tiles[targetPos]?.id ?? fromId, currentLayer);
    }

    // 跨层：找最近的 SubwayTile
    const ly = this.mapLayers[currentLayer];
    if (!ly) return Infinity;

    let minSteps = Infinity;
    for (const tile of ly.tiles) {
      if (tile.type === TileType.SUBWAY) {
        const distToSubway = this.calculateDistance(fromId, tile.id, currentLayer);
        const subwayDist = this.calculateDistance(
          tile.id,
          this.mapLayers[targetLayer]?.tiles[targetPos]?.id ?? tile.id,
          targetLayer
        );
        const totalDist = distToSubway + subwayDist + 1; // +1 for layer transition
        minSteps = Math.min(minSteps, totalDist);
      }
    }

    return minSteps;
  }

  /** 获取某个格子前方 N 格的所有格子 ID */
  getLookaheadTiles(currentId: number, layer: number, count: number): number[] {
    const ly = this.mapLayers[layer];
    if (!ly) return [];

    const currentTile = ly.tiles.find(t => t.id === currentId);
    if (!currentTile) return [];

    const result: number[] = [];
    let pos = currentTile.position;

    for (let i = 0; i < count; i++) {
      pos = (pos + 1) % ly.tiles.length;
      result.push(ly.tiles[pos].id);
    }

    return result;
  }

  /** 移动可行性检查 */
  canMove(player: { inJail: boolean; jailTurns: number; bankrupt: boolean; skipNextTurn: boolean }): { canMove: boolean; reason: string } {
    if (player.bankrupt) return { canMove: false, reason: '已破产' };
    if (player.skipNextTurn) return { canMove: false, reason: '跳过回合' };
    if (player.inJail && player.jailTurns > 0) return { canMove: true, reason: '尝试越狱' };
    return { canMove: true, reason: '可以移动' };
  }

  /** 获取层间跳转点列表 */
  getLayerTransitions(layerIdx: number): Array<{ tileId: number; targetLayer: number; targetPosition: number; name: string }> {
    const ly = this.mapLayers[layerIdx];
    if (!ly) return [];

    const transitions: Array<{ tileId: number; targetLayer: number; targetPosition: number; name: string }> = [];

    for (const tile of ly.tiles) {
      if (tile.type === TileType.SUBWAY || tile.type === TileType.AIRPORT) {
        transitions.push({
          tileId: tile.id,
          targetLayer: (tile as any).targetLayer ?? ((layerIdx + 1) % this.mapLayers.length),
          targetPosition: (tile as any).targetPosition ?? 0,
          name: tile.name,
        });
      }
    }

    return transitions;
  }
}
