import { io } from 'https://cdn.socket.io/4.7.2/socket.io.esm.min.js';
import { makeCtx } from './games/_sdk.js';

// Dynamically discover game client modules (Vite feature)
const gameModules = import.meta.glob('./games/*/client.js');

const socket = io({ autoConnect: true });
const el = (id) => document.getElementById(id);
const show = (node, on=true) => node.classList[on ? 'remove' : 'add']('hidden');
const escapeHtml = (s='') => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const stateRef = { current: null, myPlayerId: null, mySocketId: null };
socket.on('connect', () => { stateRef.mySocketId = socket.id; });

/* Tabs */
const tabPlayer = el('tabPlayer'), tabHost = el('tabHost');
const playerStage = el('playerStage'), hostStage = el('hostStage');
function switchTab(which){
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

/* Host pre-live picker & live screen */
const hostPre = el('hostPre'), gamePickerHost = el('gamePickerHost'), hostLive = el('hostLive');
const roomCodeEl = el('roomCode'), joinUrlEl = el('joinUrl');

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
});

socket.on('host:roomCreated', ({ code }) => {
  roomCodeEl.textContent = code;
  joinUrlEl.textContent = `${window.location.origin}`;
  show(hostPre, false); show(hostLive, true);
  switchTab('host');
});

socket.on('host:returnedToMenu', () => {
  roomCodeEl.textContent = '';
  show(hostPre, true); show(hostLive, false);
});

/* Host live controls shared across games */
const settingsPanel = el('settingsPanel');
const s_inputs = {
  tutorialMs: el('s_tutorialMs'),
  briefMs: el('s_briefMs'),
  alibiMs: el('s_alibiMs'),
  interrogateMs: el('s_interrogateMs'),
  voteMs: el('s_voteMs'),
  revealMs: el('s_revealMs')
};
for (const k of Object.keys(s_inputs)) {
  s_inputs[k].addEventListener('change', () => {
    const st = stateRef.current; if (!st) return;
    const payload = {};
    for (const kk of Object.keys(s_inputs)) payload[kk] = Number(s_inputs[kk].value);
    socket.emit('game:event', { code: st.code, type: 'host:updateSettings', payload });
  });
}

const lobbyBlock = el('lobbyBlock'), lobbyPlayers = el('lobbyPlayers');
const hostTimer = el('hostTimer'), hostTimerBar = el('hostTimerBar');
const hostQuestion = el('hostQuestion'), hostFeed = el('hostFeed');
const endOptions = el('endOptions');
const btnSame = el('btnSame'), btnNew = el('btnNew'), btnMenu = el('btnMenu');
btnSame.onclick = () => stateRef.current && socket.emit('game:event', { code: stateRef.current.code, type: 'host:restartSame' });
btnNew.onclick  = () => stateRef.current && socket.emit('game:event', { code: stateRef.current.code, type: 'host:restartNew' });
btnMenu.onclick = () => stateRef.current && socket.emit('host:returnToMenu', { code: stateRef.current.code });

/* Secret brief to criminal */
socket.on('alibi:brief', ({ brief, crime }) => {
  const c = document.createElement('div');
  c.className = 'item';
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

/* Dynamic game loader: cache loaded modules by key */
const loadedGames = new Map();
async function getGameModule(key) {
  if (loadedGames.has(key)) return loadedGames.get(key);
  // look for ./games/<key>/client.js
  const path = `./games/${key}/client.js`;
  if (gameModules[path]) {
    const mod = await gameModules[path]();
    loadedGames.set(key, mod);
    return mod;
  }
  // Fallback: empty renderer
  const mod = {
    meta: { key, name: key, description: '' },
    renderHost(){ el('hostQuestion').textContent = `Unknown game: ${key}`; },
    renderPlayer(){ const d=document.createElement('div'); d.className='item'; d.textContent='This game has no client UI yet.'; el('playerUI').appendChild(d); }
  };
  loadedGames.set(key, mod);
  return mod;
}

function isHost(){ const st = stateRef.current; return st && st.hostId === stateRef.mySocketId; }
function isVIP(){ const st = stateRef.current; return st && st.vipId === stateRef.myPlayerId; }

const helpers = { el, show, escapeHtml, isHost, isVIP };

socket.on('room:state', async (state) => {
  stateRef.current = state;
  startTimer(state?.phaseDeadline || null);

  // Bind settings values in lobby (generic numeric inputs)
  if (state?.phase === 'lobby' && state?.settings) {
    show(settingsPanel, true);
    for (const [k, input] of Object.entries(s_inputs)) {
      if (state.settings[k] != null) input.value = state.settings[k];
    }
  } else {
    show(settingsPanel, false);
  }

  // Delegate rendering to current game module
  const mod = state?.gameKey ? await getGameModule(state.gameKey) : null;
  const ctx = makeCtx({ socket, helpers, stateRef });

  // Shared areas are cleared here; game renders into them
  el('hostQuestion').textContent = '';
  el('hostFeed').innerHTML = '';
  el('playerUI').innerHTML = '';

  if (mod?.renderHost) mod.renderHost(ctx, state);
  if (mod?.renderHostSettings && state?.phase === 'lobby') mod.renderHostSettings(ctx, state);
  if (mod?.renderPlayer) mod.renderPlayer(ctx, state);
});
