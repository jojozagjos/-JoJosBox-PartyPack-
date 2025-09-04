import { customAlphabet } from 'nanoid';
import crypto from 'crypto';
import { sanitizeName, sanitizeText } from './utils/moderation.js';

const nanoid = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 4);
const ROOM_TTL_MS = 30 * 60 * 1000; // 30 min idle cleanup

export function createRoomsManager(io, gamesRegistry) {
  const rooms = new Map(); // code -> room

  function listGames() {
    return Object.values(gamesRegistry).map(g => ({
      key: g.key, name: g.name, description: g.description,
      minPlayers: g.minPlayers, maxPlayers: g.maxPlayers,
      defaultSettings: g.defaultSettings || {}, settingsSchema: g.settingsSchema || {}
    }));
  }

  function createRoom({ ownerSocketId, gameKey }) {
    const code = nanoid();
    const game = gamesRegistry[gameKey] || Object.values(gamesRegistry)[0];
    const now = Date.now();
    const room = {
      code,
      createdAt: now,
      touchedAt: now,
      ownerSocketId,
      vipId: null,
      players: [],         // {id, name, score, online, reconnectToken}
      gameKey: game.key,
      gameState: game.createInitialState(),
      _timeout: null,
      _notify: () => { room.touchedAt = Date.now(); io.to(code).emit('room:state', getPublicState(code)); },
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
    clearTimeout(room._timeout);
    rooms.delete(code);
  }

  function getPublicState(code) {
    const room = rooms.get(code);
    if (!room) return null;
    const game = gamesRegistry[room.gameKey];
    const players = room.players.map(p => ({
      id: p.id, name: p.name, score: p.score || 0, online: p.online !== false
    }));
    const gamePublic = game.public(room) || {};
    // Ensure playersInLobby is always present so clients never miss it
    if (!Array.isArray(gamePublic.playersInLobby)) {
      gamePublic.playersInLobby = players;
    }
    return {
      code: room.code,
      gameKey: room.gameKey,
      gameName: game.name,
      hostId: room.ownerSocketId,
      vipId: room.vipId,
      players,                 // generic list for client UIs
      settingsSchema: game.settingsSchema || {},
      ...gamePublic
    };
  }

  function addPlayer(code, { id, name, reconnectToken }) {
    const room = rooms.get(code);
    if (!room) return { ok: false, reason: 'Room not found' };
    room.touchedAt = Date.now();
    if (room.ownerSocketId === id) return { ok: false, reason: 'Host cannot join' };

    // reconnect by token first
    if (reconnectToken) {
      const byToken = room.players.find(p => p.reconnectToken === reconnectToken);
      if (byToken) {
        const oldId = byToken.id;
        byToken.id = id; byToken.online = true;
        if (room.vipId === oldId) room.vipId = id;
        return { ok: true, player: byToken, reconnected: true };
      }
    }
    // name-based reconnect fallback
    const cleanedName = sanitizeName(name);
    const byName = room.players.find(p => (p.name || '').toLowerCase() === cleanedName.toLowerCase() && p.online === false);
    if (byName) {
      const oldId = byName.id;
      byName.id = id; byName.online = true;
      if (room.vipId === oldId) room.vipId = id;
      return { ok: true, player: byName, reconnected: true };
    }

    // normal join
    const game = gamesRegistry[room.gameKey];
    const onlineCount = room.players.filter(p => p.online !== false).length;
    if (onlineCount >= game.maxPlayers) return { ok: false, reason: 'Room full' };

    const player = {
      id, name: cleanedName, score: 0, online: true,
      reconnectToken: crypto.randomUUID()
    };
    room.players.push(player);
    if (!room.vipId) room.vipId = player.id;
    return { ok: true, player, reconnected: false };
  }

  function kickPlayer(code, requesterId, targetId) {
    const room = rooms.get(code); if (!room) return;
    if (room.ownerSocketId !== requesterId && room.vipId !== requesterId) return;
    const idx = room.players.findIndex(p => p.id === targetId);
    if (idx >= 0) {
      const [p] = room.players.splice(idx,1);
      io.to(p.id).emit('player:kicked', { code });
      io.sockets.sockets.get(p.id)?.leave(code);
      room._notify();
    }
  }

  function switchGame(code, gameKey, requesterId) {
    const room = rooms.get(code); if (!room || room.ownerSocketId !== requesterId) return;
    gamesRegistry[room.gameKey]?.onDispose?.(room);
    const next = gamesRegistry[gameKey] || Object.values(gamesRegistry)[0];
    room.gameKey = next.key;
    room.gameState = next.createInitialState();
    room._notify();
  }

  function startGame(code, requesterId) {
    const room = rooms.get(code); if (!room) return;
    if (room.ownerSocketId !== requesterId && room.vipId !== requesterId) return;
    gamesRegistry[room.gameKey].onStart(room);
  }

  function handleGameEvent(code, socketId, type, payload) {
    const room = rooms.get(code); if (!room) return;
    room.touchedAt = Date.now();
    const game = gamesRegistry[room.gameKey];
    if (payload?.text) payload.text = sanitizeText(payload.text);
    game.onEvent(room, { socketId, type, payload });
  }

  function handleDisconnect(socketId) {
    const roomsToUpdate = [];
    for (const room of rooms.values()) {
      if (room.ownerSocketId === socketId) { continue; }
      const player = room.players.find(p => p.id === socketId);
      if (player) { player.online = false; roomsToUpdate.push(room.code); }
    }
    return { roomsToUpdate };
  }

  // idle cleanup loop
  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms.entries()) {
      const activeOnline = room.players.some(p => p.online) || room.ownerSocketId;
      if (!activeOnline) {
        if (now - room.touchedAt > ROOM_TTL_MS) endRoom(code, 'Idle timeout');
      }
    }
  }, 60_000);

  return {
    listGames, createRoom, endRoom, addPlayer, kickPlayer,
    switchGame, startGame, handleGameEvent, handleDisconnect, getPublicState
  };
}
