import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRoomsManager } from './rooms.js';
import { gamesRegistry } from './games/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*'
  }
});

const rooms = createRoomsManager(io, gamesRegistry);

// Serve the Vite-built client in production.
const clientDist = path.join(__dirname, '..', 'dist');
app.use(express.static(clientDist));
app.get('/health', (_, res) => res.send('OK'));
app.use((req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

io.on('connection', (socket) => {
  // Identify role on connect
  socket.on('host:createRoom', ({ gameKey }) => {
    const code = rooms.createRoom({ ownerSocketId: socket.id, gameKey });
    socket.join(code);
    socket.emit('host:roomCreated', { code, games: rooms.listGames() });
    io.to(code).emit('room:state', rooms.getPublicState(code));
  });

  socket.on('host:switchGame', ({ code, gameKey }) => {
    rooms.switchGame(code, gameKey, socket.id);
    io.to(code).emit('room:state', rooms.getPublicState(code));
  });

  socket.on('player:join', ({ code, name }) => {
    const { ok, reason, player } = rooms.addPlayer(code, { id: socket.id, name });
    if (!ok) {
      socket.emit('player:joinFailed', { reason });
      return;
    }
    socket.join(code);
    socket.emit('player:joined', { code, playerId: player.id });
    io.to(code).emit('room:state', rooms.getPublicState(code));
  });

  socket.on('host:startGame', ({ code }) => {
    rooms.startGame(code, socket.id);
    io.to(code).emit('room:state', rooms.getPublicState(code));
  });

  // Game event passthrough
  socket.on('game:event', ({ code, type, payload }) => {
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
