import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 4);

export function createRoomsManager(io, gamesRegistry) {
  const rooms = new Map(); // code -> room

  function listGames() {
    return Object.values(gamesRegistry).map(g => ({
      key: g.key, name: g.name, minPlayers: g.minPlayers, maxPlayers: g.maxPlayers
    }));
  }

  function createRoom({ ownerSocketId, gameKey }) {
    const code = nanoid();
    const game = gamesRegistry[gameKey] || Object.values(gamesRegistry)[0];
    const room = {
      code,
      createdAt: Date.now(),
      ownerSocketId,
      players: [], // {id, name, score}
      gameKey: game.key,
      gameState: game.createInitialState(),
      _notify: () => io.to(code).emit('room:state', getPublicState(code))
    };
    rooms.set(code, room);
    return code;
  }

  function getPublicState(code) {
    const room = rooms.get(code);
    if (!room) return null;
    const game = gamesRegistry[room.gameKey];
    const players = room.players.map(p => ({
      id: p.id, name: p.name, score: p.score || 0
    }));
    const gamePublic = game.public(room);
    return {
      code: room.code,
      gameKey: room.gameKey,
      gameName: game.name,
      hostId: room.ownerSocketId,
      players,
      ...gamePublic
    };
  }

  function addPlayer(code, { id, name }) {
    const room = rooms.get(code);
    if (!room) return { ok: false, reason: 'Room not found' };
    if (room.ownerSocketId === id) {
      return { ok: false, reason: 'Host cannot join as a player' };
    }
    const game = gamesRegistry[room.gameKey];

    if (room.players.find(p => p.id === id)) {
      return { ok: true, player: room.players.find(p => p.id === id) };
    }
    if (room.players.length >= game.maxPlayers) {
      return { ok: false, reason: 'Room full' };
    }

    const player = { id, name: name?.trim() || `Player${room.players.length + 1}`, score: 0 };
    room.players.push(player);
    return { ok: true, player };
  }

  function switchGame(code, gameKey, requesterId) {
    const room = rooms.get(code);
    if (!room || room.ownerSocketId !== requesterId) return;
    const game = gamesRegistry[gameKey] || Object.values(gamesRegistry)[0];
    // Dispose any timers from prior game
    const prevGame = gamesRegistry[room.gameKey];
    prevGame?.onDispose?.(room);

    room.gameKey = game.key;
    room.gameState = game.createInitialState();
  }

  function startGame(code, requesterId) {
    const room = rooms.get(code);
    if (!room || room.ownerSocketId !== requesterId) return;
    const game = gamesRegistry[room.gameKey];
    game.onStart(room);
  }

  function handleGameEvent(code, socketId, type, payload) {
    const room = rooms.get(code);
    if (!room) return;
    const game = gamesRegistry[room.gameKey];
    game.onEvent(room, { socketId, type, payload });
  }

  function handleDisconnect(socketId) {
    const roomsToUpdate = [];
    for (const room of rooms.values()) {
      if (room.ownerSocketId === socketId) {
        // Host left: end and dispose
        const game = gamesRegistry[room.gameKey];
        game?.onDispose?.(room);
        io.to(room.code).emit('room:ended', { reason: 'Host disconnected' });
        rooms.delete(room.code);
        continue;
      }
      const before = room.players.length;
      room.players = room.players.filter(p => p.id !== socketId);
      if (room.players.length !== before) roomsToUpdate.push(room.code);
    }
    return { roomsToUpdate };
  }

  return {
    listGames,
    createRoom,
    addPlayer,
    switchGame,
    startGame,
    handleGameEvent,
    handleDisconnect,
    getPublicState
  };
}
