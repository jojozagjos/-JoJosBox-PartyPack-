import { io } from 'https://cdn.socket.io/4.7.2/socket.io.esm.min.js';
import { makeCtx } from './games/_sdk.js';

// Vite dynamic imports for per-game client modules
const gameModules = import.meta.glob('./games/*/client.js');

const socket = io({ autoConnect: true });
const el = (id) => document.getElementById(id);
const show = (node, on=true) => node.classList[on ? 'remove' : 'add']('hidden');
const escapeHtml = (s='') => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const stateRef = { current: null, myPlayerId: null, mySocketId: null, hostLocked: false };
socket.on('connect', () => { stateRef.mySocketId = socket.id; });

/* Tabs */
const tabPlayer = el('tabPlayer'), tabHost = el('tabHost');
const playerStage = el('playerStage'), hostStage = el('hostStage');

function switchTab(which){
  // Prevent switching back to Player once a room is created (hostLocked)
  if (which === 'player' && stateRef.hostLocked) return;
  if (which === 'player') {
    tabPlayer.classList.add('active'); tabHost.classList.remove('active');
    show(playerStage, true); show(hostStage, false);
  } else {
    tabHost.classList.add('active'); tabPlayer.classList.remove('active');
    show(hostStage, true); show(playerStage, false);
    if (!el('roomCode').textContent) socket.emit('games:list');
  }
}
tabPlayer.onclick = () => switchTab('player');
tabHost.onclick   = () => switchTab('host');
switchTab('player');

/* Player join */
const playerJoinRow = el('playerJoinRow');
const joinBtn = el('joinBtn'), joinCode = el('joinCode'), playerName = el('playerName');
const playerArea = el('playerArea'), playerUI = el('playerUI');
const playerTimer = el('playerTimer'), playerTimerBar = el('playerTimerBar');

joinBtn.onclick = () => {
  const code = (joinCode.value || '').trim().toUpperCase();
  const name = (playerName.value || '').trim();
  socket.emit('player:join', { code, name });
};
socket.on('player:joined', ({ code, playerId }) => {
  stateRef.myPlayerId = playerId;
  show(playerJoinRow, false);
  show(playerArea, true);
});
socket.on('player:joinFailed', ({ reason }) => alert('Join failed: ' + reason));

/* Host picker & live shell */
const hostPre = el('hostPre'), gamePickerHost = el('gamePickerHost'), hostLive = el('hostLive');
const roomCodeEl = el('roomCode'), joinUrlEl = el('joinUrl');
const btnBackToList = el('btnBackToList');

socket.on('games:list:resp', (games) => {
  gamePickerHost.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'list';
  games.forEach(g => {
    const card = document.createElement('button');
    card.className = 'item';
    card.innerHTML = `<div class="big">${escapeHtml(g.name)}</div><div class="desc">${escapeHtml(g.description || '')}</div>
    <div class="muted">Players ${g.minPlayers}–${g.maxPlayers}</div>`;
    card.onclick = () => socket.emit('host:createRoom', { gameKey: g.key });
    grid.appendChild(card);
  });
  gamePickerHost.appendChild(grid);
  show(hostPre, true); show(hostLive, false);

  // Once back to list, allow switching tabs again
  stateRef.hostLocked = false;
  tabPlayer.style.opacity = '';
  tabPlayer.style.pointerEvents = '';
});

socket.on('host:roomCreated', ({ code }) => {
  roomCodeEl.textContent = code;
  joinUrlEl.textContent = `${window.location.origin}`;
  show(hostPre, false); show(hostLive, true);
  switchTab('host');

  // Lock Player tab so host cannot flip back to the player card while hosting
  stateRef.hostLocked = true;
  tabPlayer.style.opacity = '0.45';
  tabPlayer.style.pointerEvents = 'none';
});

socket.on('host:returnedToMenu', () => {
  roomCodeEl.textContent = '';
  show(hostPre, true); show(hostLive, false);
  // Unlock Player tab again
  stateRef.hostLocked = false;
  tabPlayer.style.opacity = '';
  tabPlayer.style.pointerEvents = '';
});

/* Back to game list button — only active in lobby (before game starts) */
btnBackToList?.addEventListener('click', () => {
  const st = stateRef.current;
  if (!st || st.phase !== 'lobby') return;
  socket.emit('host:returnToMenu', { code: st.code });
});

/* Host live controls */
const settingsPanel = el('settingsPanel');
const settingsBody = el('settingsBody');
const settingsToggle = el('settingsToggle');
settingsToggle?.addEventListener('click', () => settingsBody.classList.toggle('hidden'));

const lobbyBlock = el('lobbyBlock'), lobbyPlayers = el('lobbyPlayers');
const hostTimer = el('hostTimer'), hostTimerBar = el('hostTimerBar');
const hostQuestion = el('hostQuestion'), hostFeed = el('hostFeed');

const endOptions = el('endOptions');
const btnSame = el('btnSame'), btnNew = el('btnNew'), btnMenu = el('btnMenu');
btnSame.onclick = () => stateRef.current && socket.emit('game:event', { code: stateRef.current.code, type: 'host:restartSame' });
btnNew.onclick  = () => stateRef.current && socket.emit('game:event', { code: stateRef.current.code, type: 'host:restartNew' });
btnMenu.onclick = () => stateRef.current && socket.emit('host:returnToMenu', { code: stateRef.current.code });

/* Secret brief to criminal */
socket.on('alibi:brief', ({ brief }) => {
  const c = document.createElement('div'); c.className = 'item';
  c.innerHTML = `<strong>Secret brief</strong><br>${escapeHtml(brief)}`;
  playerUI.prepend(c);
});

/* Timers */
let timerInterval = null;
function startTimer(deadline){
  clearInterval(timerInterval);
  if (!deadline) { show(hostTimer,false); show(playerTimer,false); return; }
  show(hostTimer,true); show(playerTimer,true);
  timerInterval = setInterval(() => {
    const remaining = Math.max(0, deadline - Date.now());
    const pct = Math.max(0, Math.min(100, (remaining / 1000 )));
    hostTimerBar.style.transform = `scaleX(${pct/100})`;
    playerTimerBar.style.transform = `scaleX(${pct/100})`;
  }, 100);
}

/* Dynamic game module loader (cached) */
const gameModulesCache = new Map();
async function getGameModule(key) {
  if (gameModulesCache.has(key)) return gameModulesCache.get(key);
  const path = `./games/${key}/client.js`;
  if (gameModules[path]) {
    const mod = await gameModules[path]();
    gameModulesCache.set(key, mod);
    return mod;
  }
  const mod = {
    meta: { key, name: key, description: '' },
    renderHost(){ el('hostQuestion').textContent = `Unknown game: ${key}`; },
    renderPlayer(){ const d=document.createElement('div'); d.className='item'; d.textContent='This game has no client UI yet.'; el('playerUI').appendChild(d); }
  };
  gameModulesCache.set(key, mod);
  return mod;
}

function isHost(){ const st = stateRef.current; return st && st.hostId === stateRef.mySocketId; }
function isVIP(){ const st = stateRef.current; return st && st.vipId === stateRef.myPlayerId; }
const helpers = { el, show, escapeHtml, isHost, isVIP };

function renderSettingsCompact(state) {
  // Only in lobby and only for host
  if (state.phase !== 'lobby' || !isHost()) { show(settingsPanel, false); return; }
  const schema = state.settingsSchema || {};
  const values = state.settings || {};
  const editableEntries = Object.entries(schema).filter(([k, meta]) => meta?.editable);
  if (editableEntries.length === 0) { show(settingsPanel, false); return; }

  settingsBody.innerHTML = '';
  for (const [key, meta] of editableEntries) {
    const wrap = document.createElement('div');
    wrap.className = 'settings-field';
    const label = document.createElement('label');
    label.textContent = meta.label || key;
    const input = document.createElement('input');
    input.type = meta.type || 'number';
    if (typeof values[key] !== 'undefined') input.value = values[key];
    if (Number.isFinite(meta.min)) input.min = meta.min;
    if (Number.isFinite(meta.max)) input.max = meta.max;
    if (Number.isFinite(meta.step)) input.step = meta.step;
    input.setAttribute('data-key', key);
    input.addEventListener('change', () => {
      const payload = {};
      settingsBody.querySelectorAll('input').forEach(inp => {
        payload[inp.getAttribute('data-key')] = Number(inp.value);
      });
      socket.emit('game:event', { code: state.code, type: 'host:updateSettings', payload });
    });
    wrap.appendChild(label); wrap.appendChild(input);
    settingsBody.appendChild(wrap);
  }
  show(settingsPanel, true);
  // collapsed by default to keep header tidy
  settingsBody.classList.add('hidden');
}

socket.on('room:state', async (state) => {
  stateRef.current = state;
  startTimer(state?.phaseDeadline || null);

  // Settings visible only to host
  renderSettingsCompact(state);

  // Delegate to per-game client module
  const mod = state?.gameKey ? await getGameModule(state.gameKey) : null;
  const ctx = makeCtx({ socket, helpers, stateRef });

  // Clear shared regions; game renders into them
  el('hostQuestion').textContent = '';
  el('hostFeed').innerHTML = '';
  el('playerUI').innerHTML = '';

  if (mod?.renderHost) mod.renderHost(ctx, state);
  if (mod?.renderHostSettings && state?.phase === 'lobby') mod.renderHostSettings(ctx, state);
  if (mod?.renderPlayer) mod.renderPlayer(ctx, state);

  // Generic lobby list (applies to all games)
  if (state.phase === 'lobby' || state.phase === 'tutorial') {
    show(lobbyBlock, true);
    lobbyPlayers.innerHTML = '';
    (state.playersInLobby || []).forEach(p => {
      const d = document.createElement('div'); d.className = 'pill2';
      d.textContent = p.name + (p.id === state.vipId ? ' ★VIP' : '');
      lobbyPlayers.appendChild(d);
    });
    // Show the Back button only in lobby (before game starts)
    show(btnBackToList, true);
  } else {
    show(lobbyBlock, false);
    show(btnBackToList, false);
  }

  // End-of-game options visible during done
  show(endOptions, state.phase === 'done');
});

/* Ask for games on entering host tab if not in a room */
socket.on('games:list:resp', () => {}); // handled above
