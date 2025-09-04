import { io } from 'https://cdn.socket.io/4.7.2/socket.io.esm.min.js';
const socket = io({ autoConnect: true });

const el = (id) => document.getElementById(id);
const show = (node, on=true) => node.classList[on ? 'remove' : 'add']('hidden');

// Tabs / stages
const tabPlayer = el('tabPlayer');
const tabHost   = el('tabHost');
const playerStage = el('playerStage');
const hostStage   = el('hostStage');

// Player join elements
const joinBtn = el('joinBtn');
const joinCode = el('joinCode');
const playerName = el('playerName');
const playerArea = el('playerArea');
const playerRoomCode = el('playerRoomCode');
const playerUI = el('playerUI');
const playerTimer = el('playerTimer');
const playerTimerBar = el('playerTimerBar');

// Host pre-live (picker) and live UI
const hostPre = el('hostPre');
const gamePickerHost = el('gamePickerHost');
const hostLive = el('hostLive');
const startGameBtn = el('startGameBtn');
const startWrap = el('startWrap');
const roomCodeEl = el('roomCode');
const joinUrlEl = el('joinUrl');
const hostQuestion = el('hostQuestion');
const hostChoices = el('hostChoices');
const hostMeta = el('hostMeta');
const hostLeaderboard = el('hostLeaderboard');
const hostTimer = el('hostTimer');
const hostTimerBar = el('hostTimerBar');

let currentPublicState = null;
let myPlayerId = null;
let mySocketId = null;
socket.on('connect', () => { mySocketId = socket.id; });

// Host-only audio synth
const audio = (() => {
  let ctx, bgGain, sfxGain, bgInterval;
  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      bgGain = ctx.createGain(); bgGain.gain.value = 0.06; bgGain.connect(ctx.destination);
      sfxGain = ctx.createGain(); sfxGain.gain.value = 0.18; sfxGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }
  function startBg() {
    ensureCtx(); stopBg();
    let step = 0;
    bgInterval = setInterval(() => {
      const notes = [220, 277, 330, 440];
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = notes[step++ % notes.length];
      g.gain.value = 0.003;
      osc.type = 'sine';
      osc.connect(g).connect(bgGain);
      osc.start(); osc.stop(ctx.currentTime + 0.35);
    }, 450);
  }
  function stopBg(){ if (bgInterval) { clearInterval(bgInterval); bgInterval = null; } }
  function blip(freq=880, dur=0.12){
    ensureCtx();
    const o = ctx.createOscillator(); o.type='triangle'; o.frequency.value=freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(sfxGain); o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }
  return { ensureCtx, startBg, stopBg, blip };
})();

function switchTab(which) {
  if (which === 'player') {
    tabPlayer.classList.add('active'); tabHost.classList.remove('active');
    show(playerStage, true); show(hostStage, false);
  } else {
    tabHost.classList.add('active'); tabPlayer.classList.remove('active');
    show(hostStage, true); show(playerStage, false);

    // If not hosting yet, fetch game list and show picker
    if (!roomCodeEl.textContent) {
      socket.emit('games:list');
    }
  }
}
tabPlayer.onclick = () => switchTab('player');
tabHost.onclick   = () => switchTab('host');
switchTab('player'); // default

// Build game picker when server responds
socket.on('games:list:resp', (games) => {
  gamePickerHost.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'choices';
  games.forEach(g => {
    const card = document.createElement('button');
    card.className = 'choiceBtn pop';
    card.innerHTML = `<div class="big">${g.name}</div><div class="muted">Players ${g.minPlayers}â€“${g.maxPlayers}</div>`;
    card.onclick = () => {
      // Enable audio via click gesture
      audio.ensureCtx(); audio.startBg(); audio.blip(1200, .15);
      socket.emit('host:createRoom', { gameKey: g.key });
    };
    grid.appendChild(card);
  });
  gamePickerHost.appendChild(grid);
  show(hostPre, true);
  show(hostLive, false);
});

// Host room created
socket.on('host:roomCreated', ({ code }) => {
  roomCodeEl.textContent = code;
  joinUrlEl.textContent = `${window.location.origin}`;
  // Switch to live host UI
  show(hostPre, false);
  show(hostLive, true);
  // Ensure Host tab is active
  switchTab('host');
});

// Player join
joinBtn.addEventListener('click', () => {
  const code = (joinCode.value || '').trim().toUpperCase();
  const name = (playerName.value || '').trim();
  socket.emit('player:join', { code, name });
});
socket.on('player:joined', ({ code, playerId }) => {
  myPlayerId = playerId;
  playerRoomCode.textContent = code;
  show(playerArea, true);
});
socket.on('player:joinFailed', ({ reason }) => alert('Join failed: ' + reason));

// Start game (host)
startGameBtn.addEventListener('click', () => {
  if (!currentPublicState) return;
  if (isHost()) { audio.ensureCtx(); audio.startBg(); audio.blip(1000, .12); }
  socket.emit('host:startGame', { code: currentPublicState.code });
});

socket.on('room:ended', ({ reason }) => { alert('Room ended: ' + reason); location.reload(); });

// Timers
let timerInterval = null;
function startTimerBars(state) {
  clearInterval(timerInterval);
  const t = state.timer || {};
  if (!t.deadline && !t.revealEndsAt) {
    show(hostTimer, false); show(playerTimer, false); return;
  }
  show(hostTimer, true); show(playerTimer, true);
  timerInterval = setInterval(() => {
    const now = Date.now();
    let total = 1, remaining = 0;
    if (state.phase === 'question' && t.deadline) {
      total = t.perQuestionMs || 1;
      remaining = Math.max(0, t.deadline - now);
    } else if (state.phase === 'reveal' && t.revealEndsAt) {
      total = t.revealMs || 1;
      remaining = Math.max(0, t.revealEndsAt - now);
    }
    const pct = Math.max(0, Math.min(100, (remaining / total) * 100));
    hostTimerBar.style.transform = `scaleX(${pct/100})`;
    playerTimerBar.style.transform = `scaleX(${pct/100})`;
  }, 100);
}

socket.on('room:state', (state) => {
  const prev = currentPublicState;
  currentPublicState = state;
  if (!state) return;

  // Host-only sfx on phase change
  if (isHost() && (!prev || prev.phase !== state.phase)) {
    if (state.phase === 'question') audio.blip(900, .1);
    if (state.phase === 'reveal')   audio.blip(600, .2);
    if (state.phase === 'done')     audio.blip(450, .25);
  }

  renderHost(state);
  renderPlayer(state);
  startTimerBars(state);
});

function isHost() {
  return currentPublicState && currentPublicState.hostId === mySocketId;
}

function renderHost(state) {
  if (hostLive.classList.contains('hidden')) return;

  // Lobby: show Start; otherwise hide
  show(startWrap, state.phase === 'lobby');

  hostChoices.innerHTML = '';
  hostLeaderboard.innerHTML = '';
  hostQuestion.textContent = '';
  hostMeta.textContent = '';

  if (state.phase === 'lobby') {
    hostQuestion.textContent = 'Waiting to startâ€¦';
    hostMeta.textContent = `Players: ${state.players.length} â€¢ Game: ${state.gameName}`;
    show(hostTimer, false);
    return;
  }

  if (state.phase === 'question') {
    const q = state.currentQuestion || { q: '', choices: [] };
    hostQuestion.textContent = q.q;
    hostMeta.textContent = `Players: ${state.players.length} â€¢ Answers: ${state.answeredCount}/${state.totalPlayers}`;
    q.choices.forEach((cText, idx) => {
      const b = document.createElement('div');
      b.className = 'choiceBtn pop';
      b.textContent = `${String.fromCharCode(65+idx)}. ${cText}`;
      hostChoices.appendChild(b);
    });
    return;
  }

  if (state.phase === 'reveal') {
    const q = state.currentQuestion || { q: '', choices: [] };
    hostQuestion.textContent = q.q;
    hostMeta.textContent = `Revealingâ€¦`;
    q.choices.forEach((cText, idx) => {
      const div = document.createElement('div');
      div.className = 'choiceBtn';
      if (idx === state.answerIndex) div.classList.add('locked');
      div.textContent = `${String.fromCharCode(65+idx)}. ${cText}`;
      hostChoices.appendChild(div);
    });
    renderLeaderboard(state, hostLeaderboard);
    return;
  }

  if (state.phase === 'done') {
    hostQuestion.textContent = 'Final results';
    renderLeaderboard(state, hostLeaderboard);
  }
}

function renderPlayer(state) {
  playerUI.innerHTML = '';
  if (!myPlayerId) return;

  if (state.phase === 'lobby') {
    show(playerTimer, false);
    const p = document.createElement('p'); p.className='muted';
    p.textContent = 'Waiting for host to startâ€¦';
    playerUI.appendChild(p);
    return;
  }

  if (state.phase === 'question') {
    const q = state.currentQuestion || { q: '', choices: [] };
    const pt = document.createElement('p'); pt.className='question'; pt.textContent=q.q;
    playerUI.appendChild(pt);

    const list = document.createElement('div'); list.className='choices';
    q.choices.forEach((cText, idx) => {
      const b = document.createElement('button');
      b.className = 'choiceBtn';
      b.textContent = cText;
      b.onclick = () => {
        [...list.children].forEach(ch => ch.disabled = true);
        b.classList.add('locked');
        socket.emit('game:event', { code: state.code, type: 'answer:submit', payload: { choiceIndex: idx } });
      };
      list.appendChild(b);
    });
    playerUI.appendChild(list);
    return;
  }

  if (state.phase === 'reveal') {
    const q = state.currentQuestion || { q: '', choices: [] };
    const p = document.createElement('p'); p.className='muted';
    p.textContent = 'Correct answer: ' + (q.choices[state.answerIndex] ?? '');
    playerUI.appendChild(p);
    renderLeaderboard(state, playerUI);
    return;
  }

  if (state.phase === 'done') {
    const p = document.createElement('p'); p.className='muted'; p.textContent = 'Game over.';
    playerUI.appendChild(p);
    renderLeaderboard(state, playerUI);
  }
}

function renderLeaderboard(state, container) {
  const lb = document.createElement('div'); lb.className='leaderboard fadeIn';
  state.leaderboard.forEach((row, i) => {
    const r = document.createElement('div'); r.className='lb-row';
    const medal = i===0?'íµ‡':i===1?'íµˆ':i===2?'íµ‰':'';
    r.innerHTML = `<div><span class="medal">${medal}</span> ${escapeHtml(row.name)}</div><div>${row.score}</div>`;
    lb.appendChild(r);
  });
  container.appendChild(lb);
}

function escapeHtml(s=''){ return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
