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
      defaultSettings: g.defaultSettings || {},
      settingsSchema: g.settingsSchema || {}
    }));
  }

  function createRoom({ ownerSocketId, gameKey }) {
    const code = nanoid();
    const game = gamesRegistry[gameKey] || Object.values(gamesRegistry)[0];
    const room = {
      code,
      createdAt: Date.now(),
      ownerSocketId,            // host socket id (stage screen)
      vipId: null,              // first player to join becomes VIP (socket id for now)
      players: [],              // {id: socketId, name, score, online: true|false}
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
      // expose schema so host UI can render compact settings
      settingsSchema: game.settingsSchema || {},
      ...gamePublic
    };
  }

  function addPlayer(code, { id, name }) {
    const room = rooms.get(code);
    if (!room) return { ok: false, reason: 'Room not found' };
    if (room.ownerSocketId === id) return { ok: false, reason: 'Host cannot join as a player' };

    const game = gamesRegistry[room.gameKey];

    // RECONNECT: If a player with same name exists but is offline, reclaim that seat
    const existingByName = name ? room.players.find(p => (p.name || '').toLowerCase() === name.trim().toLowerCase()) : null;
    if (existingByName && existingByName.online === false) {
      const oldId = existingByName.id;
      existingByName.id = id;
      existingByName.online = true;
      // If that seat was VIP, move VIP to the new socket id
      if (room.vipId === oldId) room.vipId = id;
      return { ok: true, player: existingByName, reconnected: true };
    }

    // Normal join: block if full
    const onlineCount = room.players.filter(p => p.online !== false).length;
    if (onlineCount >= game.maxPlayers) {
      return { ok: false, reason: 'Room full' };
    }

    // If someone with the same name is already online, we still allow a *new* seat
    // (you can add stricter checks later if you want to prevent duplicate names)
    const player = { id, name: name?.trim() || `Player${room.players.length + 1}`, score: 0, online: true };
    room.players.push(player);
    if (!room.vipId) room.vipId = player.id; // first online player becomes VIP
    return { ok: true, player, reconnected: false };
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
      const player = room.players.find(p => p.id === socketId);
      if (player) {
        // Mark offline but keep their seat for reconnection
        player.online = false;
        // Do NOT clear VIP; keep VIP tied to the old id until they reconnect.
        roomsToUpdate.push(room.code);
      }
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
