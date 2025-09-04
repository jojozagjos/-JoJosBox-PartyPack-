import { io } from 'https://cdn.socket.io/4.7.2/socket.io.esm.min.js';
import { makeCtx } from './games/_sdk.js';

// ---- Viewport sizing (prevents tiny scroll on mobile) ----
function setVhVar(){ const vh = window.innerHeight * 0.01; document.documentElement.style.setProperty('--vh', `${vh}px`); }
setVhVar(); window.addEventListener('resize', setVhVar); window.addEventListener('orientationchange', setVhVar);

// Vite discovers per-game modules
const gameModules = import.meta.glob('./games/*/client.js');

// Socket & helpers
const socket = io({ autoConnect: true });
const el = (id) => document.getElementById(id);
const show = (node, on=true) => node?.classList[on ? 'remove' : 'add']('hidden');
const escapeHtml = (s='') => s?.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) ?? '';

/* ---------------- FX engine (particles + confetti) ---------------- */
function ensureFxCanvas() {
  let c = document.getElementById('fxCanvas');
  if (!c) {
    c = document.createElement('canvas');
    c.id = 'fxCanvas';
    c.style.position = 'fixed';
    c.style.inset = '0';
    c.style.zIndex = '0';
    c.style.pointerEvents = 'none';
    c.style.opacity = '.6';
    document.body.prepend(c);
  }
  return c;
}
const fx = (() => {
  const canvas = ensureFxCanvas();
  const ctx = canvas.getContext('2d');
  let W=0,H=0, raf=0;
  const particles=[];
  function resize(){ W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
  window.addEventListener('resize', resize); resize();

  function loop(){
    ctx.clearRect(0,0,W,H);
    ctx.globalAlpha = .55;
    for (let i=particles.length-1; i>=0; i--){
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += p.g;
      p.r += p.spin;
      if (p.life !== undefined) { p.life -= 1; if (p.life <= 0) { particles.splice(i,1); continue; } }
      drawP(p);
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(loop);
  }
  function drawP(p){
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
    ctx.fillStyle = p.color; ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h); ctx.restore();
  }
  // subtle background drift
  function seedBackground(){
    for (let i=0;i<60;i++){
      particles.push({
        x: Math.random()*W, y: Math.random()*H,
        vx: (Math.random()-.5)*.15, vy: (Math.random()*.2)+.02, g: 0.0005,
        r: Math.random()*Math.PI, spin:(Math.random()-.5)*0.005,
        w: 2+Math.random()*3, h: 2+Math.random()*8,
        color: Math.random()<.5 ? 'rgba(124,92,255,.25)' : 'rgba(50,214,255,.22)'
      });
    }
  }
  function confettiBurst(x=W/2, y=H*0.25, n=140){
    for (let i=0;i<n;i++){
      const ang = Math.random()*Math.PI*2;
      particles.push({
        x, y,
        vx: Math.cos(ang)* (1.2 + Math.random()*2.2),
        vy: Math.sin(ang)* (1.0 + Math.random()*1.8),
        g: 0.03,
        r: Math.random()*Math.PI, spin:(Math.random()-.5)*0.2,
        w: 4+Math.random()*6, h: 2+Math.random()*10,
        life: 300 + Math.random()*120,
        color: ['#7c5cff','#32d6ff','#7dffa3','#ffd36e','#ff8a8a'][Math.floor(Math.random()*5)]
      });
    }
  }
  seedBackground(); loop();
  return { confettiBurst };
})();

/* ---------------- State + Tabs ---------------- */
const stateRef = { current: null, myPlayerId: null, mySocketId: null, hostLocked: false, playerLocked: false };
socket.on('connect', () => { stateRef.mySocketId = socket.id; });

const tabPlayer = el('tabPlayer'), tabHost = el('tabHost');
const playerStage = el('playerStage'), hostStage = el('hostStage');

// the outer card (used for fullscreen)
const cardEl = document.querySelector('.card');

function isGameplayPhase(phase){
  return ['brief','alibi','interrogate','vote','reveal'].includes(phase);
}
function applyFullscreenByPhase(phase){
  if (!cardEl) return;
  if (isGameplayPhase(phase)) cardEl.classList.add('fullscreen');
  else cardEl.classList.remove('fullscreen');
}

function switchTab(which){
  if (which === 'host' && stateRef.playerLocked) return;  // players can’t go Host
  if (which === 'player' && stateRef.hostLocked) return;  // host can’t go Player while hosting
  if (which === 'player') {
    tabPlayer?.classList.add('active'); tabHost?.classList.remove('active');
    show(playerStage, true); show(hostStage, false);
  } else {
    tabHost?.classList.add('active'); tabPlayer?.classList.remove('active');
    show(hostStage, true); show(playerStage, false);
    if (!el('roomCode')?.textContent) socket.emit('games:list');
  }
}
tabPlayer?.addEventListener('click', () => switchTab('player'));
tabHost?.addEventListener('click', () => {
  const st = stateRef.current;
  if (stateRef.hostLocked) {
    // disable Back while game active
    if (st?.phase && st.phase !== 'lobby' && st.phase !== 'done') return;
    if (st?.code) socket.emit('host:returnToMenu', { code: st.code });
    return;
  }
  switchTab('host');
});
switchTab('player');

/* ---------------- Player join + reconnect ---------------- */
const LS_KEY = 'jojos:lastJoin';
const playerJoinRow = el('playerJoinRow');
const joinBtn = el('joinBtn'), joinCode = el('joinCode'), playerName = el('playerName');
const playerArea = el('playerArea'), playerUI = el('playerUI');
const playerTimer = el('playerTimer'), playerTimerBar = el('playerTimerBar');

function saveJoinInfo(code, name){ try{ localStorage.setItem(LS_KEY, JSON.stringify({ code, name })); }catch{} }
function loadJoinInfo(){ try{ return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); }catch{ return null; } }

const last = loadJoinInfo();
if (last?.code) joinCode.value = last.code;
if (last?.name) playerName.value = last.name;
if (last?.code && last?.name) socket.emit('player:join', { code: last.code, name: last.name });

joinBtn?.addEventListener('click', () => {
  const code = (joinCode.value || '').trim().toUpperCase();
  const name = (playerName.value || '').trim();
  saveJoinInfo(code, name);
  socket.emit('player:join', { code, name });
});
socket.on('player:joined', ({ code, playerId }) => {
  stateRef.myPlayerId = playerId;
  show(playerJoinRow, false);
  show(playerArea, true);
  stateRef.playerLocked = true;
  if (tabHost){ tabHost.style.opacity = '0.45'; tabHost.style.pointerEvents = 'none'; }
});
socket.on('player:joinFailed', ({ reason }) => alert('Join failed: ' + reason));

/* ---------------- Host picker & live shell ---------------- */
const hostPre = el('hostPre'), gamePickerHost = el('gamePickerHost'), hostLive = el('hostLive');
const roomCodeEl = el('roomCode'), joinUrlEl = el('joinUrl');
const hostTopRow = document.querySelector('#hostLive .row') || null;

socket.on('games:list:resp', (games) => {
  if (!gamePickerHost) return;
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
  show(hostPre, true); show(hostLive, false);

  stateRef.hostLocked = false;
  if (tabHost) tabHost.textContent = 'Host';
  if (tabPlayer){ tabPlayer.style.opacity = ''; tabPlayer.style.pointerEvents = ''; }
  applyFullscreenByPhase('lobby');
  if (hostTopRow) show(hostTopRow, true);
});

socket.on('host:roomCreated', ({ code }) => {
  if (roomCodeEl) roomCodeEl.textContent = code;
  if (joinUrlEl) joinUrlEl.textContent = `${window.location.origin}`;
  show(hostPre, false); show(hostLive, true);
  switchTab('host');

  stateRef.hostLocked = true;
  if (tabHost) tabHost.textContent = 'Back';
  if (tabPlayer){ tabPlayer.style.opacity = '0.45'; tabPlayer.style.pointerEvents = 'none'; }
});

socket.on('host:returnedToMenu', () => {
  if (roomCodeEl) roomCodeEl.textContent = '';
  show(hostPre, true); show(hostLive, false);

  stateRef.hostLocked = false;
  if (tabHost) tabHost.textContent = 'Host';
  if (tabPlayer){ tabPlayer.style.opacity = ''; tabPlayer.style.pointerEvents = ''; }
  applyFullscreenByPhase('lobby');
  if (hostTopRow) show(hostTopRow, true);
});

/* ---------------- Host live controls ---------------- */
const settingsPanel = el('settingsPanel');
const settingsBody = el('settingsBody');
const settingsToggle = el('settingsToggle');
settingsToggle?.addEventListener('click', () => settingsBody.classList.toggle('hidden'));

const lobbyBlock = el('lobbyBlock'), lobbyPlayers = el('lobbyPlayers');
const hostTimer = el('hostTimer'), hostTimerBar = el('hostTimerBar');
const hostQuestion = el('hostQuestion'), hostFeed = el('hostFeed');

const endOptions = el('endOptions');
const btnSame = el('btnSame'), btnNew = el('btnNew'), btnMenu = el('btnMenu');
btnSame?.addEventListener('click', () => stateRef.current && socket.emit('game:event', { code: stateRef.current.code, type: 'host:restartSame' }));
btnNew?.addEventListener('click',  () => stateRef.current && socket.emit('game:event', { code: stateRef.current.code, type: 'host:restartNew'  }));
btnMenu?.addEventListener('click', () => stateRef.current && socket.emit('host:returnToMenu', { code: stateRef.current.code }));

/* ---------------- Timers ---------------- */
let timerInterval = null;
function startTimer(deadline){
  clearInterval(timerInterval);
  // Host-only timer: players never see the bar
  if (!deadline) { if (hostTimer) hostTimer.classList.add("hidden"); if (playerTimer) playerTimer.classList.add("hidden"); return; }
  if (hostTimer) hostTimer.classList.remove("hidden");
  if (playerTimer) playerTimer.classList.add("hidden");
  const total = Math.max(1, deadline - Date.now());
  timerInterval = setInterval(() => {
    const remaining = Math.max(0, deadline - Date.now());
    const pct = Math.max(0, Math.min(1, remaining / total));
    if (hostTimerBar) hostTimerBar.style.transform = `scaleX(${pct})`;
  }, 100);
}

/* ---------------- Game loader ---------------- */
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
    renderHost(){ if (hostQuestion) hostQuestion.textContent = `Unknown game: ${key}`; },
    renderPlayer(){ const d=document.createElement('div'); d.className='item'; d.textContent='This game has no client UI yet.'; el('playerUI')?.appendChild(d); }
  };
  gameModulesCache.set(key, mod);
  return mod;
}

function isHost(){ const st = stateRef.current; return st && st.hostId === stateRef.mySocketId; }
function isVIP(){ const st = stateRef.current; return st && st.vipId === stateRef.myPlayerId; }
const helpers = { el, show, escapeHtml, isHost, isVIP };

/* ---------------- Settings in seconds (send ms) ---------------- */
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
    label.textContent = (meta.label || key) + ' (s)';

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
        payload[k] = sec * 1000;
      });
      socket.emit('game:event', { code: state.code, type: 'host:updateSettings', payload });
    });
    wrap.appendChild(label); wrap.appendChild(input);
    settingsBody.appendChild(wrap);
  });
  show(settingsPanel, true);
  settingsBody.classList.add('hidden');
}

/* ---------------- Room state render ---------------- */
socket.on('room:state', async (state) => {
  stateRef.current = state;
  startTimer(state?.phaseDeadline || null);

  // Host tab label + disabled during active game
  if (state.code) {
    if (stateRef.hostLocked) {
      if (tabHost) tabHost.textContent = 'Back';
      if (state.phase !== 'lobby' && state.phase !== 'done') {
        if (tabHost){ tabHost.style.opacity = '0.45'; tabHost.style.pointerEvents = 'none'; }
      } else {
        if (tabHost){ tabHost.style.opacity = ''; tabHost.style.pointerEvents = ''; }
      }
    } else {
      if (tabHost) tabHost.textContent = 'Host';
    }
  } else {
    if (tabHost) tabHost.textContent = 'Host';
  }

  // Fullscreen during gameplay; hide host header row & lobby outside lobby/tutorial/done
  applyFullscreenByPhase(state.phase);
  if (hostTopRow) {
    const showTop = (state.phase === 'lobby' || state.phase === 'tutorial' || state.phase === 'done');
    show(hostTopRow, showTop);
  }

  renderSettingsCompact(state);

  const mod = state?.gameKey ? await getGameModule(state.gameKey) : null;
  const ctx = makeCtx({ socket, helpers, stateRef });

  if (hostQuestion) hostQuestion.textContent = '';
  if (hostFeed) hostFeed.innerHTML = '';
  const playerUI = el('playerUI'); if (playerUI) playerUI.innerHTML = '';

  if (mod?.renderHost) mod.renderHost(ctx, state);
  if (mod?.renderHostSettings && state?.phase === 'lobby') mod.renderHostSettings(ctx, state);
  if (mod?.renderPlayer) mod.renderPlayer(ctx, state);

  if (state.phase === 'lobby' || state.phase === 'tutorial') {
    show(lobbyBlock, true);
    if (lobbyPlayers) {
      lobbyPlayers.innerHTML = '';
      (state.playersInLobby || []).forEach(p => {
        const d = document.createElement('div'); d.className = 'pill2';
        d.textContent = p.name + (p.id === state.vipId ? ' ★VIP' : '');
        if (p.id === state.vipId) d.classList.add('vip');
        lobbyPlayers.appendChild(d);
      });
    }
  } else {
    show(lobbyBlock, false);
  }

  // Confetti on reveal or done
  if (state.phase === 'reveal' || state.phase === 'done') {
    fx.confettiBurst(window.innerWidth/2, window.innerHeight*0.25, 160);
  }

  show(endOptions, state.phase === 'done');
});

/* Keep a noop to satisfy earlier wiring if needed */
socket.on('games:list:resp', () => {});
