import { io } from 'https://cdn.socket.io/4.7.2/socket.io.esm.min.js';
import { makeCtx } from './games/_sdk.js';
import { AudioManager } from './audio.js';

// Viewport sizing to eliminate stray scroll
function setVhVar(){ const vh = window.innerHeight * 0.01; document.documentElement.style.setProperty('--vh', `${vh}px`); }
setVhVar(); window.addEventListener('resize', setVhVar); window.addEventListener('orientationchange', setVhVar);

// Per-game client modules
const gameModules = import.meta.glob('./games/*/client.js');

const socket = io({ autoConnect: true });
const el = (id) => document.getElementById(id);
const show = (node, on=true) => node.classList[on ? 'remove' : 'add']('hidden');
const escapeHtml = (s='') => s?.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) ?? '';

const stateRef = { current: null, myPlayerId: null, mySocketId: null, hostLocked: false, playerLocked: false };
socket.on('connect', () => { stateRef.mySocketId = socket.id; });

/* Tabs */
const tabPlayer = el('tabPlayer'), tabHost = el('tabHost');
const playerStage = el('playerStage'), hostStage = el('hostStage');

function switchTab(which){
  if (which === 'host' && stateRef.playerLocked) return;
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
tabHost.onclick = () => {
  if (stateRef.hostLocked) {
    const st = stateRef.current; if (st?.code) socket.emit('host:returnToMenu', { code: st.code });
    return;
  }
  switchTab('host');
};
switchTab('player');

/* Player join + reconnect */
const LS_JOIN = 'jojos:lastJoin';
const playerJoinRow = el('playerJoinRow');
const joinBtn = el('joinBtn'), joinCode = el('joinCode'), playerName = el('playerName');
const playerArea = el('playerArea'), playerUI = el('playerUI');
const playerTimer = el('playerTimer'), playerTimerBar = el('playerTimerBar');

function saveJoinInfo(code, name){ try{ localStorage.setItem(LS_JOIN, JSON.stringify({ code, name })); }catch{} }
function loadJoinInfo(){ try{ return JSON.parse(localStorage.getItem(LS_JOIN) || 'null'); }catch{ return null; } }

const last = loadJoinInfo();
if (last?.code) joinCode.value = last.code;
if (last?.name) playerName.value = last.name;
if (last?.code && last?.name) socket.emit('player:join', { code: last.code, name: last.name });

joinBtn.onclick = () => {
  const code = (joinCode.value || '').trim().toUpperCase();
  const name = (playerName.value || '').trim();
  saveJoinInfo(code, name);
  socket.emit('player:join', { code, name });
};
socket.on('player:joined', ({ playerId }) => {
  stateRef.myPlayerId = playerId;
  show(playerJoinRow, false);
  show(playerArea, true);
  // Lock Host tab for players once joined
  stateRef.playerLocked = true;
  tabHost.style.opacity = '0.45';
  tabHost.style.pointerEvents = 'none';
});
socket.on('player:joinFailed', ({ reason }) => alert('Join failed: ' + reason));

/* Host picker & live shell */
const hostPre = el('hostPre'), gamePickerHost = el('gamePickerHost'), hostLive = el('hostLive');
const roomCodeEl = el('roomCode'), joinUrlEl = el('joinUrl');
const audioToggle = el('audioToggle'); // new button

const LS_AUDIO = 'jojos:audioEnabled';
function syncAudioButton(){
  audioToggle.textContent = AudioManager.isEnabled() ? 'Mute' : 'Enable sound';
}

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

  // Reset host lock and tab label
  stateRef.hostLocked = false;
  tabHost.textContent = 'Host';
  tabPlayer.style.opacity = '';
  tabPlayer.style.pointerEvents = '';

  // Hide audio toggle when not in a room
  if (audioToggle) audioToggle.style.display = 'none';
});

socket.on('host:roomCreated', ({ code }) => {
  roomCodeEl.textContent = code;
  joinUrlEl.textContent = `${window.location.origin}`;
  show(hostPre, false); show(hostLive, true);
  switchTab('host');

  // Lock Player tab & change Host tab label to Back
  stateRef.hostLocked = true;
  tabHost.textContent = 'Back';
  tabPlayer.style.opacity = '0.45';
  tabPlayer.style.pointerEvents = 'none';

  // Show audio toggle for host; restore last state and unlock on first click
  if (audioToggle) {
    audioToggle.style.display = '';
    const remembered = (localStorage.getItem(LS_AUDIO) || 'off') === 'on';
    AudioManager.setEnabled(remembered);
    syncAudioButton();
    // First interaction also unlocks autoplay restrictions
    audioToggle.onclick = async () => {
      await AudioManager.unlockWithGesture();
      const next = !AudioManager.isEnabled();
      AudioManager.setEnabled(next);
      localStorage.setItem(LS_AUDIO, next ? 'on' : 'off');
      syncAudioButton();
    };
  }
});

socket.on('host:returnedToMenu', () => {
  roomCodeEl.textContent = '';
  show(hostPre, true); show(hostLive, false);

  stateRef.hostLocked = false;
  tabHost.textContent = 'Host';
  tabPlayer.style.opacity = '';
  tabPlayer.style.pointerEvents = '';

  if (audioToggle) audioToggle.style.display = 'none';
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
  const total = Math.max(1, deadline - Date.now());
  timerInterval = setInterval(() => {
    const remaining = Math.max(0, deadline - Date.now());
    const pct = Math.max(0, Math.min(1, remaining / total));
    hostTimerBar.style.transform = `scaleX(${pct})`;
    playerTimerBar.style.transform = `scaleX(${pct})`;
  }, 100);
}

/* Dynamic game module loader */
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
const helpers = { el, show, escapeHtml, isHost, isVIP, AudioManager };

/* Settings (already implemented earlier, kept minimal here) */
function renderSettingsCompact(state) {
  if (state.phase !== 'lobby' || !isHost()) { show(settingsPanel, false); return; }
  const schema = state.settingsSchema || {};
  const values = state.settings || {};
  const editableEntries = Object.entries(schema).filter(([_, meta]) => meta?.editable);
  if (editableEntries.length === 0) { show(settingsPanel, false); return; }

  settingsBody.innerHTML = '';
  editableEntries.forEach(([key, meta]) => {
    const wrap = document.createElement('div'); wrap.className = 'settings-field';
    const label = document.createElement('label');
    const unit = ' (s)';
    label.textContent = (meta.label || key) + unit;

    const input = document.createElement('input');
    input.type = 'number';
    const valMs = values[key];
    if (typeof valMs !== 'undefined') input.value = Math.round(Number(valMs)/1000) || 0;

    const minS = Number.isFinite(meta.min) ? Math.round(meta.min/1000) : 3;
    const maxS = Number.isFinite(meta.max) ? Math.round(meta.max/1000) : 180;
    const stepS = Number.isFinite(meta.step) ? Math.max(1, Math.round(meta.step/1000)) : 1;
    input.min = String(minS); input.max = String(maxS); input.step = String(stepS);

    input.setAttribute('data-key', key);
    input.addEventListener('change', () => {
      const payload = {};
      settingsBody.querySelectorAll('input').forEach(inp => {
        const k = inp.getAttribute('data-key');
        const sec = Math.max(minS, Math.min(maxS, Number(inp.value)||0));
        payload[k] = sec * 1000; // send ms
      });
      socket.emit('game:event', { code: state.code, type: 'host:updateSettings', payload });
    });
    wrap.appendChild(label); wrap.appendChild(input);
    settingsBody.appendChild(wrap);
  });
  show(settingsPanel, true);
  settingsBody.classList.add('hidden');
}

/* Render loop per room state */
socket.on('room:state', async (state) => {
  stateRef.current = state;
  startTimer(state?.phaseDeadline || null);

  // Host tab label
  tabHost.textContent = state.code ? (stateRef.hostLocked ? 'Back' : 'Host') : 'Host';

  renderSettingsCompact(state);

  const mod = state?.gameKey ? await getGameModule(state.gameKey) : null;
  const ctx = makeCtx({ socket, helpers, stateRef });

  el('hostQuestion').textContent = '';
  el('hostFeed').innerHTML = '';
  el('playerUI').innerHTML = '';

  if (mod?.renderHost) mod.renderHost(ctx, state);
  if (mod?.renderHostSettings && state?.phase === 'lobby') mod.renderHostSettings(ctx, state);
  if (mod?.renderPlayer) mod.renderPlayer(ctx, state);

  if (state.phase === 'lobby' || state.phase === 'tutorial') {
    show(lobbyBlock, true);
    lobbyPlayers.innerHTML = '';
    (state.playersInLobby || []).forEach(p => {
      const d = document.createElement('div'); d.className = 'pill2';
      d.textContent = p.name + (p.id === state.vipId ? ' ★VIP' : '');
      if (p.id === state.vipId) d.classList.add('vip');
      lobbyPlayers.appendChild(d);
    });
    if (audioToggle && isHost()) audioToggle.style.display = ''; // visible during lobby for host
  } else {
    show(lobbyBlock, false);
  }

  show(endOptions, state.phase === 'done');
});

/* Keep picker noop listener to satisfy previous wiring */
socket.on('games:list:resp', () => {});
