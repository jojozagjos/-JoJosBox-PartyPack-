import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 4);

export function createRoomsManager(io, gamesRegistry) {
  const rooms = new Map(); // code -> room

  function listGames() {
    return Object.values(gamesRegistry).map(g => ({
      key: g.key,
      name: g.name,
      description: g.description,
      minPlayers: g.minPlayers,
      maxPlayers: g.maxPlayers,
      defaultSettings: g.defaultSettings || {}
    }));
  }

  function createRoom({ ownerSocketId, gameKey }) {
    const code = nanoid();
    const game = gamesRegistry[gameKey] || Object.values(gamesRegistry)[0];
    const room = {
      code,
      createdAt: Date.now(),
      ownerSocketId,            // host socket id (stage screen)
      vipId: null,              // first player to join becomes VIP
      players: [],              // {id, name, score}
      gameKey: game.key,
      gameState: game.createInitialState(),
      _notify: () => io.to(code).emit('room:state', getPublicState(code)),
      _send: (socketId, event, payload) => io.to(socketId).emit(event, payload)
    };
    rooms.set(code, room);
    return code;
  }

  function endRoom(code, reason='Ended') {
    const room = rooms.get(code);
    if (!room) return;
    gamesRegistry[room.gameKey]?.onDispose?.(room);
    io.to(code).emit('room:ended', { reason });
    rooms.delete(code);
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
      vipId: room.vipId,
      players,
      ...gamePublic
    };
  }

  function addPlayer(code, { id, name }) {
    const room = rooms.get(code);
    if (!room) return { ok: false, reason: 'Room not found' };
    if (room.ownerSocketId === id) return { ok: false, reason: 'Host cannot join as a player' };

    const game = gamesRegistry[room.gameKey];
    if (room.players.find(p => p.id === id)) {
      return { ok: true, player: room.players.find(p => p.id === id) };
    }
    if (room.players.length >= game.maxPlayers) {
      return { ok: false, reason: 'Room full' };
    }
    const player = { id, name: name?.trim() || `Player${room.players.length + 1}`, score: 0 };
    room.players.push(player);
    if (!room.vipId) room.vipId = player.id; // first player becomes VIP
    return { ok: true, player };
  }

  function switchGame(code, gameKey, requesterId) {
    const room = rooms.get(code);
    if (!room || room.ownerSocketId !== requesterId) return;
    const next = gamesRegistry[gameKey] || Object.values(gamesRegistry)[0];
    gamesRegistry[room.gameKey]?.onDispose?.(room);
    room.gameKey = next.key;
    room.gameState = next.createInitialState();
  }

  function startGame(code, requesterId) {
    const room = rooms.get(code);
    if (!room) return;
    // Allow host OR VIP to start
    if (room.ownerSocketId !== requesterId && room.vipId !== requesterId) return;
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
        endRoom(room.code, 'Host disconnected');
        continue;
      }
      const before = room.players.length;
      room.players = room.players.filter(p => p.id !== socketId);
      if (room.vipId === socketId) {
        room.vipId = room.players[0]?.id || null; // re-assign VIP if needed
      }
      if (room.players.length !== before) roomsToUpdate.push(room.code);
    }
    return { roomsToUpdate };
  }

  return {
    listGames,
    createRoom,
    endRoom,
    addPlayer,
    switchGame,
    startGame,
    handleGameEvent,
    handleDisconnect,
    getPublicState
  };
}
