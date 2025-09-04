import { io } from 'https://cdn.socket.io/4.7.2/socket.io.esm.min.js';
import { makeCtx } from './games/_sdk.js';

// viewport fix
function setVhVar(){ const vh = window.innerHeight * 0.01; document.documentElement.style.setProperty('--vh', `${vh}px`); }
setVhVar(); window.addEventListener('resize', setVhVar); window.addEventListener('orientationchange', setVhVar);

const gameModules = import.meta.glob('./games/*/client.js');
const socket = io({ autoConnect: true });
const el = (id) => document.getElementById(id);
const show = (node, on=true) => node?.classList[on ? 'remove' : 'add']('hidden');
const escapeHtml = (s='') => s?.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) ?? '';

const stateRef = { current: null, myPlayerId: null, mySocketId: null, hostLocked: false, playerLocked: false };
socket.on('connect', () => { stateRef.mySocketId = socket.id; });

/* Tabs */
const tabPlayer = el('tabPlayer'), tabHost = el('tabHost');
const playerStage = el('playerStage'), hostStage = el('hostStage');
const cardEl = document.querySelector('.card');
const hostTopRow = document.querySelector('#hostLive .row') || null;

function isGameplayPhase(phase){ return ['brief','alibi','interrogate','vote','reveal'].includes(phase); }
function applyFullscreenByPhase(phase){
  if (!cardEl) return;
  if (isGameplayPhase(phase)) cardEl.classList.add('fullscreen'); else cardEl.classList.remove('fullscreen');
}
function switchTab(which){
  if (which === 'host' && stateRef.playerLocked) return;
  if (which === 'player' && stateRef.hostLocked) return;
  if (which === 'player') {
    tabPlayer?.classList.add('active'); tabHost?.classList.remove('active');
    show(playerStage,true); show(hostStage,false);
  } else {
    tabHost?.classList.add('active'); tabPlayer?.classList.remove('active');
    show(hostStage,true); show(playerStage,false);
    if (!el('roomCode')?.textContent) socket.emit('games:list');
  }
}
tabPlayer?.addEventListener('click', () => switchTab('player'));
tabHost?.addEventListener('click', () => {
  const st = stateRef.current;
  if (stateRef.hostLocked) {
    if (st?.phase && st.phase !== 'lobby' && st.phase !== 'done') return;
    if (st?.code) socket.emit('host:returnToMenu', { code: st.code });
    return;
  }
  switchTab('host');
});
switchTab('player');

/* Persisted join info (with token) */
const LS_KEY = 'jojos:lastJoin';
function saveJoinInfo(obj){ try{ localStorage.setItem(LS_KEY, JSON.stringify(obj)); }catch{} }
function loadJoinInfo(){ try{ return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); }catch{ return null; } }

const playerJoinRow = el('playerJoinRow');
const joinBtn = el('joinBtn'), joinCode = el('joinCode'), playerName = el('playerName');
const playerArea = el('playerArea'), playerUI = el('playerUI');
const playerTimer = el('playerTimer'), playerTimerBar = el('playerTimerBar');

const last = loadJoinInfo();
if (last?.code) joinCode.value = last.code;
if (last?.name) playerName.value = last.name;
if (last?.code && last?.name && last?.reconnectToken) {
  socket.emit('player:join', { code: last.code, name: last.name, reconnectToken: last.reconnectToken });
}

joinBtn?.addEventListener('click', () => {
  const code = (joinCode.value || '').trim().toUpperCase();
  const name = (playerName.value || '').trim();
  const reconnectToken = loadJoinInfo()?.reconnectToken;
  saveJoinInfo({ code, name, reconnectToken });
  socket.emit('player:join', { code, name, reconnectToken });
});
socket.on('player:joined', ({ code, playerId, reconnectToken }) => {
  stateRef.myPlayerId = playerId;
  show(playerJoinRow,false); show(playerArea,true);
  stateRef.playerLocked = true;
  if (tabHost){ tabHost.style.opacity = '0.45'; tabHost.style.pointerEvents = 'none'; }
  // persist fresh token
  saveJoinInfo({ code, name: playerName.value || 'Player', reconnectToken });
});
socket.on('player:joinFailed', ({ reason }) => alert('Join failed: ' + reason));
socket.on('player:kicked', ({ code }) => {
  alert('You were removed by the host.');
  location.href = '/';
});

/* Host picker & live shell */
const hostPre = el('hostPre'), gamePickerHost = el('gamePickerHost'), hostLive = el('hostLive');
const roomCodeEl = el('roomCode'), joinUrlEl = el('joinUrl');

socket.on('games:list:resp', (games) => {
  gamePickerHost.innerHTML = '';
  const grid = document.createElement('div'); grid.className = 'list';
  games.forEach(g => {
    const card = document.createElement('button');
    card.className = 'item';
    card.innerHTML = `<div class="big">${escapeHtml(g.name)}</div><div class="desc">${escapeHtml(g.description || '')}</div>
    <div class="muted">Players ${g.minPlayers}–${g.maxPlayers}</div>`;
    card.onclick = () => socket.emit('host:createRoom', { gameKey: g.key });
    grid.appendChild(card);
  });
  gamePickerHost.appendChild(grid);
  show(hostPre,true); show(hostLive,false);
  stateRef.hostLocked = false; tabHost.textContent = 'Host';
  tabPlayer.style.opacity = ''; tabPlayer.style.pointerEvents = '';
  applyFullscreenByPhase('lobby'); if (hostTopRow) show(hostTopRow, true);
});

socket.on('host:roomCreated', ({ code }) => {
  roomCodeEl.textContent = code;
  joinUrlEl.textContent = `${window.location.origin}`;
  show(hostPre,false); show(hostLive,true);
  switchTab('host');
  stateRef.hostLocked = true; tabHost.textContent = 'Back';
  tabPlayer.style.opacity = '0.45'; tabPlayer.style.pointerEvents = 'none';
});
socket.on('host:returnedToMenu', () => {
  roomCodeEl.textContent = '';
  show(hostPre,true); show(hostLive,false);
  stateRef.hostLocked = false; tabHost.textContent = 'Host';
  tabPlayer.style.opacity = ''; tabPlayer.style.pointerEvents = '';
  applyFullscreenByPhase('lobby'); if (hostTopRow) show(hostTopRow, true);
});

/* Host live controls (anti-grief) */
const settingsPanel = el('settingsPanel');
const settingsBody = el('settingsBody');
const settingsToggle = el('settingsToggle');
settingsToggle?.addEventListener('click', () => settingsBody.classList.toggle('hidden'));

// quick control strip:
const hostControls = document.createElement('div');
hostControls.className = 'row';
hostControls.innerHTML = `
  <button id="ctlLock" class="btn">Lock Room</button>
  <button id="ctlHide" class="btn">Hide Code</button>
`;
document.getElementById('hostLive')?.prepend(hostControls);

document.getElementById('ctlLock')?.addEventListener('click', () => {
  const st = stateRef.current; if (!st) return; socket.emit('host:lockRoom', { code: st.code, on: !st.locked });
});
document.getElementById('ctlHide')?.addEventListener('click', () => {
  const st = stateRef.current; if (!st) return; socket.emit('host:hideCode', { code: st.code, on: !st.hideCode });
});

// lobby components
const lobbyBlock = el('lobbyBlock'), lobbyPlayers = el('lobbyPlayers');
const hostTimer = el('hostTimer'), hostTimerBar = el('hostTimerBar');
const hostQuestion = el('hostQuestion'), hostFeed = el('hostFeed');

const endOptions = el('endOptions');
const btnSame = el('btnSame'), btnNew = el('btnNew'), btnMenu = el('btnMenu');
btnSame?.addEventListener('click', () => stateRef.current && socket.emit('game:event', { code: stateRef.current.code, type: 'host:restartSame' }));
btnNew ?.addEventListener('click', () => stateRef.current && socket.emit('game:event', { code: stateRef.current.code, type: 'host:restartNew'  }));
btnMenu?.addEventListener('click', () => stateRef.current && socket.emit('host:returnToMenu', { code: stateRef.current.code }));

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

/* Game loader */
const gameModulesCache = new Map();
async function getGameModule(key) {
  if (gameModulesCache.has(key)) return gameModulesCache.get(key);
  const path = `./games/${key}/client.js`;
  if (gameModules[path]) {
    const mod = await gameModules[path]();
    gameModulesCache.set(key, mod);
    return mod;
  }
  const fallback = {
    meta: { key, name: key, description: '' },
    renderHost(){ hostQuestion.textContent = `Unknown game: ${key}`; },
    renderPlayer(){ const d=document.createElement('div'); d.className='item'; d.textContent='This game has no client UI yet.'; document.getElementById('playerUI').appendChild(d); }
  };
  gameModulesCache.set(key, fallback);
  return fallback;
}

function isHost(){ const st = stateRef.current; return st && st.hostId === stateRef.mySocketId; }
function isVIP(){ const st = stateRef.current; return st && st.vipId === stateRef.myPlayerId; }
const helpers = { el, show, escapeHtml, isHost, isVIP };

/* Settings: seconds UI (send ms) */
function renderSettingsCompact(state) {
  if (state.phase !== 'lobby' || !isHost()) { show(settingsPanel, false); return; }
  const schema = state.settingsSchema || {}, values = state.settings || {};
  const editable = Object.entries(schema).filter(([,meta]) => meta?.editable);
  if (editable.length === 0) { show(settingsPanel,false); return; }

  settingsBody.innerHTML = '';
  editable.forEach(([key, meta]) => {
    const wrap = document.createElement('div'); wrap.className = 'settings-field';
    const label = document.createElement('label'); label.textContent = (meta.label || key) + ' (s)';
    const input = document.createElement('input'); input.type = 'number';
    const valMs = values[key]; if (typeof valMs !== 'undefined') input.value = Math.round(Number(valMs)/1000) || 0;
    const minS = Number.isFinite(meta.min) ? Math.round(meta.min/1000) : 3;
    const maxS = Number.isFinite(meta.max) ? Math.round(meta.max/1000) : 180;
    const stepS = Number.isFinite(meta.step) ? Math.max(1, Math.round(meta.step/1000)) : 1;
    input.min = String(minS); input.max = String(maxS); input.step = String(stepS);
    input.setAttribute('data-key', key);
    input.addEventListener('change', () => {
      const payload = {};
      settingsBody.querySelectorAll('input').forEach(inp => {
        const k = inp.getAttribute('data-key'); const sec = Math.max(minS, Math.min(maxS, Number(inp.value)||0));
        payload[k] = sec * 1000;
      });
      socket.emit('game:event', { code: state.code, type: 'host:updateSettings', payload });
    });
    wrap.appendChild(label); wrap.appendChild(input); settingsBody.appendChild(wrap);
  });
  show(settingsPanel, true); settingsBody.classList.add('hidden');
}

/* Room state */
socket.on('room:state', async (state) => {
  stateRef.current = state;
  startTimer(state?.phaseDeadline || null);

  // host tab state
  if (state.code) {
    if (stateRef.hostLocked) {
      tabHost.textContent = 'Back';
      if (state.phase !== 'lobby' && state.phase !== 'done') { tabHost.style.opacity='0.45'; tabHost.style.pointerEvents='none'; }
      else { tabHost.style.opacity=''; tabHost.style.pointerEvents=''; }
    } else tabHost.textContent = 'Host';
  } else tabHost.textContent = 'Host';

  // fullscreen + hide header outside lobby/tutorial/done
  applyFullscreenByPhase(state.phase);
  if (hostTopRow) { const showTop = (state.phase === 'lobby' || state.phase === 'tutorial' || state.phase === 'done'); show(hostTopRow, showTop); }

  renderSettingsCompact(state);

  // host code visibility
  const codeWrap = document.getElementById('roomCodeWrap');
  if (codeWrap) codeWrap.style.visibility = state.hideCode ? 'hidden' : 'visible';

  // render game UIs
  const mod = state?.gameKey ? await getGameModule(state.gameKey) : null;
  const ctx = makeCtx({ socket, helpers, stateRef });

  hostQuestion.textContent = ''; hostFeed.innerHTML = '';
  const pUI = document.getElementById('playerUI'); if (pUI) pUI.innerHTML = '';

  if (mod?.renderHost) mod.renderHost(ctx, state);
  if (mod?.renderHostSettings && state?.phase === 'lobby') mod.renderHostSettings(ctx, state);
  if (mod?.renderPlayer) mod.renderPlayer(ctx, state);

  // lobby list + kick buttons
  if (state.phase === 'lobby' || state.phase === 'tutorial') {
    show(lobbyBlock, true);
    lobbyPlayers.innerHTML = '';
    (state.playersInLobby || state.players || []).forEach(p => {
      const d = document.createElement('div'); d.className = 'pill2'; d.style.display='flex'; d.style.justifyContent='space-between'; d.style.alignItems='center';
      const left = document.createElement('span'); left.textContent = p.name + (p.id === state.vipId ? ' ★VIP' : '');
      const right = document.createElement('button'); right.className='btn'; right.textContent='Kick';
      right.onclick = () => socket.emit('host:kick', { code: state.code, playerId: p.id });
      d.appendChild(left); if (isHost()) d.appendChild(right);
      lobbyPlayers.appendChild(d);
    });
  } else {
    show(lobbyBlock, false);
  }

  show(endOptions, state.phase === 'done');
});
