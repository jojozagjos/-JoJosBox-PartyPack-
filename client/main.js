import { io } from 'https://cdn.socket.io/4.7.2/socket.io.esm.min.js';

const socket = io({ autoConnect: true });

const el = (id) => document.getElementById(id);

// Host elements
const gameKeySel = el('gameKey');
const createRoomBtn = el('createRoomBtn');
const hostArea = el('hostArea');
const roomCodeEl = el('roomCode');
const joinUrlEl = el('joinUrl');
const startGameBtn = el('startGameBtn');
const nextBtn = el('nextBtn');
const hostState = el('hostState');

// Player elements
const joinBtn = el('joinBtn');
const joinCode = el('joinCode');
const playerName = el('playerName');
const playerArea = el('playerArea');
const playerRoomCode = el('playerRoomCode');
const playerUI = el('playerUI');

let currentPublicState = null;
let myPlayerId = null;

createRoomBtn.addEventListener('click', () => {
  const gameKey = gameKeySel.value || 'sampleTrivia';
  socket.emit('host:createRoom', { gameKey });
});

startGameBtn.addEventListener('click', () => {
  if (!currentPublicState) return;
  socket.emit('host:startGame', { code: currentPublicState.code });
});

nextBtn.addEventListener('click', () => {
  if (!currentPublicState) return;
  socket.emit('game:event', {
    code: currentPublicState.code,
    type: 'host:next',
    payload: {}
  });
});

joinBtn.addEventListener('click', () => {
  const code = (joinCode.value || '').trim().toUpperCase();
  const name = (playerName.value || '').trim();
  socket.emit('player:join', { code, name });
});

socket.on('host:roomCreated', ({ code, games }) => {
  hostArea.style.display = 'block';
  roomCodeEl.textContent = code;
  joinUrlEl.textContent = `${window.location.origin}`;
  gameKeySel.innerHTML = games.map(g => `<option value="${g.key}">${g.name}</option>`).join('');
});

socket.on('room:state', (state) => {
  currentPublicState = state;
  if (!state) return;
  if (hostArea.style.display === 'block') {
    hostState.textContent = JSON.stringify(state, null, 2);
  }
  renderPlayer(state);
});

socket.on('player:joined', ({ code, playerId }) => {
  myPlayerId = playerId;
  playerArea.style.display = 'block';
  playerRoomCode.textContent = code;
});

socket.on('player:joinFailed', ({ reason }) => {
  alert('Join failed: ' + reason);
});

socket.on('room:ended', ({ reason }) => {
  alert('Room ended: ' + reason);
  location.reload();
});

function renderPlayer(state) {
  playerUI.innerHTML = '';
  if (!myPlayerId) return;

  // Minimal sample UI for sampleTrivia
  if (state.gameKey === 'sampleTrivia') {
    const container = document.createElement('div');
    const q = getTriviaQuestion(state);

    if (state.phase === 'lobby') {
      container.textContent = 'Waiting for host to start...';
    } else if (state.phase === 'question') {
      const p = document.createElement('p');
      p.textContent = q.q;
      container.appendChild(p);

      q.choices.forEach((choiceText, idx) => {
        const b = document.createElement('button');
        b.textContent = choiceText;
        b.onclick = () => {
          socket.emit('game:event', {
            code: state.code,
            type: 'answer:submit',
            payload: { choiceIndex: idx }
          });
        };
        container.appendChild(b);
      });
    } else if (state.phase === 'reveal') {
      const p = document.createElement('p');
      p.textContent = 'Correct answer: ' + q.choices[q.answerIndex];
      container.appendChild(p);
    } else if (state.phase === 'done') {
      container.textContent = 'Game over. Thanks for playing.';
    }

    playerUI.appendChild(container);
  }
}

function getTriviaQuestion(state) {
  const idx = state?.questionIndex ?? -1;
  const list = state?.questions || [];
  return idx >= 0 && idx < list.length ? list[idx] : { q: '', choices: [], answerIndex: 0 };
}
