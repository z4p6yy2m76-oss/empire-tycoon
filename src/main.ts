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
import { executeCardEffect } from './entities/Card';
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
let gameSpeed: 1 | 2 | 3 = 1; // 1=正常 2=快速 3=瞬间

const ctx = canvas.getContext('2d')!;
const renderer = new Renderer(ctx);
renderer.setMapLayers(mapLayers);

// ---- 游戏主循环 ----
engine.setUpdate((dt: number) => {
  input.endFrame();
  renderer.effects.update(dt);
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

// ---- 输入（点击不再自动掷骰，必须点按钮） ----
input.onClick = () => {
  // 只处理 UI 层的点击（由 DOM 事件处理）
};

// 键盘
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state.phase === GamePhase.MENU) return;
    ui.modal.show('暂停', '游戏已暂停', [
      { text: '继续', cssClass: 'btn-end-turn', onClick: () => ui.modal.hide() },
      { text: '存档', cssClass: 'btn-auction', onClick: () => { state.save(); ui.modal.hide(); } },
      { text: '返回菜单', cssClass: 'btn-danger', onClick: () => { state.reset(); ui.returnToMenu(); ui.modal.hide(); } },
    ]);
  }
  if (e.key === 'r' && state.phase === GamePhase.ROLLING) handleDiceRoll();
  if (e.key === '1') { renderer.switchLayer(0); refreshHUD(); }
  if (e.key === '2') { renderer.switchLayer(1); refreshHUD(); }
  if (e.key === '3') { renderer.switchLayer(2); refreshHUD(); }
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
  ui.log.system(`${name} 掷出 ${data.values[0]}+${data.values[1]}=${data.total}${data.values[0] === data.values[1] ? ' (对子!)' : ''}`);
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
  ui.log.expense(`${p?.name ?? data.playerId} 破产!`);
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
    () => { ui.modal.hide(); ui.returnToMenu(); },
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

  if (diceSys.checkDoublesJail()) {
    player.inJail = true; player.jailTurns = 3; state.doublesCount = 0;
    bus.emit('jail.enter', { playerId: player.id, turns: 3 });
    turnSys.endTurn(player); afterTurn(); return;
  }

  const steps = diceSys.getSteps(result.values);
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

  ui.log.system(`${player.name} 停在: ${tile.name}`);
  refreshHUD();

  if (!player.isHuman) { aiHandleTile(player, tile); return; }

  ui.actions.clear();
  const bw = 170, hw = 42;

  if (tile instanceof PropertyTile && !tile.owned && tile.getPrice() > 0) {
    ui.actions.addButton({ id: 'buy', text: `购买 $${tile.getPrice()}`, cssClass: 'btn-buy', disabled: !player.canAfford(tile.getPrice()), onClick: () => { economySys.buyProperty(player, tile); turnSys.endTurn(player); afterTurn(); } });
    ui.actions.addButton({ id: 'auction', text: '触发拍卖', cssClass: 'btn-auction', disabled: false, onClick: () => { auctionSys.startAuction(tile, state.getActivePlayers()); turnSys.endTurn(player); afterTurn(); } });
  }

  if (tile instanceof PropertyTile && tile.ownerId === player.id && tile.canUpgrade()) {
    ui.actions.addButton({ id: 'upgrade', text: `升级 $${tile.upgradeCost}`, cssClass: 'btn-upgrade', disabled: !player.canAfford(tile.upgradeCost), onClick: () => { economySys.upgradeProperty(player, tile); turnSys.endTurn(player); afterTurn(); } });
  }

  if (tile instanceof PropertyTile && tile.ownerId && tile.ownerId !== player.id) {
    economySys.collectRent(tile, player);
  }

  if (tile instanceof StartTile) economySys.paySalary(player, 1500); // 降为1500

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
      ui.actions.addButton({ id: 'jail_bail', text: `💰 保释 $${(tile as any).bailAmount ?? 500}`, cssClass: 'btn-buy', disabled: !player.canAfford((tile as any).bailAmount ?? 500), onClick: () => {
        player.payAmount((tile as any).bailAmount ?? 500);
        player.inJail = false; player.jailTurns = 0;
        bus.emit('jail.leave', { playerId: player.id, paid: (tile as any).bailAmount ?? 500 });
      }});
      if (player.hasGetOutOfJailCard) {
        ui.actions.addButton({ id: 'jail_card', text: '🃏 使用出狱卡', cssClass: 'btn-upgrade', disabled: false, onClick: () => {
          player.hasGetOutOfJailCard = false; player.inJail = false; player.jailTurns = 0;
          bus.emit('jail.leave', { playerId: player.id, paid: 0 });
        }});
      }
      ui.actions.addButton({ id: 'jail_stay', text: '🔒 继续蹲', cssClass: 'btn-skip', disabled: false, onClick: () => {
        player.jailTurns--;
        if (player.jailTurns <= 0) { player.inJail = false; bus.emit('jail.leave', { playerId: player.id, paid: 0 }); }
      }});
    } else {
      ui.log.system(`${player.name} 路过监狱（参观）`);
    }
  }

  if (tile instanceof TaxTile) {
    const taxAmount = (tile as any).fixedAmount > 0 ? (tile as any).fixedAmount : Math.floor(player.totalAssets * ((tile as any).taxRate ?? 0.15));
    player.payAmount(Math.min(taxAmount, player.cash)); // 至少付到现金为0
    ui.log.expense(`${player.name} 缴税 $${Math.min(taxAmount, player.cash + player.bankSavings)}`);
    ui.notify.moneyChange(-taxAmount);
    renderer.effects.moneyFly(findTileConfig(tile.id)?.x ?? 700, findTileConfig(tile.id)?.y ?? 450, -taxAmount, '#E67E22');
    if (!player.canAfford(1)) bus.emit('bankruptcy.start', { playerId: player.id });
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
      const log = executeCardEffect(card.effects[0], player, state.getActivePlayers());
      bus.emit('card.draw', { playerId: player.id, cardId: card.id });
      ui.log.system(`抽到: ${card.name} — ${log}`);
      ui.modal.showCard(card.name, card.getSummary(), card.flavor, () => {});
    }
  }

  ui.actions.addButton({ id: 'end', text: '结束回合', cssClass: 'btn-end-turn', disabled: false, onClick: () => { turnSys.endTurn(player); afterTurn(); } });
}

function aiHandleTile(player: Player, tile: Tile): void {
  const ai = aiManagers.get(player.id);
  if (!ai) { turnSys.endTurn(player); afterTurn(); return; }

  const ctx: AIContext = {
    player, allPlayers: state.getActivePlayers(), currentTile: tile,
    aheadTiles: getAheadTiles(player, 6), mapLayers,
    stocks: stockSys.getAllStocks(),
    roundNumber: state.roundNumber, cpiMultiplier: state.economy.cpiMultiplier,
  };

  const result = ai.decide(ctx);
  if (result) ui.log.system(result.log);

  // 给 AI 操作一点延迟感
  setTimeout(() => {
    turnSys.endTurn(player);
    afterTurn();
  }, 600);
}

function afterTurn(): void {
  ui.actions.clear();
  tileProcessed = false;
  stockSys.updatePrices();
  economySys.updateCPI();

  // 每轮结束收地产维护费
  if (state.getCurrentPlayerId() === state.playerOrder[0] && state.roundNumber > 0) {
    for (const [, p] of state.players) {
      if (p.bankrupt || p.ownedTiles.size === 0) continue;
      const maintenance = p.ownedTiles.size * 150;
      if (p.payAmount(maintenance)) {
        ui.log.expense(`${p.name} 地产维护费 -$${maintenance} (${p.ownedTiles.size}处)`);
      } else {
        // 强制卖地抵费
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
    case TileType.PROPERTY: return new PropertyTile({ ...base, ...cfg.property! });
    case TileType.EVENT: return new EventTile({ ...base, cardCategory: cfg.cardCategory });
    case TileType.JAIL: return new JailTile({ ...base, bailAmount: cfg.bailAmount });
    case TileType.CASINO: return new CasinoTile(base);
    case TileType.STOCK: return new StockTile(base);
    case TileType.BANK: return new BankTile(base);
    case TileType.SUBWAY: return new SubwayTile({ ...base, targetLayer: cfg.targetLayer, targetPosition: cfg.targetPosition });
    case TileType.TAX: return new TaxTile({ ...base, taxRate: cfg.taxRate, fixedAmount: cfg.fixedAmount });
    case TileType.AIRPORT: return new AirportTile(base);
    default: return new PropertyTile({ ...base, ...(cfg.property ?? { basePrice: 0, upgradeCosts: [], rentTable: [[0]], colorGroup: 'none', mortgageValue: 0 }) });
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
  renderer.switchLayer(0);
  ui.log.clear();
  gameOverTriggered = false;
  state.phase = GamePhase.PLAYING;

  ui.enterGame();
  refreshHUD();

  const first = state.getCurrentPlayer();
  if (first) {
    turnSys.beginTurn(first);
    ui.log.system(`=== Empire Tycoon 帝国大亨 ===`);
    ui.notify.playerTurn(first.name);
    if (!first.isHuman) setTimeout(() => handleDiceRoll(), 1000);
  }
}

// ---- 菜单回调 ----
ui.mainMenu.onStartGame = (mode: GameMode) => {
  if (mode === GameMode.ONLINE) {
    ui.log.system('在线模式: 需先启动服务器 npm run server');
    state.settings.mode = GameMode.AI_SINGLE;
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
    for (const [, p] of state.players) {
      if (p.bankrupt || p.ownedTiles.size === 0) continue;
      const maint = p.ownedTiles.size * 150;
      if (!p.payAmount(maint)) {
        // 付不起维护费→强制卖地产
        const toSell = [...p.ownedTiles].slice(0, Math.ceil(maint / 300));
        for (const tId of toSell) {
          const t = findTile(tId);
          if (t instanceof PropertyTile) economySys.sellProperty(p, t);
        }
        // 卖完还付不起才破产
        if (!p.payAmount(maint)) {
          p.bankrupt = true;
        }
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
    } else if (tile instanceof TaxTile) {
      tile.onLand(player);
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
