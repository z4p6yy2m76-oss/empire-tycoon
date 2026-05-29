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
        session.setReady(playerId);
        // Notify all that this player is ready
        session.relayAction(playerId, {
          ...msg,
          type: MessageType.PLAYER_READY,
        });
      }
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
    case MessageType.DICE_RESULT:
    case MessageType.PLAYER_MOVE:
    case MessageType.MOVE_PATH:
    case MessageType.BUY_PROPERTY:
    case MessageType.UPGRADE_PROPERTY:
    case MessageType.AUCTION_BID:
    case MessageType.STOCK_TRADE:
    case MessageType.USE_CARD:
    case MessageType.END_TURN:
    case MessageType.PAY_BAIL:
    case MessageType.STATE_SYNC: {
      const session = rooms.getRoom(roomCode);
      if (session) {
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
