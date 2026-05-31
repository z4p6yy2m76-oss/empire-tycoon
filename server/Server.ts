// ============================================================
// Server.ts — WebSocket 游戏服务器
// 入口：npx tsx server/Server.ts
// 监听 3001 端口，管理房间和消息路由
// ============================================================

import { WebSocket, WebSocketServer } from 'ws';
import { RoomManager } from './RoomManager';
import { MessageType, type NetworkMessage, deserializeMessage } from '../src/network/NetworkProtocol';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });
const rooms = new RoomManager();

console.log(`[Empire Tycoon Server] 已启动，端口: ${PORT}`);

wss.on('connection', (ws: WebSocket) => {
  let playerId = '';
  let roomCode = '';

  ws.on('message', (raw: Buffer) => {
    const msgStr = raw.toString();
    const msg = deserializeMessage(msgStr);
    if (!msg) return;

    playerId = msg.playerId ?? playerId;
    roomCode = msg.roomCode ?? roomCode;

    handleMessage(ws, msg, playerId, roomCode);
  });

  ws.on('close', () => {
    if (roomCode) {
      const session = rooms.getRoom(roomCode);
      if (session) {
        session.handleDisconnect(playerId);
      }
    }
  });

  ws.on('error', (err: Error) => {
    console.error(`[WS Error] ${playerId}: ${err.message}`);
  });
});

function handleMessage(
  ws: WebSocket,
  msg: NetworkMessage,
  playerId: string,
  roomCode: string,
): void {
  switch (msg.type) {

    case MessageType.CREATE_ROOM: {
      const { roomCode: newCode, session } = rooms.createRoom();
      const colors = ['#E74C3C', '#3498DB', '#2ECC71', '#F39C12'];
      session.addPlayer(playerId || 'host', msg.playerName ?? '房主', ws, colors[0]);
      ws.send(JSON.stringify({
        type: MessageType.ROOM_INFO,
        roomCode: newCode,
        playerId: playerId || 'host',
        timestamp: Date.now(),
        payload: { roomCode: newCode, playerCount: 1 },
      }));
      console.log(`[Room] 创建房间: ${newCode}`);
      break;
    }

    case MessageType.JOIN_ROOM: {
      const joinCode = msg.roomCode ?? roomCode;
      if (!joinCode) {
        ws.send(JSON.stringify({
          type: MessageType.ROOM_ERROR,
          timestamp: Date.now(),
          payload: { error: '缺少房间码' },
        }));
        return;
      }

      const result = rooms.joinRoom(
        joinCode,
        playerId || `player_${Date.now()}`,
        msg.playerName ?? '玩家',
        ws,
      );

      if (!result.success) {
        ws.send(JSON.stringify({
          type: MessageType.ROOM_ERROR,
          timestamp: Date.now(),
          payload: { error: result.message },
        }));
        return;
      }

      console.log(`[Room] ${msg.playerName} 加入房间 ${joinCode}`);
      break;
    }

    case MessageType.PLAYER_READY: {
      const session = rooms.getRoom(roomCode);
      if (session) {
        // setReady 内部已广播 ROOM_INFO 同步玩家列表（含准备状态）
        session.setReady(playerId);
      }
      break;
    }

    // ===== 房主强制开局（不等所有人准备） =====
    case MessageType.START_GAME: {
      console.log('[START_GAME] ===== 服务端收到强制开局请求 =====');
      console.log('[START_GAME] playerId:', playerId);
      console.log('[START_GAME] roomCode:', roomCode);

      const session = rooms.getRoom(roomCode);
      console.log('[START_GAME] 房间存在:', !!session);

      if (!session) {
        console.log('[START_GAME] 失败: 房间不存在');
        ws.send(JSON.stringify({
          type: MessageType.ROOM_ERROR,
          timestamp: Date.now(),
          payload: { error: '房间不存在，请检查房间码' },
        }));
        break;
      }

      // 验证发送者是房主
      const hostId = session.getHostId();
      console.log('[START_GAME] 发送者:', playerId, '房主:', hostId, '匹配:', playerId === hostId);

      if (playerId !== hostId) {
        console.log('[START_GAME] 失败: 不是房主');
        ws.send(JSON.stringify({
          type: MessageType.ROOM_ERROR,
          timestamp: Date.now(),
          payload: { error: '只有房主可以开始游戏' },
        }));
        break;
      }

      // 至少2人
      const playerCount = session.getPlayerCount();
      console.log('[START_GAME] 玩家人数:', playerCount, '>=2:', playerCount >= 2);

      if (playerCount < 2) {
        console.log('[START_GAME] 失败: 人数不足');
        ws.send(JSON.stringify({
          type: MessageType.ROOM_ERROR,
          timestamp: Date.now(),
          payload: { error: '至少需要2名玩家才能开始' },
        }));
        break;
      }

      // 强制开局
      console.log('[START_GAME] 所有验证通过，正在调用 startGame()...');
      console.log('[START_GAME] gameStarted 之前:', session.gameStarted);
      session.startGame();
      console.log('[START_GAME] gameStarted 之后:', session.gameStarted);
      console.log(`[Room] 房主强制开局: ${roomCode}`);
      break;
    }

    case MessageType.LEAVE_ROOM: {
      const session = rooms.getRoom(roomCode);
      if (session) {
        session.removePlayer(playerId);
        if (session.isEmpty()) {
          rooms.destroyRoom(roomCode);
          console.log(`[Room] 销毁房间: ${roomCode}`);
        }
      }
      break;
    }

    // 游戏操作：广播给其他玩家
    // END_TURN：切换回合归属 + 广播给其他玩家
    case MessageType.END_TURN: {
      const session = rooms.getRoom(roomCode);
      if (session) {
        const validation = session.validateAction(playerId, msg.type);
        if (!validation.valid) {
          console.log('[Server relay] END_TURN 验证失败:', playerId, '原因:', validation.reason);
          ws.send(JSON.stringify({ type: MessageType.ROOM_ERROR, timestamp: Date.now(), payload: { error: validation.reason } }));
          break;
        }
        // 更新服务端回合归属到下一人
        const nextId = (msg.payload as any)?.nextPlayerId;
        if (nextId) {
          const idx = session.playerOrder.indexOf(nextId);
          if (idx >= 0) session.currentPlayerIndex = idx;
          console.log('[Server] 回合切换 -> player:', nextId, 'index:', idx);
        }
        console.log('[Server relay] END_TURN from:', playerId, 'relayed');
        session.relayAction(playerId, msg);
      }
      break;
    }

    case MessageType.DICE_RESULT:
    case MessageType.PLAYER_MOVE:
    case MessageType.MOVE_PATH:
    case MessageType.BUY_PROPERTY:
    case MessageType.UPGRADE_PROPERTY:
    case MessageType.AUCTION_BID:
    case MessageType.STOCK_TRADE:
    case MessageType.USE_CARD:
    case MessageType.PAY_BAIL:
    case MessageType.STATE_SYNC: {
      const session = rooms.getRoom(roomCode);
      if (session) {
        // 校验回合归属：只允许当前回合的玩家发送操作
        const validation = session.validateAction(playerId, msg.type);
        if (!validation.valid) {
          console.log('[Server relay] 回合验证失败:', msg.type, '发送者:', playerId, '原因:', validation.reason);
          ws.send(JSON.stringify({
            type: MessageType.ROOM_ERROR,
            timestamp: Date.now(),
            payload: { error: validation.reason },
          }));
          break;
        }
        console.log('[Server relay] 中继消息:', msg.type, 'from:', playerId, 'to其他人');
        session.relayAction(playerId, msg);
      }
      break;
    }

    case MessageType.PING: {
      ws.send(JSON.stringify({ type: MessageType.PONG, timestamp: Date.now() }));
      break;
    }

    default:
      console.log(`[Server] 未处理的消息类型: ${msg.type}`);
  }
}

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n[Server] 正在关闭...');
  rooms.shutdown();
  wss.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  rooms.shutdown();
  wss.close();
  process.exit(0);
});

// 获取本机局域网 IP
const os = require('os');
const interfaces = os.networkInterfaces();
let localIP = 'localhost';
for (const name of Object.keys(interfaces)) {
  for (const iface of interfaces[name] || []) {
    if (iface.family === 'IPv4' && !iface.internal) {
      localIP = iface.address;
      break;
    }
  }
  if (localIP !== 'localhost') break;
}

console.log(`[Server] WebSocket 服务运行在 ws://localhost:${PORT}`);
console.log(`[Server] 局域网地址: ws://${localIP}:${PORT}`);
console.log('[Server] 按 Ctrl+C 退出');
