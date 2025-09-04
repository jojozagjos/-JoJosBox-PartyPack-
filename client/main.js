import { io } from 'https://cdn.socket.io/4.7.2/socket.io.esm.min.js';
import { makeCtx } from './games/_sdk.js';

// Vite discovers per-game modules
const gameModules = import.meta.glob('./games/*/client.js');

const socket = io({ autoConnect: true });
const el = (id) => document.getElementById(id);
const show = (node, on=true) => node.classList[on ? 'remove' : 'add']('hidden');
const escapeHtml = (s='') => s?.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) ?? '';

/* ---------------- FX: background particles + confetti ---------------- */
const fx = (() => {
  const canvas = document.getElementById('fxCanvas');
  const ctx = canvas.getContext('2d');
  let W=0,H=0, raf=0; let particles=[];
  function resize(){ W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
  window.addEventListener('resize', resize); resize();

  function loop(){
    ctx.clearRect(0,0,W,H);
    // subtle drifting particles
    ctx.globalAlpha = .55;
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy; p.vy += p.g;
      p.r += p.spin;
      if (p.y > H+20) p.y = -10;
      drawP(p);
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(loop);
  }

  function drawP(p){
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.r);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
    ctx.restore();
  }

  function seedBackground(){
    particles = [];
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

  function confettiBurst(x=W/2, y=H*0.25, n=120){
    for (let i=0;i<n;i++){
      const ang = Math.random()*Math.PI*2;
      particles.push({
        x, y,
        vx: Math.cos(ang)* (1.4 + Math.random()*2.2),
        vy: Math.sin(ang)* (1.0 + Math.random()*1.8),
        g: 0.02,
        r: Math.random()*Math.PI, spin:(Math.random()-.5)*0.2,
        w: 4+Math.random()*6, h: 2+Math.random()*10,
        color: ['#7c5cff','#32d6ff','#7dffa3','#ffd36e','#ff8a8a'][Math.floor(Math.random()*5)]
      });
    }
  }

  seedBackground();
  loop();

  return { confettiBurst };
})();

/* ---------------- State + Tabs ---------------- */
const stateRef = { current: null, myPlayerId: null, mySocketId: null, hostLocked: false, lastPhase: null };
socket.on('connect', () => { stateRef.mySocketId = socket.id; });

const tabPlayer = el('tabPlayer'), tabHost = el('tabHost');
const playerStage = el('playerStage'), hostStage = el('hostStage');

function switchTab(which){
  if (which === 'player' && stateRef.hostLocked) return;
  if (which === 'player') {
    tabPlayer.classList.add('active'); tabHost.classList.remove('active');
    show(playerStage, true); show(hostStage, false);
    playerStage.classList.add('fadeInUp');
    setTimeout(()=>playerStage.classList.remove('fadeInUp'), 400);
  } else {
    tabHost.classList.add('active'); tabPlayer.classList.remove('active');
    show(hostStage, true); show(playerStage, false);
    hostStage.classList.add('fadeInUp');
    setTimeout(()=>hostStage.classList.remove('fadeInUp'), 400);
    if (!el('roomCode').textContent) socket.emit('games:list');
  }
}
tabPlayer.onclick = () => switchTab('player');
tabHost.onclick   = () => {
  if (stateRef.hostLocked) {
    const st = stateRef.current; if (st?.code) socket.emit('host:returnToMenu', { code: st.code });
    return;
  }
  switchTab('host');
};
switchTab('player');

/* ---------------- Player join ---------------- */
const playerJoinRow = el('playerJoinRow');
const joinBtn = el('joinBtn'), joinCode = el('joinCode'), playerName = el('playerName');
const playerArea = el('playerArea'), playerUI = el('playerUI');
const playerTimer = el('playerTimer'), playerTimerBar = el('playerTimerBar');

joinBtn.onclick = () => {
  const code = (joinCode.value || '').trim().toUpperCase();
  const name = (playerName.value || '').trim();
  socket.emit('player:join', { code, name });
};
socket.on('player:joined', ({ playerId }) => {
  stateRef.myPlayerId = playerId;
  show(playerJoinRow, false);
  show(playerArea, true);
  playerArea.classList.add('scaleIn');
  setTimeout(()=>playerArea.classList.remove('scaleIn'), 350);
});
socket.on('player:joinFailed', ({ reason }) => alert('Join failed: ' + reason));

/* ---------------- Host picker & live shell ---------------- */
const hostPre = el('hostPre'), gamePickerHost = el('gamePickerHost'), hostLive = el('hostLive');
const roomCodeEl = el('roomCode'), joinUrlEl = el('joinUrl');

socket.on('games:list:resp', (games) => {
  gamePickerHost.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'list';
  games.forEach((g, i) => {
    const card = document.createElement('button');
    card.className = 'item buttonish';
    card.style.animation = `fadeInUp .4s ${0.02*i}s cubic-bezier(.2,.8,.2,1) both`;
    card.innerHTML = `<div class="big">${escapeHtml(g.name)}</div><div class="desc">${escapeHtml(g.description || '')}</div>
    <div class="muted">Players ${g.minPlayers}–${g.maxPlayers}</div>`;
    card.onclick = () => socket.emit('host:createRoom', { gameKey: g.key });
    grid.appendChild(card);
  });
  gamePickerHost.appendChild(grid);
  show(hostPre, true); show(hostLive, false);
  stateRef.hostLocked = false; tabHost.textContent = 'Host';
  tabPlayer.style.opacity = ''; tabPlayer.style.pointerEvents = '';
});

socket.on('host:roomCreated', ({ code }) => {
  roomCodeEl.textContent = code;
  joinUrlEl.textContent = `${window.location.origin}`;
  show(hostPre, false); show(hostLive, true);
  switchTab('host');

  // Lock Player tab & rename Host tab to Back
  stateRef.hostLocked = true;
  tabHost.textContent = 'Back';
  tabPlayer.style.opacity = '0.45';
  tabPlayer.style.pointerEvents = 'none';

  // Pop-in the live host area
  hostLive.classList.add('scaleIn');
  setTimeout(()=>hostLive.classList.remove('scaleIn'), 350);
});

socket.on('host:returnedToMenu', () => {
  roomCodeEl.textContent = '';
  show(hostPre, true); show(hostLive, false);
  stateRef.hostLocked = false; tabHost.textContent = 'Host';
  tabPlayer.style.opacity = ''; tabPlayer.style.pointerEvents = '';
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
btnSame.onclick = () => stateRef.current && socket.emit('game:event', { code: stateRef.current.code, type: 'host:restartSame' });
btnNew.onclick  = () => stateRef.current && socket.emit('game:event', { code: stateRef.current.code, type: 'host:restartNew' });
btnMenu.onclick = () => stateRef.current && socket.emit('host:returnToMenu', { code: stateRef.current.code });

/* Secret brief to criminal */
socket.on('alibi:brief', ({ brief }) => {
  const c = document.createElement('div'); c.className = 'item flashWarn';
  c.innerHTML = `<strong>Secret brief</strong><br>${escapeHtml(brief)}`;
  playerUI.prepend(c);
});

/* ---------------- Timers ---------------- */
let timerInterval = null;
function startTimer(deadline){
  clearInterval(timerInterval);
  if (!deadline) { show(hostTimer,false); show(playerTimer,false); return; }
  show(hostTimer,true); show(playerTimer,true);
  timerInterval = setInterval(() => {
    const remaining = Math.max(0, deadline - Date.now());
    // Map remaining ms to a 0..1 scale with ease; keep simple visual
    const total = 60000; // visual scale; animated feel, not exact time
    const pct = Math.max(0, Math.min(1, remaining/total));
    const eased = 1 - Math.pow(1-pct, 2);
    hostTimerBar.style.transform = `scaleX(${eased})`;
    playerTimerBar.style.transform = `scaleX(${eased})`;
  }, 100);
}

/* ---------------- Dynamic game module loader ---------------- */
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

/* ---------------- Compact settings renderer ---------------- */
function renderSettingsCompact(state) {
  if (state.phase !== 'lobby' || !isHost()) { show(settingsPanel, false); return; }
  const schema = state.settingsSchema || {};
  const values = state.settings || {};
  const editableEntries = Object.entries(schema).filter(([k, meta]) => meta?.editable);
  if (editableEntries.length === 0) { show(settingsPanel, false); return; }

  settingsBody.innerHTML = '';
  editableEntries.forEach(([key, meta]) => {
    const wrap = document.createElement('div');
    wrap.className = 'settings-field fadeInUp';
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
      settingsPanel.classList.add('flashGood');
      setTimeout(()=>settingsPanel.classList.remove('flashGood'), 700);
    });
    wrap.appendChild(label); wrap.appendChild(input);
    settingsBody.appendChild(wrap);
  });
  show(settingsPanel, true);
  settingsBody.classList.add('hidden'); // stay collapsed by default
}

/* ---------------- Render loop per room state ---------------- */
socket.on('room:state', async (state) => {
  // Phase change heading flourish
  if (stateRef.lastPhase && stateRef.lastPhase !== state.phase) {
    hostQuestion.classList.add('fadeInUp');
    setTimeout(()=>hostQuestion.classList.remove('fadeInUp'), 420);
  }
  stateRef.lastPhase = state.phase;

  stateRef.current = state;
  startTimer(state?.phaseDeadline || null);

  renderSettingsCompact(state);

  const mod = state?.gameKey ? await getGameModule(state.gameKey) : null;
  const ctx = makeCtx({ socket, helpers, stateRef });

  el('hostQuestion').textContent = '';
  el('hostFeed').innerHTML = '';
  el('playerUI').innerHTML = '';

  if (mod?.renderHost) mod.renderHost(ctx, state);
  if (mod?.renderHostSettings && state?.phase === 'lobby') mod.renderHostSettings(ctx, state);
  if (mod?.renderPlayer) mod.renderPlayer(ctx, state);

  // Animated lobby list (stagger tiles)
  if (state.phase === 'lobby' || state.phase === 'tutorial') {
    show(lobbyBlock, true);
    lobbyPlayers.innerHTML = '';
    (state.playersInLobby || []).forEach((p, i) => {
      const d = document.createElement('div'); d.className = 'pill2';
      d.textContent = p.name + (p.id === state.vipId ? ' ★VIP' : '');
      if (p.id === state.vipId) d.classList.add('vip');
      d.style.animationDelay = `${i*0.04}s`;
      lobbyPlayers.appendChild(d);
    });
  } else {
    show(lobbyBlock, false);
  }

  // Confetti on reveal/done
  if (state.phase === 'reveal' || state.phase === 'done') {
    fx.confettiBurst(window.innerWidth/2, window.innerHeight*0.25, 160);
  }

  show(endOptions, state.phase === 'done');
});

/* Keep picker noop listener to satisfy previous wiring */
socket.on('games:list:resp', () => {});
