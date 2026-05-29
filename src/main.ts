// ============================================================
// main.ts — Empire Tycoon 入口文件
// HTML/CSS UI 层 + Canvas 棋盘 + 游戏逻辑
// ============================================================

import { GameEngine } from './core/GameEngine';
import { bus } from './core/EventBus';
import { state, GamePhase, GameMode, AIDifficulty } from './core/StateManager';
import { InputManager } from './core/InputManager';
import { RandomGenerator } from './core/RandomGenerator';
import { TurnSystem } from './logic/TurnSystem';
import { DiceSystem } from './logic/DiceSystem';
import { MovementSystem } from './logic/MovementSystem';
import { EconomySystem } from './logic/EconomySystem';
import { BankruptcySystem } from './logic/BankruptcySystem';
import { AuctionSystem } from './logic/AuctionSystem';
import { StockSystem } from './logic/StockSystem';
import { AIManager, createAIManager, type AIContext } from './logic/AIManager';
import { Renderer } from './render/Renderer';
import { createPlayer } from './entities/Player';
import { buildMapConfig } from './data/MapConfig';
import { buildCardDatabase, getChanceCards, getDestinyCards } from './data/CardDatabase';
import { executeCardEffect, CardEffectType } from './entities/Card';
import {
  TileType, type Tile,
  PropertyTile, StartTile, SubwayTile, TaxTile, JailTile,
  EventTile, CasinoTile, StockTile, BankTile, AirportTile,
} from './entities/Tile';
import type { Player } from './entities/Player';
import { NetworkClient } from './network/NetworkClient';
import { MessageType } from './network/NetworkProtocol';
import { SaveFileHandler } from './utils/SaveFileHandler';
import { ui } from './ui/UIManager';
import { AutoPlayDebugger } from './utils/AutoPlayDebugger';

const debugger_ = new AutoPlayDebugger();

// ---- 初始化 ----
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

// 自适应画布尺寸
function fitCanvas(): void {
  const maxW = Math.min(window.innerWidth, 1400);
  const maxH = Math.min(window.innerHeight, 900);
  canvas.width = maxW;
  canvas.height = maxH;
  const wrapper = document.getElementById('game-wrapper')!;
  wrapper.style.width = maxW + 'px';
  wrapper.style.height = maxH + 'px';
}

function narrowCanvasForDashboard(): void { /* 不再缩窄，仪表盘覆盖 */ }
function fullWidthCanvas(): void { /* 不再缩窄 */ }
fitCanvas();

const engine = new GameEngine(canvas);
const input = new InputManager(canvas);
const rng = new RandomGenerator();

const mapLayers = buildMapConfig();
const turnSys = new TurnSystem();
const diceSys = new DiceSystem(rng);
const moveSys = new MovementSystem(mapLayers);
const economySys = new EconomySystem();
const bankruptcySys = new BankruptcySystem();
const auctionSys = new AuctionSystem();
const stockSys = new StockSystem(rng);
const cards = buildCardDatabase();
const chanceCards = getChanceCards(cards);
const destinyCards = getDestinyCards(cards);

let network: NetworkClient | null = null;
const aiManagers = new Map<string, AIManager>();
let gameOverTriggered = false;
let tileProcessed = false;
let wasDoubles = false; // 当前回合掷出对子，触发额外回合
let gameSpeed: 1 | 2 | 3 = 1; // 1=正常 2=快速 3=瞬间

// 全局地产所有权映射（因为 findTile 每次创建新对象，不能靠 tile.ownerId）
const propertyOwners = new Map<number, string>(); // tileId → playerId
const propertyLevels = new Map<number, number>(); // tileId → 升级等级
// 层灾变状态
const layerCrisis: Map<number, { type: string; remaining: number; desc: string }> = new Map();

// ---- 垂直垄断检测 ----
function getVerticalMonopolyBonus(player: Player, tileId: number): number {
  const cfg = findTileConfig(tileId);
  if (!cfg) return 0;
  const pos = cfg.position;
  // 检查同位置是否有玩家在三层的地产
  let owned = 0;
  for (const lId of [0, 1, 2]) {
    const tl = mapLayers[lId]?.tiles[pos];
    if (tl && propertyOwners.get(tl.id) === player.id) owned++;
  }
  return owned >= 3 ? 0.5 : (owned >= 2 ? 0.25 : 0); // 3层=50%, 2层=25%
}

// ---- AI 性格漂移 ----
function updateAIMentalDrift(): void {
  for (const [id, ai] of aiManagers) {
    const p = state.getPlayer(id);
    if (!p || p.bankrupt) continue;
    // 根据资产状况和经济周期动态调整
    const cashRatio = p.cash / Math.max(1, p.totalAssets);
    if (cashRatio < 0.1) {
      ai.setPersonality('gambler'); // 穷途末路变赌徒
    } else if (renderer.economyCycle === 'BOOM') {
      if (Math.random() < 0.3) ai.setPersonality('aggressive');
    }
  }
}

// ---- 层灾变检测 ----
/** 当前层过路费倍率（受灾变影响） */
function getCrisisRentMultiplier(layer: number): number {
  // 全局效果
  const global = layerCrisis.get(-1);
  let mult = 1.0;
  if (global && global.remaining > 0) {
    if (global.type.includes('节日')) mult *= 2.0;
  }
  // 层效果
  const crisis = layerCrisis.get(layer);
  if (!crisis || crisis.remaining <= 0) return mult;
  if (crisis.type.includes('高温')) mult *= 0.5;
  if (crisis.type.includes('暴雨')) return 0; // 过路费归零
  if (crisis.type.includes('雾霾')) mult *= 1.5;
  if (crisis.type.includes('疫情')) return 0; // 禁止通行
  return mult;
}

/** 灾变下能否收租 */
function canCollectRentOnLayer(layer: number): boolean {
  const crisis = layerCrisis.get(layer);
  if (!crisis || crisis.remaining <= 0) return true;
  if (crisis.type.includes('暴雨') || crisis.type.includes('疫情')) return false;
  return true;
}

/** 灾变下维护费倍率 */
function getCrisisMaintenanceMultiplier(layer: number): number {
  const crisis = layerCrisis.get(layer);
  if (!crisis || crisis.remaining <= 0) return 1.0;
  if (crisis.type.includes('雷暴')) return 2.0;
  return 1.0;
}

function tickLayerCrisis(): void {
  for (const [layer, crisis] of layerCrisis) {
    crisis.remaining--;
    if (crisis.remaining <= 0) layerCrisis.delete(layer);
  }
}

function triggerRandomCrisis(): void {
  // 已有灾变时不触发新的
  if (layerCrisis.size > 0) return;
  if (Math.random() > 0.12) return;
  const crises = [
    { type: '🌊 特大暴雨', desc: '地下层淹水，过路费归零3回合', layer: 1, effect: 'rent_zero' },
    { type: '🌫️ 严重雾霾', desc: '天空层能见度低，过路费×1.5', layer: 2, effect: 'rent_boost' },
    { type: '🔥 高温预警', desc: '地面层限电，过路费减半3回合', layer: 0, effect: 'rent_half' },
    { type: '⚡ 雷暴天气', desc: '随机一层所有地产维护费翻倍2回合', layer: Math.floor(Math.random() * 3), effect: 'maint_double' },
    { type: '📉 股灾恐慌', desc: '所有股票跌停1回合，禁止交易', layer: -1, effect: 'stock_freeze' },
    { type: '🏦 央行加息', desc: '所有贷款利率翻倍2回合', layer: -1, effect: 'loan_hike' },
    { type: '💸 全民退税', desc: '所有玩家获得 $2000', layer: -1, effect: 'all_bonus' },
    { type: '🦠 疫情封控', desc: '随机一层禁止通行2回合(无法停留)', layer: Math.floor(Math.random() * 3), effect: 'no_stop' },
    { type: '🎉 节日消费潮', desc: '全图过路费×2，持续2回合', layer: -1, effect: 'rent_double_all' },
    { type: '❄️ 寒流来袭', desc: '随机一层移动步数-2，持续3回合', layer: Math.floor(Math.random() * 3), effect: 'slow_move' },
  ];
  const crisis = crises[Math.floor(Math.random() * crises.length)];
  const duration = 2 + Math.floor(Math.random() * 2);
  if (crisis.layer >= 0) {
    layerCrisis.set(crisis.layer, { type: crisis.type, remaining: duration, desc: crisis.desc });
  }
  if (crisis.layer === -1) {
    layerCrisis.set(-1, { type: crisis.type, remaining: 2, desc: crisis.desc });
  }
  ui.log.warning(`${crisis.desc}`);
  ui.notify.show(crisis.type, 2000, '#E74C3C');
}

const ctx = canvas.getContext('2d')!;
const renderer = new Renderer(ctx);
renderer.setMapLayers(mapLayers);

// ---- 游戏主循环 ----
engine.setUpdate((dt: number) => {
  input.endFrame();
  renderer.effects.update(dt);
  renderer.updateDiceAnim(dt); // 每帧更新骰子
  renderer.updateCycleParticles(canvas.width, canvas.height);
  if (renderer.isAnimating) {
    const done = renderer.updateAnimProgress(dt);
    if (done) {
      state.phase = GamePhase.TILE_TRIGGER;
      handleTileTrigger();
    }
  }
  if (state.phase === GamePhase.GAME_OVER && !gameOverTriggered) {
    gameOverTriggered = true;
  }
});

engine.setRender((_ctx, dt) => {
  renderer.setPlayers([...state.players.values()]);
  renderer.render(dt);
});

// ---- 输入：拖拽平移棋盘，滚轮缩放 ----
input.onDrag = (dx: number, dy: number) => {
  renderer.camera.pan(dx, dy);
};
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  renderer.camera.zoom(e.deltaY, e.offsetX, e.offsetY);
}, { passive: false });
// 双击重置视角
canvas.addEventListener('dblclick', () => {
  renderer.camera.reset();
});

input.onClick = () => {
  // UI 层点击由 DOM 事件处理
};

// 键盘
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state.phase === GamePhase.MENU) return;
    // 自动测试模式：停止并返回菜单
    if (debugger_.isRunning()) {
      debugger_.stop();
      if (autoPlayTimer) clearTimeout(autoPlayTimer);
      fullWidthCanvas();
      ui.returnToMenu();
      ui.notify.show('已停止自动测试', 1500, '#FFD700');
      return;
    }
    // 人类接管AI
    const cp = state.getCurrentPlayer();
    const btns: any[] = [
      { text: '继续', cssClass: 'btn-end-turn', onClick: () => ui.modal.hide() },
      { text: '存档', cssClass: 'btn-auction', onClick: () => { state.save(); ui.modal.hide(); } },
      { text: '返回菜单', cssClass: 'btn-danger', onClick: () => { state.reset(); fullWidthCanvas(); ui.returnToMenu(); ui.modal.hide(); } },
    ];
    if (cp && !cp.isHuman && !cp.bankrupt) {
      btns.splice(1, 0, {
        text: `👤 接管 ${cp.name}`,
        cssClass: 'btn-buy',
        onClick: () => {
          cp.isHuman = true;
          aiManagers.delete(cp.id);
          ui.modal.hide();
          ui.actions.setButtons([{ id: 'roll_dice', text: '🎲 掷骰子', cssClass: 'btn-end-turn', disabled: false, onClick: () => handleDiceRoll() }]);
          ui.notify.show(`接管 ${cp.name}`, 1500, '#2ECC71');
        }
      });
    }
    ui.modal.show('暂停', '游戏已暂停', btns);
  }
  if (e.key === 'r' && state.phase === GamePhase.ROLLING) handleDiceRoll();
  if (e.key === '1') { renderer.switchLayer(0); refreshHUD(); }
  if (e.key === '2') { renderer.switchLayer(1); refreshHUD(); }
  if (e.key === '3') { renderer.switchLayer(2); refreshHUD(); }
  if (e.key === 'o' || e.key === 'O') {
    const p = state.getCurrentPlayer();
    if (p && p.isHuman && state.phase === GamePhase.TILE_TRIGGER) {
      turnSys.endTurn(p); afterTurn();
    }
  }
  if (e.key === 'g' || e.key === 'G') {
    gameSpeed = gameSpeed === 1 ? 2 : gameSpeed === 2 ? 3 : 1;
    const labels = { 1: '🐢 正常速度', 2: '🐇 快速模式', 3: '⚡ 瞬间模式' };
    ui.notify.show(labels[gameSpeed], 1200, '#FFD700');
    renderer.diceDuration = gameSpeed === 3 ? 0.1 : gameSpeed === 2 ? 0.3 : 0.8;
  }
  if (e.key === 'F5') { state.save('快速存档'); ui.log.system('已保存'); }
});

// ---- 事件 -> UI ----
bus.on('turn.start', (data) => {
  const player = state.getPlayer(data.playerId);
  if (player) {
    refreshHUD();
    if (player.isHuman) {
      ui.notify.playerTurn(player.name);
      ui.log.system(`${player.name} 的回合`);
    }
    // Auto-save
    if (state.turnNumber % 10 === 0 && state.turnNumber > 0) {
      state.save(`自动存档 — 第 ${state.turnNumber} 回合`);
    }
  }
});

bus.on('dice.roll', (data) => {
  const player = state.getPlayer(data.playerId);
  const name = player?.name ?? data.playerId;
  ui.log.add(`掷出 ${data.values[0]}+${data.values[1]}=${data.total}${data.values[0] === data.values[1] ? ' (对子!)' : ''}`, 'system', name, player?.color ?? '#FFF');
});

bus.on('money.change', (data) => {
  if (data.amount > 0) {
    ui.log.income(`${data.reason}: +$${data.amount.toLocaleString()}`);
    renderer.effects.moneyFly(700, 450, data.amount, '#2ECC71');
    if (Math.abs(data.amount) > 1000) ui.notify.moneyChange(data.amount);
  } else {
    ui.log.expense(`${data.reason}: -$${Math.abs(data.amount).toLocaleString()}`);
    renderer.effects.moneyFly(700, 450, data.amount, '#E74C3C');
    if (Math.abs(data.amount) > 1000) ui.notify.moneyChange(data.amount);
  }
  refreshHUD();
});

bus.on('property.buy', (data) => {
  ui.log.system(`购入地产，花费 $${data.price.toLocaleString()}`);
  renderer.effects.upgradeSparkle(700, 450);
  refreshHUD();
});

bus.on('property.upgrade', (data) => {
  ui.log.system(`升级地产至 Lv${data.level}，花费 $${data.cost.toLocaleString()}`);
  renderer.effects.upgradeSparkle(700, 350);
  ui.notify.show(`升级成功! Lv${data.level}`, 1500, '#9B59B6');
  refreshHUD();
});

bus.on('property.rent', (data) => {
  ui.log.expense(`过路费: $${data.amount.toLocaleString()}`);
  renderer.effects.moneyFly(700, 450, -data.amount, '#E74C3C');
  refreshHUD();
});

bus.on('auction.start', () => {
  renderer.effects.auctionHammer(700, 420);
});

bus.on('auction.end', () => {
  renderer.effects.upgradeSparkle(700, 420);
});

bus.on('jail.enter', (data) => {
  const p = state.getPlayer(data.playerId);
  ui.notify.jailEntrance(p?.name ?? data.playerId);
  ui.log.warning(`${p?.name ?? data.playerId} 入狱!`);
});

bus.on('jail.leave', (data) => {
  const p = state.getPlayer(data.playerId);
  ui.notify.show(`${p?.name ?? data.playerId} 出狱!`, 1500, '#2ECC71');
});

bus.on('card.draw', (data) => {
  renderer.effects.cardFlip(700, 400, '🃏');
  ui.notify.cardDrawn(state.getPlayer(data.playerId)?.name ?? '');
});

bus.on('bankruptcy.start', (data) => {
  const p = state.getPlayer(data.playerId);
  ui.notify.bankruptcy(p?.name ?? data.playerId);
  ui.log.warning(`${p?.name ?? data.playerId} 面临破产!`);
});

bus.on('bankruptcy.complete', (data) => {
  const p = state.getPlayer(data.playerId);
  renderer.effects.bankruptcyExplosion(700, 450);
  ui.log.expense(`${p?.name ?? data.playerId} 破产!`);
  ui.notify.bankruptcy(p?.name ?? data.playerId);
  refreshHUD();
});

bus.on('game.over', (data) => {
  const winner = state.getPlayer(data.winnerId);
  if (!winner) return;
  ui.actions.clear();
  ui.modal.showGameOver(
    winner.name, winner.color, winner.netWorth, winner.cash, winner.ownedTiles.size,
    state.turnNumber,
    () => { ui.modal.hide(); startGame(); },
    () => { ui.modal.hide(); fullWidthCanvas(); ui.returnToMenu(); },
  );
});

bus.on('auction.start', (data) => {
  ui.notify.auctionStart(`地产 #${data.tileId}`);
  ui.modal.show('拍卖开始', `地产 #${data.tileId} 起拍价: $${data.startPrice.toLocaleString()}`, [
    { text: '出价', cssClass: 'btn-auction', onClick: () => ui.modal.hide() },
    { text: '放弃', cssClass: 'btn-skip', onClick: () => ui.modal.hide() },
  ]);
});

bus.on('cpi.update', (data) => {
  refreshHUD();
});

bus.on('layer.switch', (data) => {
  const layerName = mapLayers[data.toLayer]?.name ?? '未知';
  ui.notify.layerSwitch(layerName);
  refreshHUD();
});

// ---- HUD 刷新 ----
function refreshHUD(): void {
  ui.hud.refresh(
    [...state.players.values()],
    mapLayers[renderer.getCurrentLayer()]?.name ?? '未知层',
  );
  renderer.setPropertyLevels(propertyLevels);
  // 刷新右侧仪表盘
  // 显示灾变到棋盘中央
  const activeCrises: string[] = [];
  let maxCountdown = 0;
  for (const [ly, cr] of layerCrisis) {
    if (cr.remaining > 0) {
      const layerName = ly === -1 ? '全局' : (mapLayers[ly]?.name ?? '?');
      activeCrises.push(`${cr.type} ${layerName}: ${cr.desc}`);
      maxCountdown = Math.max(maxCountdown, cr.remaining);
    }
  }
  renderer.setCrisis(activeCrises.join('\n'), maxCountdown);
  ui.dashboard.refresh(
    [...state.players.values()],
    stockSys.getAllStocks(),
    economySys.getEconomyCycle(),
    activeCrises.length > 0 ? activeCrises.join(' | ') : null,
  );
}

// ---- 游戏操作 ----
function handleDiceRoll(): void {
  const player = state.getCurrentPlayer();
  if (!player) return;

  if (player.inJail) {
    const result = diceSys.rollForJail();
    ui.log.system(`${player.name} 掷骰: [${result.values}]`);
    if (result.escaped) {
      player.inJail = false; player.jailTurns = 0;
      ui.log.system('越狱成功!');
      bus.emit('jail.leave', { playerId: player.id, paid: 0 });
    } else {
      player.jailTurns--;
      if (player.jailTurns <= 0) {
        player.inJail = false;
        ui.log.system('刑满释放');
      } else {
        ui.log.system(`还需蹲 ${player.jailTurns} 回合`);
        turnSys.endTurn(player); afterTurn(); return;
      }
    }
  }

  const result = diceSys.roll();
  state.currentDice = result.values;
  renderer.startDiceRoll(result.values);
  wasDoubles = result.isDoubles;

  if (diceSys.checkDoublesJail()) {
    player.inJail = true; player.jailTurns = 3; state.doublesCount = 0;
    bus.emit('jail.enter', { playerId: player.id, turns: 3 });
    turnSys.endTurn(player); afterTurn(); return;
  }

  let steps = diceSys.getSteps(result.values);
  // 寒流减速
  const slowCrisis = layerCrisis.get(player.currentLayer);
  if (slowCrisis && slowCrisis.remaining > 0 && slowCrisis.type.includes('寒流')) {
    steps = Math.max(1, steps - 2);
    ui.log.system(`${player.name} 受寒流影响，步数-2`);
  }
  const path = moveSys.buildForwardPath(player, steps);
  const dest = path[path.length - 1];
  const prevId = player.currentTileId;
  player.previousTileId = prevId;
  player.currentTileId = dest;

  // 路过
  const passed = moveSys.getPassedTiles(prevId, dest, player.currentLayer);
  for (const pid of passed) {
    const cfg = findTileConfig(pid);
    if (cfg?.type === TileType.START) {
      economySys.paySalary(player, 1000); // 降低工资
      ui.log.income(`${player.name} 路过起点，+$1000`);
    }
  }

  const prevLayer = player.currentLayer;
  moveSys.checkLayerTransition(player, prevId, dest);
  if (player.currentLayer !== prevLayer) renderer.switchLayer(player.currentLayer);

  // 瞬间模式跳过动画
  if (gameSpeed === 3) {
    state.phase = GamePhase.TILE_TRIGGER;
    handleTileTrigger();
    return;
  }

  // 联机模式：发送移动数据 + 结束回合通知
  if (network && state.settings.mode === GameMode.ONLINE) {
    network.send({
      type: 'PLAYER_MOVE' as any,
      timestamp: Date.now(),
      payload: { playerId: player.id, path, steps, layer: player.currentLayer },
    });
    // 通知其他玩家谁继续
    const next = state.playerOrder[(state.playerOrder.indexOf(player.id) + 1) % state.playerOrder.length];
    network.send({
      type: 'END_TURN' as any,
      timestamp: Date.now(),
      payload: { playerId: player.id, nextPlayerId: next },
    });
  }

  renderer.animSpeed = gameSpeed === 2 ? 0.5 : 0.15;
  renderer.startMoveAnimation(path);
  turnSys.startMove(player, steps);
}

function handleTileTrigger(): void {
  if (tileProcessed) return; // 防止重复触发
  tileProcessed = true;

  const player = state.getCurrentPlayer();
  if (!player) return;
  const tile = findTile(player.currentTileId);
  if (!tile) { turnSys.endTurn(player); afterTurn(); return; }

  ui.log.add(`停在: ${tile.name}`, 'system', player.name, player.color);
  refreshHUD();

  // === 强制效果（所有玩家都执行） ===
  if (tile instanceof TaxTile) {
    const taxAmount = (tile as any).fixedAmount > 0 ? (tile as any).fixedAmount : Math.floor(player.totalAssets * ((tile as any).taxRate ?? 0.15));
    const paid = player.payAmount(taxAmount);
    if (!paid) {
      // 现金不够从存款扣
      player.withdraw(Math.min(player.bankSavings, taxAmount - player.cash));
      player.payAmount(taxAmount);
    }
    ui.log.expense(`${player.name} 缴税 $${taxAmount}`);
    renderer.effects.moneyFly(tile.x, tile.y, -taxAmount, '#E67E22');
  }
  if (tile instanceof StartTile) economySys.paySalary(player, 1500);
  if (tile instanceof JailTile && !player.inJail) {
    player.inJail = true; player.jailTurns = 3;
    bus.emit('jail.enter', { playerId: player.id, turns: 3 });
  }
  // 地铁站 → 传送（所有人）
  if (tile instanceof SubwayTile) {
    const tl = (tile as any).targetLayer as number;
    const tp = (tile as any).targetPosition as number;
    const tld = mapLayers[tl];
    if (tld && tp < tld.tiles.length) {
      player.currentLayer = tl;
      player.currentTileId = tld.tiles[tp].id;
      renderer.switchLayer(tl);
      ui.log.add(`传送至 ${tld.name}`, 'system', player.name, player.color);
    }
  }
  // 过路费（所有人）
  const ownerId = propertyOwners.get(tile.id);
  if (tile instanceof PropertyTile && ownerId && ownerId !== player.id) {
    const lv = propertyLevels.get(tile.id) ?? 0;
    const baseRent = tile.rentTable[Math.min(lv, tile.rentTable.length - 1)][0];
    const owner = state.getPlayer(ownerId);
    const vBonus = owner ? getVerticalMonopolyBonus(owner, tile.id) : 0;
    const crisisMult = getCrisisRentMultiplier(player.currentLayer);
    const totalRent = Math.floor(baseRent * state.economy.cpiMultiplier * (1 + vBonus) * crisisMult);
    if (player.payAmount(totalRent)) {
      if (owner) owner.addMoney(totalRent, `过路费: ${tile.name}`);
      const bonusTag = vBonus > 0 ? ` [垂直垄断+${Math.round(vBonus*100)}%]` : '';
      ui.log.expense(`${player.name} 付过路费 $${totalRent} → ${owner?.name ?? '?'}${bonusTag}`);
      renderer.effects.moneyFly(tile.x, tile.y, -totalRent, '#E74C3C');
      refreshHUD();
    }
  }

  // === AI 自动处理 ===
  if (!player.isHuman) { aiHandleTile(player, tile); return; }

  ui.actions.clear();

  const ownerId2 = propertyOwners.get(tile.id);
  if (tile instanceof PropertyTile && !ownerId2 && tile.getPrice() > 0) {
    // 股票-地产绑定：持有相关股票享折扣
    let buyPrice = tile.getPrice();
    const ownedStocks = player.stockPortfolio.filter(s => s.type === 'long');
    if (ownedStocks.length > 0) {
      buyPrice = Math.floor(buyPrice * 0.85); // 15%折扣
    }
    ui.actions.addButton({ id: 'buy', text: `购买 $${buyPrice}${buyPrice < tile.getPrice() ? ' (股东85折)' : ''}`, cssClass: 'btn-buy', disabled: !player.canAfford(buyPrice), onClick: () => {
      propertyOwners.set(tile.id, player.id);
      propertyLevels.set(tile.id, 0);
      player.addProperty(tile.id, buyPrice);
      player.cash -= buyPrice;
      renderer.effects.buildAnimation(tile.x, tile.y);
      renderer.setPropertyLevels(propertyLevels);
      ui.log.add(`购入 ${tile.name} -$${buyPrice}`, 'income', player.name, player.color);
      refreshHUD();
      turnSys.endTurn(player); afterTurn();
    }});
    ui.actions.addButton({ id: 'auction', text: '触发拍卖', cssClass: 'btn-auction', disabled: false, onClick: () => { turnSys.endTurn(player); afterTurn(); } });
  }

  if (tile instanceof PropertyTile && ownerId2 === player.id) {
    const lv = propertyLevels.get(tile.id) ?? 0;
    if (lv < 3) {
      const cost = tile.upgradeCosts[lv] ?? 0;
      ui.actions.addButton({ id: 'upgrade', text: `升级 Lv${lv}→${lv+1} $${cost}`, cssClass: 'btn-upgrade', disabled: !player.canAfford(cost), onClick: () => {
        player.cash -= cost;
        propertyLevels.set(tile.id, lv + 1);
        renderer.effects.buildAnimation(tile.x, tile.y);
        renderer.setPropertyLevels(propertyLevels);
        ui.log.add(`${tile.name} 升级 Lv${lv+1} -$${cost}`, 'system', player.name, player.color);
        refreshHUD();
        turnSys.endTurn(player); afterTurn();
      }});
    }
  }

  if (tile instanceof PropertyTile && ownerId && ownerId !== player.id) {
    const lv = propertyLevels.get(tile.id) ?? 0;
    const baseRent = tile.rentTable[Math.min(lv, tile.rentTable.length - 1)][0];
    const owner = state.getPlayer(ownerId);
    const vBonus = owner ? getVerticalMonopolyBonus(owner, tile.id) : 0;
    const crisisMult = getCrisisRentMultiplier(player.currentLayer);
    const totalRent = Math.floor(baseRent * state.economy.cpiMultiplier * (1 + vBonus) * crisisMult);
    if (player.payAmount(totalRent)) {
      if (owner) owner.addMoney(totalRent, `过路费: ${tile.name}`);
      const bonusTag = vBonus > 0 ? ` [垂直垄断+${Math.round(vBonus*100)}%]` : '';
      ui.log.expense(`${player.name} 付过路费 $${totalRent} → ${owner?.name ?? '?'}${bonusTag}`);
      renderer.effects.moneyFly(tile.x, tile.y, -totalRent, '#E74C3C');
      if (!player.isHuman && owner?.isHuman && owner.isHuman) {
        renderer.showBubble(tile.x, tile.y, `$${totalRent}，谢谢老板!`, '#FFD700');
      }
      refreshHUD();
    }
  }

  if (tile instanceof SubwayTile) {
    const targetLayer = (tile as any).targetLayer as number;
    const targetPos = (tile as any).targetPosition as number;
    const targetLayerData = mapLayers[targetLayer];
    if (targetLayerData && targetPos < targetLayerData.tiles.length) {
      const targetTileId = targetLayerData.tiles[targetPos].id;
      player.currentLayer = targetLayer;
      player.currentTileId = targetTileId;
      renderer.switchLayer(targetLayer);
      ui.notify.layerSwitch(targetLayerData.name);
    }
  }

  if (tile instanceof AirportTile) {
    ui.log.system(`${player.name} 到达机场 — 你可以飞到任意层`);
    renderer.effects.teleportSwirl(tile.x, tile.y);
    ui.actions.addButton({ id: 'airport_l0', text: '✈️ 飞往地面层', cssClass: 'btn-end-turn', disabled: player.currentLayer === 0, onClick: () => {
      player.currentLayer = 0; player.currentTileId = 0; renderer.switchLayer(0); ui.notify.layerSwitch('地面层'); turnSys.endTurn(player); afterTurn();
    }});
    ui.actions.addButton({ id: 'airport_l1', text: '✈️ 飞往地下层', cssClass: 'btn-upgrade', disabled: player.currentLayer === 1, onClick: () => {
      player.currentLayer = 1; player.currentTileId = 100; renderer.switchLayer(1); ui.notify.layerSwitch('地下层'); turnSys.endTurn(player); afterTurn();
    }});
    ui.actions.addButton({ id: 'airport_l2', text: '✈️ 飞往天空层', cssClass: 'btn-buy', disabled: player.currentLayer === 2, onClick: () => {
      player.currentLayer = 2; player.currentTileId = 200; renderer.switchLayer(2); ui.notify.layerSwitch('天空层'); turnSys.endTurn(player); afterTurn();
    }});
  }

  if (tile instanceof CasinoTile) {
    ui.actions.addButton({ id: 'casino_big', text: '🎰 赌大 (1000)', cssClass: 'btn-casino', disabled: !player.canAfford(1000), onClick: () => { playCasino(player, 1000, 'big'); } });
    ui.actions.addButton({ id: 'casino_small', text: '🎰 赌小 (1000)', cssClass: 'btn-casino', disabled: !player.canAfford(1000), onClick: () => { playCasino(player, 1000, 'small'); } });
    ui.actions.addButton({ id: 'casino_odd', text: '🎲 猜单双 (500)', cssClass: 'btn-casino', disabled: !player.canAfford(500), onClick: () => { playCasino(player, 500, 'big'); } });
  }

  if (tile instanceof BankTile) {
    ui.actions.addButton({ id: 'bank_deposit', text: `🏦 存款 (现金 $${player.cash.toLocaleString()})`, cssClass: 'btn-buy', disabled: player.cash <= 0, onClick: () => {
      const amt = Math.min(player.cash, parseInt(prompt('存入金额:', Math.floor(player.cash * 0.5).toString()) || '0'));
      if (amt > 0 && player.deposit(amt)) { ui.log.income(`存入 $${amt}`); refreshHUD(); }
    }});
    ui.actions.addButton({ id: 'bank_withdraw', text: `💵 取款 (存款 $${player.bankSavings.toLocaleString()})`, cssClass: 'btn-end-turn', disabled: player.bankSavings <= 0, onClick: () => {
      const amt = Math.min(player.bankSavings, parseInt(prompt('取出金额:', Math.floor(player.bankSavings * 0.5).toString()) || '0'));
      if (amt > 0 && player.withdraw(amt)) { ui.log.system(`取出 $${amt}`); refreshHUD(); }
    }});
  }

  if (tile instanceof JailTile) {
    if (player.inJail) {
      ui.actions.addButton({ id: 'jail_bail', text: `💰 保释 $${(tile as any).bailAmount ?? 1000}`, cssClass: 'btn-buy', disabled: !player.canAfford((tile as any).bailAmount ?? 1000), onClick: () => {
        player.payAmount((tile as any).bailAmount ?? 1000);
        player.inJail = false; player.jailTurns = 0;
        bus.emit('jail.leave', { playerId: player.id, paid: (tile as any).bailAmount ?? 1000 });
        turnSys.endTurn(player); afterTurn();
      }});
      if (player.hasGetOutOfJailCard) {
        ui.actions.addButton({ id: 'jail_card', text: '🃏 使用出狱卡', cssClass: 'btn-upgrade', disabled: false, onClick: () => {
          player.hasGetOutOfJailCard = false; player.inJail = false; player.jailTurns = 0;
          bus.emit('jail.leave', { playerId: player.id, paid: 0 });
          turnSys.endTurn(player); afterTurn();
        }});
      }
      ui.actions.addButton({ id: 'jail_stay', text: `🔒 继续蹲 (剩${player.jailTurns}回合)`, cssClass: 'btn-skip', disabled: false, onClick: () => {
        // 不扣回合，等下次掷骰时由 handleDiceRoll 处理
        turnSys.endTurn(player); afterTurn();
      }});
    } else {
      ui.log.system(`${player.name} 路过监狱（参观）`);
    }
  }

  if (tile instanceof JailTile) {
    player.inJail = true; player.jailTurns = 3;
    bus.emit('jail.enter', { playerId: player.id, turns: 3 });
  }

  if (tile instanceof StockTile) {
    const stocks = stockSys.getAllStocks().map(s => {
      const trend = stockSys.getTrendSignal(s.id);
      const prevPrice = s.history.length >= 2 ? s.history[s.history.length - 2] : s.price;
      return { id: s.id, symbol: s.symbol, name: s.name, price: s.price, change: Math.round(s.price - prevPrice), trend: trend.signal };
    });
    ui.modal.showStockPanel(stocks, player.cash,
      (stockId, shares) => { const r = stockSys.buyStock(player, stockId, shares); ui.log.system(r.message); refreshHUD(); },
      (stockId) => { const r = stockSys.sellStock(player, stockId, 10); ui.log.system(r.message); refreshHUD(); },
      (stockId, shares) => { const r = stockSys.shortStock(player, stockId, shares); ui.log.system(r.message); refreshHUD(); },
      () => { turnSys.endTurn(player); afterTurn(); }
    );
    return;
  }

  if (tile.type === TileType.EVENT) {
    const deck = rng.pick([chanceCards, destinyCards]);
    if (deck.length > 0) {
      const card = rng.pick(deck);
      const logs = card.effects.map(e => executeCardEffect(e, player, state.getActivePlayers()));
      bus.emit('card.draw', { playerId: player.id, cardId: card.id });
      ui.log.add(`🃏 ${card.name}`, 'system', player.name, player.color);
      logs.forEach(l => {
        const cat = l.includes('获得') || l.includes('收') || l.includes('赢') ? 'income' :
                    l.includes('损失') || l.includes('支付') || l.includes('缴') ? 'expense' : 'system';
        ui.log.add(`  ↳ ${l}`, cat, player.name, player.color);
      });
      renderer.showCardPopup(card.name, card.getSummary());
      ui.modal.showCard(card.name, card.getSummary(), card.flavor, () => {});

      // === 卡牌特殊效果后处理 ===
      card.effects.forEach(e => {
        switch (e.type) {
          case CardEffectType.TELEPORT_LAYER:
            if (player.currentTileId === -1) {
              const tgtLayer = mapLayers[player.currentLayer];
              if (tgtLayer) player.currentTileId = tgtLayer.tiles[0].id;
            }
            renderer.switchLayer(player.currentLayer);
            break;
          case CardEffectType.MOVE_FORWARD:
          case CardEffectType.MOVE_BACKWARD: {
            const steps = e.type === CardEffectType.MOVE_FORWARD ? e.value : -e.value;
            const dest2 = moveSys.calculateDestination(player, steps);
            player.currentTileId = dest2;
            break;
          }
          case CardEffectType.TELEPORT:
            player.currentTileId = e.value;
            break;
          case CardEffectType.UPGRADE_FREE: {
            const owned = [...player.ownedTiles];
            const upgradable = owned.filter(tid => (propertyLevels.get(tid) ?? 0) < 3);
            for (let i = 0; i < Math.min(e.value, upgradable.length); i++) {
              propertyLevels.set(upgradable[i], (propertyLevels.get(upgradable[i]) ?? 0) + 1);
            }
            renderer.setPropertyLevels(propertyLevels);
            break;
          }
          case CardEffectType.DOWNGRADE_RANDOM: {
            const owned2 = [...player.ownedTiles];
            const downgradable = owned2.filter(tid => (propertyLevels.get(tid) ?? 0) > 0);
            for (let i = 0; i < Math.min(e.value, downgradable.length); i++) {
              propertyLevels.set(downgradable[i], Math.max(0, (propertyLevels.get(downgradable[i]) ?? 1) - 1));
            }
            renderer.setPropertyLevels(propertyLevels);
            break;
          }
          case CardEffectType.EXTRA_TURN:
            wasDoubles = true; // 复用对子额外回合逻辑
            break;
          case CardEffectType.STEAL_PROPERTY:
          case CardEffectType.EXCHANGE_POSITION:
            refreshHUD();
            break;
        }
      });
    }
  }

  ui.actions.addButton({ id: 'end', text: '结束回合', cssClass: 'btn-end-turn', disabled: false, onClick: () => { turnSys.endTurn(player); afterTurn(); } });
}

function aiHandleTile(player: Player, tile: Tile): void {
  // ---- 每个地点类型的 AI 专属行为 ----
  if (tile instanceof PropertyTile) {
    const ownerId = propertyOwners.get(tile.id);
    if (!ownerId && tile.getPrice() > 0) {
      // 无主地 → 现金充足必买，现金不足也尽量买
      if (player.canAfford(tile.getPrice())) {
        propertyOwners.set(tile.id, player.id);
        propertyLevels.set(tile.id, 0);
        player.addProperty(tile.id, tile.getPrice());
        player.cash -= tile.getPrice();
        ui.log.add(`购入 ${tile.name} -$${tile.getPrice()}`, 'income', player.name, player.color);
        renderer.effects.buildAnimation(tile.x, tile.y);
        renderer.setPropertyLevels(propertyLevels);
      }
    } else if (ownerId && ownerId === player.id) {
      // 自己的地 → 考虑升级
      const lv = propertyLevels.get(tile.id) ?? 0;
      if (lv < 3) {
        const cost = tile.upgradeCosts[lv] ?? 0;
        if (player.canAfford(cost) && player.cash > 5000) {
          player.cash -= cost;
          propertyLevels.set(tile.id, lv + 1);
          ui.log.add(`升级 ${tile.name} Lv${lv+1}`, 'system', player.name, player.color);
        }
      }
    }
    // 他人地产的过路费已在 handleTileTrigger 强制收取
  }
  else if (tile instanceof StockTile) {
    const stocks = stockSys.getAllStocks();
    if (stocks.length > 0 && player.cash > 1000) {
      const pick = rng.pick(stocks);
      const shares = Math.max(1, Math.floor(player.cash * 0.15 / pick.price));
      if (player.cash > 5000 && rng.chance(0.3)) {
        stockSys.shortStock(player, pick.id, shares);
        ui.log.add(`做空 ${pick.symbol} ${shares}股`, 'warning', player.name, player.color);
      } else {
        stockSys.buyStock(player, pick.id, shares);
        ui.log.add(`买入 ${pick.symbol} ${shares}股`, 'income', player.name, player.color);
      }
    }
  }
  else if (tile instanceof BankTile) {
    if (player.cash > 3000) {
      const amt = Math.floor(player.cash * 0.4);
      player.deposit(amt);
      ui.log.add(`存入 $${amt}`, 'system', player.name, player.color);
    } else if (player.bankSavings > 1000 && player.cash < 500) {
      player.withdraw(2000);
      ui.log.add(`取款 $2000`, 'system', player.name, player.color);
    }
  }
  else if (tile instanceof CasinoTile && player.canAfford(500)) {
    const r = diceSys.casinoDice(500, rng.chance(0.5) ? 'big' : 'small');
    if (r.won) player.addMoney(r.payout, '赌场');
    else player.payAmount(500);
    ui.log.add(r.won ? `赌场赢 $${r.payout}` : '赌场输 $500', r.won ? 'income' : 'expense', player.name, player.color);
  }
  else if (tile instanceof EventTile) {
    const deck = rng.pick([chanceCards, destinyCards]);
    if (deck.length > 0) {
      const card = rng.pick(deck);
      const fxLogs = card.effects.map(e => executeCardEffect(e, player, state.getActivePlayers()));
      ui.log.add(`🃏 ${card.name}`, 'system', player.name, player.color);
      fxLogs.forEach(l => { ui.log.add(`  ↳ ${l}`, 'system', player.name, player.color); });
    }
  }
  else if (tile instanceof AirportTile) {
    // 随机跳层
    const targetLayer = rng.int(0, 2);
    const layer = mapLayers[targetLayer];
    if (layer) {
      player.currentLayer = targetLayer;
      player.currentTileId = layer.tiles[0].id;
      renderer.switchLayer(targetLayer);
      ui.log.add(`飞往 ${layer.name}`, 'system', player.name, player.color);
    }
  }
  else if (tile instanceof SubwayTile) {
    // SubwayTile的跳转在handleTileTrigger强制处理
  }

  refreshHUD();
  setTimeout(() => { turnSys.endTurn(player); afterTurn(); }, 400);
}

function afterTurn(): void {
  ui.actions.clear();
  tileProcessed = false;
  renderer.hideDice();

  // 对子额外回合：回退到上一个玩家（endTurn 已经 advance 了）
  if (wasDoubles) {
    const active = state.playerOrder.filter(id => !state.players.get(id)?.bankrupt);
    const currActiveIdx = active.indexOf(state.getCurrentPlayerId());
    const prevActiveIdx = (currActiveIdx - 1 + active.length) % active.length;
    state.currentPlayerIndex = state.playerOrder.indexOf(active[prevActiveIdx]);
    ui.log.system('🎯 对子! 额外回合');
    ui.notify.show('🎯 对子! 再来一次', 1500, '#FFD700');
  }
  wasDoubles = false;
  stockSys.updatePrices();
  economySys.updateCPI();
  // 灾变只在每轮完整结束时递减+检测新灾变
  if (state.getCurrentPlayerId() === state.playerOrder[0]) {
    tickLayerCrisis();
    triggerRandomCrisis();
  }
  updateAIMentalDrift();
  // 同步经济周期到渲染器
  renderer.economyCycle = economySys.getEconomyCycle();

  // 全局灾变效果
  const globalCrisis = layerCrisis.get(-1);
  if (globalCrisis && globalCrisis.remaining > 0) {
    if (globalCrisis.type.includes('退税')) {
      for (const [, p] of state.players) {
        if (!p.bankrupt) p.addMoney(2000, '全民退税');
      }
      ui.log.income('全民退税: 每人 +$2000');
    }
    if (globalCrisis.type.includes('股灾')) {
      // 股灾：所有股票跌20%
      for (const [, stock] of state.stocks) {
        stock.price = Math.max(1, Math.floor(stock.price * 0.8));
      }
    }
    if (globalCrisis.type.includes('加息')) {
      state.economy.loanRate = Math.min(0.5, state.economy.loanRate * 2);
    }
  }

  // 每轮结束收地产维护费
  if (state.getCurrentPlayerId() === state.playerOrder[0] && state.roundNumber > 0) {
    for (const [, p] of state.players) {
      if (p.bankrupt || p.ownedTiles.size === 0) continue;
      // 维护费 = 各地产价格的 5% × 灾变倍率
      let maintenance = 0;
      for (const tId of p.ownedTiles) {
        const cfg = findTileConfig(tId);
        maintenance += Math.floor((cfg?.property?.basePrice ?? (cfg as any)?.basePrice ?? 500) * 0.05);
      }
      maintenance = Math.floor(maintenance * getCrisisMaintenanceMultiplier(p.currentLayer));
      if (p.payAmount(maintenance)) {
        ui.log.expense(`${p.name} 地产维护费 -$${maintenance} (${p.ownedTiles.size}处)`);
      } else {
        const toSell = [...p.ownedTiles].slice(0, Math.ceil(maintenance / 300));
        for (const tId of toSell) {
          const t = findTile(tId);
          if (t instanceof PropertyTile) economySys.sellProperty(p, t);
        }
        if (!p.payAmount(maintenance)) {
          p.bankrupt = true;
          bus.emit('bankruptcy.start', { playerId: p.id });
          ui.log.warning(`${p.name} 付不起维护费，破产!`);
        } else {
          ui.log.warning(`${p.name} 变卖地产支付维护费`);
        }
      }
    }
  }

  if (turnSys.checkGameOver()) {
    state.phase = GamePhase.GAME_OVER;
    const winner = state.getActivePlayers()[0];
    if (winner) bus.emit('game.over', { winnerId: winner.id });
    return;
  }

  const next = state.getCurrentPlayer();
  if (!next) return;
  turnSys.beginTurn(next);
  // 自动切换到当前玩家所在的层
  if (next.currentLayer !== renderer.getCurrentLayer()) {
    renderer.switchLayer(next.currentLayer);
  }
  refreshHUD();

  // 人类玩家：显示掷骰按钮；AI自动掷骰
  if (next.isHuman) {
    ui.actions.setButtons([{
      id: 'roll_dice', text: '🎲 掷骰子', cssClass: 'btn-end-turn',
      disabled: false, onClick: () => handleDiceRoll()
    }]);
    ui.log.add('轮到你了', 'system', next.name, next.color);
  } else {
    const delay = gameSpeed === 3 ? 0 : gameSpeed === 2 ? 150 : 800;
    setTimeout(() => handleDiceRoll(), delay);
  }
}

// ---- 辅助 ----
function findTileConfig(id: number) {
  for (const layer of mapLayers) {
    const t = layer.tiles.find(tt => tt.id === id);
    if (t) return t;
  }
  return undefined;
}

function findTile(id: number): Tile | null {
  const cfg = findTileConfig(id);
  if (!cfg) return null;
  const base = { id: cfg.id, name: cfg.name, type: cfg.type, layer: renderer.getCurrentLayer(), position: cfg.position, x: cfg.x, y: cfg.y };
  switch (cfg.type) {
    case TileType.START: return new StartTile({ ...base, salary: cfg.salary ?? 2000 });
    case TileType.PROPERTY: return new PropertyTile({ ...base, basePrice: (cfg as any).basePrice ?? (cfg as any).price ?? 0, upgradeCosts: (cfg as any).upgradeCosts ?? [], rentTable: (cfg as any).rentTable ?? [[0,0],[0,0],[0,0],[0,0]], colorGroup: (cfg as any).colorGroup ?? 'none', mortgageValue: (cfg as any).mortgageValue ?? 0 });
    case TileType.EVENT: return new EventTile({ ...base, cardCategory: cfg.cardCategory });
    case TileType.JAIL: return new JailTile({ ...base, bailAmount: cfg.bailAmount });
    case TileType.CASINO: return new CasinoTile(base);
    case TileType.STOCK: return new StockTile(base);
    case TileType.BANK: return new BankTile(base);
    case TileType.SUBWAY: return new SubwayTile({ ...base, targetLayer: cfg.targetLayer, targetPosition: cfg.targetPosition });
    case TileType.TAX: return new TaxTile({ ...base, taxRate: cfg.taxRate, fixedAmount: cfg.fixedAmount });
    case TileType.AIRPORT: return new AirportTile(base);
    default: return new PropertyTile({ ...base, basePrice: (cfg as any).basePrice ?? 0, upgradeCosts: (cfg as any).upgradeCosts ?? [], rentTable: (cfg as any).rentTable ?? [[0,0],[0,0],[0,0],[0,0]], colorGroup: (cfg as any).colorGroup ?? 'none', mortgageValue: (cfg as any).mortgageValue ?? 0 });
  }
}

function getAheadTiles(player: Player, count: number): (Tile | null)[] {
  const result: (Tile | null)[] = [];
  const layer = mapLayers[player.currentLayer];
  if (!layer) return result;
  const startPos = layer.tiles.find(t => t.id === player.currentTileId)?.position ?? 0;
  for (let i = 1; i <= count; i++) {
    const pos = (startPos + i) % layer.tiles.length;
    const cfg = layer.tiles[pos];
    result.push(cfg ? findTile(cfg.id) : null);
  }
  return result;
}

function playCasino(player: Player, bet: number, choice: 'big' | 'small'): void {
  const result = diceSys.casinoDice(bet, choice);
  if (result.won) {
    player.addMoney(result.payout, '赌场');
    ui.notify.moneyChange(result.payout);
    ui.log.income(`赌场赢了 $${result.payout}!`);
  } else {
    player.payAmount(bet);
    ui.notify.moneyChange(-bet);
    ui.log.expense(`赌场输了 $${bet}`);
  }
  turnSys.endTurn(player); afterTurn();
}

// ---- 自动测试模式 ----
function startAutoPlay(): void {
  state.reset();
  state.settings.mode = GameMode.AI_SINGLE;
  state.settings.aiDifficulty = AIDifficulty.NORMAL;
  state.settings.playerCount = 4;
  state.settings.humanPlayers = 0; // 全 AI
  state.settings.startingMoney = 15000;

  const personalities = ['conservative', 'aggressive', 'balanced', 'gambler'];
  for (let i = 0; i < 4; i++) {
    const player = createPlayer(i, false, personalities[i], 15000, `AI-${personalities[i].slice(0, 4)}`);
    player.currentTileId = 0;
    player.currentLayer = 0;
    state.players.set(player.id, player);
    state.playerOrder.push(player.id);
    aiManagers.set(player.id, createAIManager(rng, personalities[i], AIDifficulty.NORMAL));
  }

  if (state.settings.enableStocks) { stockSys.initMarket(); stockSys.updatePrices(); }

  renderer.setPlayers([...state.players.values()]);
  renderer.switchLayer(0);
  ui.log.clear();
  gameOverTriggered = false;
  state.phase = GamePhase.PLAYING;
  narrowCanvasForDashboard();
  ui.enterGame();
  refreshHUD();
  ui.log.system('🤖 自动测试模式启动 — 4 AI 高速对战');

  const first = state.getCurrentPlayer();
  if (first) {
    turnSys.beginTurn(first);
    debugger_.start(10000, 500); // 每10秒检查一次，最多500回合
    // 触发第一个 AI 掷骰
    setTimeout(() => handleDiceRoll(), 200);
  }
}

let autoPlayTimer: ReturnType<typeof setTimeout> | null = null;

// ---- 启动 ----
function startGame(): void {
  state.reset();
  state.restoreSaves();

  const settings = state.settings;
  const names = settings.mode === GameMode.AI_SINGLE
    ? ['你', '钱夫人', '金算盘', '冒险王']
    : ['玩家A', '玩家B', '玩家C', '玩家D'];

  const personalities = ['conservative', 'aggressive', 'balanced', 'gambler', 'landlord'];
  let pIdx = 0;

  for (let i = 0; i < settings.playerCount; i++) {
    const isHuman = i < settings.humanPlayers;
    const personality = isHuman ? undefined : personalities[pIdx++ % personalities.length];
    const bonus = isHuman ? 0 : (settings.aiDifficulty === AIDifficulty.HARD ? 3000 : settings.aiDifficulty === AIDifficulty.EASY ? -2000 : 0);
    const player = createPlayer(i, isHuman, personality, Math.max(5000, settings.startingMoney + bonus), names[i]);
    player.currentTileId = 0; player.currentLayer = 0;
    state.players.set(player.id, player);
    state.playerOrder.push(player.id);
    if (!isHuman) aiManagers.set(player.id, createAIManager(rng, personality ?? 'balanced', settings.aiDifficulty));
  }

  if (settings.enableStocks) { stockSys.initMarket(); stockSys.updatePrices(); }

  renderer.setPlayers([...state.players.values()]);
  renderer.effects.clear();
  renderer.hideDice();
  renderer.switchLayer(0);
  ui.log.clear();
  gameOverTriggered = false;
  state.phase = GamePhase.PLAYING;

  narrowCanvasForDashboard();
  ui.enterGame();
  refreshHUD();

  const first = state.getCurrentPlayer();
  if (first) {
    turnSys.beginTurn(first);
    ui.log.system('=== Empire Tycoon 帝国大亨 ===');
    if (first.isHuman) {
      ui.actions.setButtons([{ id: 'roll_dice', text: '🎲 掷骰子', cssClass: 'btn-end-turn', disabled: false, onClick: () => handleDiceRoll() }]);
    } else {
      setTimeout(() => handleDiceRoll(), 800);
    }
  }
}

// ---- 在线联机 ----
let onlineRoomCode = '';
let isOnlineHost = false;
let myOnlinePlayerId = '';

const PLAYER_COLORS = ['#E74C3C', '#3498DB', '#2ECC71', '#F39C12'];

function startOnlineGame(): void {
  const choice = prompt('联机模式:\n输入 host 创建房间\n输入 4位房间码 加入房间')?.trim() || 'host';

  state.reset();
  state.settings.mode = GameMode.ONLINE;
  state.settings.playerCount = 0;
  state.settings.humanPlayers = 0;
  renderer.switchLayer(0);
  renderer.effects.clear();
  gameOverTriggered = false;
  narrowCanvasForDashboard();
  ui.enterGame();
  ui.actions.clear();
  ui.log.clear();

  if (!choice || choice.toLowerCase() === 'host') {
    // === 房主：连本地服务器 ===
    isOnlineHost = true;
    const name = prompt('你的昵称:', '房主')?.trim() || '房主';
    if (network) network.disconnect();
    network = new NetworkClient('ws://localhost:3001');
    ui.log.system('正在创建房间...');
    network.connect('HOST', name, true);
  } else {
    // === 加入房间 ===
    isOnlineHost = false;
    onlineRoomCode = choice.toUpperCase();
    const name = prompt('你的昵称:', '玩家')?.trim() || '玩家';
    const serverAddr = prompt('房主的联机地址:\n(例如 wss://xxx.loca.lt)')?.trim() || '';
    if (!serverAddr) { ui.log.system('未输入地址，取消联机'); return; }
    // 自动处理 wss:// 和 ws://
    const addr = serverAddr.startsWith('ws') ? serverAddr : `wss://${serverAddr.replace(/^https?:\/\//, '')}`;
    if (network) network.disconnect();
    network = new NetworkClient(addr);
    ui.log.system(`服务器: ${addr}`);
    ui.log.system(`正在加入房间 ${onlineRoomCode}...`);
    network.connect(onlineRoomCode, name);
  }
  refreshHUD();
}

// ---- 联机消息处理 ----
bus.on('network.connect', (data) => {
  onlineRoomCode = data.roomCode;
  ui.log.system(`已连接到房间 ${onlineRoomCode}`);
});

bus.on('network.message', (data: any) => {
  if (data.type === 'ROOM_INFO') {
    const payload = data.payload;
    onlineRoomCode = payload.roomCode || onlineRoomCode;
    myOnlinePlayerId = data.playerId || myOnlinePlayerId;

    // 从服务器玩家列表重建本地玩家
    const serverPlayers: Array<{ id: string; name: string; color: string; ready: boolean }> = payload.players || [];
    state.players.clear();
    state.playerOrder = [];
    serverPlayers.forEach((sp, i) => {
      const isMe = sp.id === myOnlinePlayerId;
      const p = createPlayer(i, true, undefined, 15000, sp.name);
      p.color = sp.color; // 用服务器分配的颜色
      p.id = sp.id;
      p.currentTileId = 0; p.currentLayer = 0;
      state.players.set(p.id, p);
      state.playerOrder.push(p.id);
    });
    state.settings.playerCount = serverPlayers.length;
    state.settings.humanPlayers = serverPlayers.length;

    if (state.settings.enableStocks) { stockSys.initMarket(); stockSys.updatePrices(); }
    renderer.setPlayers([...state.players.values()]);
    refreshHUD();

    const names = serverPlayers.map(p => `${p.name}(${p.color})`).join(', ');
    ui.log.system(`房间 ${onlineRoomCode}: ${names} (${serverPlayers.length}/4)`);
    if (isOnlineHost) ui.notify.show(`房间: ${onlineRoomCode}`, 3000, '#2ECC71');
  }

  if (data.type === 'GAME_START') {
    ui.log.system('游戏开始!');
    state.phase = GamePhase.PLAYING;
    const first = state.getCurrentPlayer();
    if (first && first.id === myOnlinePlayerId) {
      ui.actions.setButtons([{ id: 'roll_dice', text: '掷骰子', cssClass: 'btn-end-turn', disabled: false, onClick: () => handleDiceRoll() }]);
      ui.notify.show('你的回合!', 1500, '#FFD700');
    }
  }

  if (data.type === 'DICE_RESULT' || data.type === 'PLAYER_MOVE') {
    const pd = data.payload as any;
    if (pd?.playerId && pd?.path) {
      const opponent = state.getPlayer(pd.playerId);
      if (opponent) {
        opponent.currentTileId = pd.path[pd.path.length - 1];
        opponent.currentLayer = pd.layer ?? opponent.currentLayer;
        refreshHUD();
        ui.log.add(`${opponent.name} 移动到 #${opponent.currentTileId}`, 'system', opponent.name, opponent.color);
      }
    }
  }

  if (data.type === 'END_TURN') {
    const pd = data.payload as any;
    if (pd?.playerId) {
      const p = state.getPlayer(pd.playerId);
      if (p) {
        state.currentPlayerIndex = state.playerOrder.indexOf(pd.nextPlayerId);
        const next = state.getCurrentPlayer();
        if (next && next.id === myOnlinePlayerId) {
          ui.actions.setButtons([{ id: 'roll_dice', text: '掷骰子', cssClass: 'btn-end-turn', disabled: false, onClick: () => handleDiceRoll() }]);
          ui.notify.show('你的回合!', 1500, '#FFD700');
        }
        refreshHUD();
      }
    }
  }
});

// ---- 菜单回调 ----
ui.mainMenu.onStartGame = (mode: GameMode) => {
  if (mode === GameMode.ONLINE) {
    startOnlineGame();
    return;
  }
  startGame();
};

// 窗口适配
window.addEventListener('resize', () => {
  fitCanvas();
  engine.resize(canvas);
  renderer.resize(canvas.width, canvas.height);
});

// 启动引擎
engine.start();
ui.log.system('Empire Tycoon 就绪 — 选择模式开始游戏');

// 导出调试接口
(window as any).__et = { state, engine, renderer, startGame, startAutoPlay, turboSkip, debugger_ };

// 按 ` 启动自动测试，按 T turbo跳100回合
window.addEventListener('keydown', (e) => {
  if (e.key === '`' && !debugger_.isRunning()) {
    e.preventDefault();
    if (autoPlayTimer) clearTimeout(autoPlayTimer);
    startAutoPlay();
  }
  if (e.key === 't' || e.key === 'T') {
    e.preventDefault();
    turboSkip(100);
  }
});

// ---- Turbo 跳过回合（异步分片，不卡死浏览器） ----
let turboRemaining = 0;
const BATCH_SIZE = 20;

function turboSkip(total: number = 100): void {
  if (state.phase !== GamePhase.PLAYING && state.phase !== GamePhase.ROLLING && state.phase !== GamePhase.TILE_TRIGGER && state.phase !== GamePhase.TURN_TRANSITION) return;
  // 不允许有活人类玩家时 turbo
  const humans = state.getHumanPlayers().filter(p => !p.bankrupt);
  if (humans.length > 0) {
    ui.notify.show('请先结束你的回合', 1500, '#F39C12');
    console.log('Turbo 停止: 有人类玩家未行动');
    return;
  }
  turboRemaining = total;
  console.log(`⚡ Turbo: 开始 ${total} 回合`);
  turboBatch();
}

function turboBatch(): void {
  if (turboRemaining <= 0 || (state.phase as string) === 'GAME_OVER') {
    const elapsed = 0;
    console.log(`⚡ Turbo 完成`);
    refreshHUD();
    renderer.setPlayers([...state.players.values()]);
    if (turnSys.checkGameOver()) {
      state.phase = GamePhase.GAME_OVER;
      const active = state.getActivePlayers();
      const winner = active[0] ?? [...state.players.values()].sort((a, b) => b.netWorth - a.netWorth)[0];
      if (winner) bus.emit('game.over', { winnerId: winner.id });
    }
    ui.notify.show(`Turbo: ${state.turnNumber}回合`, 1000, '#FFD700');
    return;
  }

  const batch = Math.min(BATCH_SIZE, turboRemaining);
  for (let i = 0; i < batch; i++) {
    turboRemaining--;
    turboOneTurn();
    if ((state.phase as string) === 'GAME_OVER') break;
  }

  refreshHUD();
  renderer.setPlayers([...state.players.values()]);

  // 让出主线程，下一帧继续
  requestAnimationFrame(() => turboBatch());
}

function turboOneTurn(): void {
  const player = state.getCurrentPlayer();
  if (!player || player.bankrupt) { state.advancePlayer(); state.turnNumber++; return; }
  if (player.isHuman) { turboRemaining = 0; return; }

  state.turnNumber++;
  player.turnsPlayed++;

  if (player.id === state.playerOrder[0]) {
    state.roundNumber++;
    tickLayerCrisis();
    triggerRandomCrisis();
    for (const [, p] of state.players) {
      if (p.bankrupt || p.ownedTiles.size === 0) continue;
      let maint = 0;
      for (const tId of p.ownedTiles) {
        const cfg = findTileConfig(tId);
        maint += Math.floor((cfg?.property?.basePrice ?? (cfg as any)?.basePrice ?? 500) * 0.05);
      }
      if (!p.payAmount(maint)) {
        const toSell = [...p.ownedTiles].slice(0, Math.ceil(maint / 300));
        for (const tId of toSell) {
          const t = findTile(tId);
          if (t instanceof PropertyTile) economySys.sellProperty(p, t);
        }
        if (!p.payAmount(maint)) { p.bankrupt = true; }
      }
    }
    stockSys.updatePrices();
    economySys.updateCPI();
  }

  diceSys.roll();
  if (diceSys.checkDoublesJail()) {
    player.inJail = true; player.jailTurns = 3; state.doublesCount = 0;
    state.advancePlayer(); return;
  }

  const steps = diceSys.getSteps(state.currentDice);
  const path = moveSys.buildForwardPath(player, steps);
  if (path.length < 2) { state.advancePlayer(); return; }
  player.previousTileId = player.currentTileId;
  player.currentTileId = path[path.length - 1];

  for (const pid of moveSys.getPassedTiles(player.previousTileId, player.currentTileId, player.currentLayer)) {
    const cfg = findTileConfig(pid);
    if (cfg?.type === TileType.START) economySys.paySalary(player, 1000);
  }

  const tile = findTile(player.currentTileId);
  if (tile) {
    if (tile instanceof PropertyTile && !tile.owned && tile.getPrice() > 0 && player.canAfford(tile.getPrice())) {
      economySys.buyProperty(player, tile);
    } else if (tile instanceof PropertyTile && tile.ownerId && tile.ownerId !== player.id) {
      economySys.collectRent(tile, player);
    } else if (tile instanceof StartTile) {
      economySys.paySalary(player, 1500);
    } else if (tile instanceof SubwayTile) {
      const tl = (tile as any).targetLayer, tp = (tile as any).targetPosition;
      const tld = mapLayers[tl];
      if (tld && tp < tld.tiles.length) { player.currentLayer = tl; player.currentTileId = tld.tiles[tp].id; }
    } else if (tile.type === TileType.EVENT) {
      const deck = rng.pick([chanceCards, destinyCards]);
      if (deck.length > 0) executeCardEffect(rng.pick(deck).effects[0], player, state.getActivePlayers());
    } else if (tile instanceof StockTile) {
      const stocks = stockSys.getAllStocks();
      if (stocks.length > 0 && player.cash > 500) {
        const s = rng.pick(stocks);
        stockSys.buyStock(player, s.id, Math.max(1, Math.floor(player.cash * 0.1 / s.price)));
      }
    }
  }

  for (const tId of player.ownedTiles) {
    const t = findTile(tId);
    if (t instanceof PropertyTile && t.ownerId === player.id && t.canUpgrade() && player.canAfford(t.upgradeCost) && player.cash > 3000) {
      economySys.upgradeProperty(player, t); break;
    }
  }

  state.advancePlayer();
}
