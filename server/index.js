import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import compression from 'compression';
import helmet from 'helmet';
import { createRoomsManager } from './rooms.js';
import { gamesRegistry } from './games/index.js';
import { allow } from './utils/ratelimit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

const app = express();
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(compression());

// Static assets with caching
const clientDist = path.join(__dirname, '..', 'dist');
app.use((req, res, next) => {
  if (/\.(js|css|png|jpg|svg|woff2)$/.test(req.url)) {
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  }
  next();
});
app.use(express.static(clientDist));
app.get('/health', (_, res) => res.send('OK'));
app.get('*', (req, res) => {
  try { res.sendFile(path.join(clientDist, 'index.html')); }
  catch { res.status(200).send('Dev mode. Run `npm run dev` to start client.'); }
});

const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: '*' } });
// NOTE for horizontal scaling: plug a Redis adapter here (socket.io-redis) and enable sticky sessions on your load balancer.

const rooms = createRoomsManager(io, gamesRegistry);

io.on('connection', (socket) => {
  socket.on('games:list', () => {
    socket.emit('games:list:resp', Object.values(gamesRegistry).map(g => ({
      key: g.key, name: g.name, description: g.description,
      minPlayers: g.minPlayers, maxPlayers: g.maxPlayers,
      defaultSettings: g.defaultSettings || {}, settingsSchema: g.settingsSchema || {}
    })));
  });

  socket.on('host:createRoom', ({ gameKey }) => {
    const code = rooms.createRoom({ ownerSocketId: socket.id, gameKey });
    socket.join(code);
    socket.emit('host:roomCreated', { code });
    io.to(code).emit('room:state', rooms.getPublicState(code));
  });

  socket.on('host:returnToMenu', ({ code }) => {
    rooms.endRoom(code, 'Returning to menu');
    socket.emit('host:returnedToMenu', {});
  });

  socket.on('host:switchGame', ({ code, gameKey }) => {
    rooms.switchGame(code, gameKey, socket.id);
    io.to(code).emit('room:state', rooms.getPublicState(code));
  });

  socket.on('host:lockRoom', ({ code, on }) => {
    rooms.lockRoom(code, socket.id, !!on);
  });
  socket.on('host:hideCode', ({ code, on }) => {
    rooms.toggleHideCode(code, socket.id, !!on);
  });
  socket.on('host:kick', ({ code, playerId }) => {
    rooms.kickPlayer(code, socket.id, playerId);
  });

  socket.on('player:join', ({ code, name, reconnectToken }) => {
    const { ok, reason, player, reconnected } = rooms.addPlayer(code, { id: socket.id, name, reconnectToken });
    if (!ok) return socket.emit('player:joinFailed', { reason });
    socket.join(code);
    socket.emit('player:joined', { code, playerId: player.id, reconnectToken: player.reconnectToken, reconnected: !!reconnected });
    io.to(code).emit('room:state', rooms.getPublicState(code));
  });

  socket.on('host:startGame', ({ code }) => {
    rooms.startGame(code, socket.id);
    io.to(code).emit('room:state', rooms.getPublicState(code));
  });

  socket.on('game:event', ({ code, type, payload }) => {
    // rate limit spammy event types
    const rlTypes = new Set([
      'alibi:submit','interrogate:submit','vote:submit',
      'host:updateSettings','vip:start','vip:skipTutorial'
    ]);
    if (rlTypes.has(type) && !allow(socket.id, type, { limit: 6, perMs: 10_000 })) {
      return; // silently drop
    }
    rooms.handleGameEvent(code, socket.id, type, payload);
    io.to(code).emit('room:state', rooms.getPublicState(code));
  });

  socket.on('disconnect', () => {
    const updates = rooms.handleDisconnect(socket.id);
    for (const code of updates.roomsToUpdate) {
      io.to(code).emit('room:state', rooms.getPublicState(code));
    }
  });
});

server.listen(PORT, () => {
  console.log(`JoJos Partypack running on http://localhost:${PORT}`);
});
