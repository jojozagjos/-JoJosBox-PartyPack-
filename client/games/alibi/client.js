export const meta = {
  key: 'alibi',
  name: 'The Alibi',
  description: 'Improvised detective mystery. One player is the criminal. Alibis → Interrogation → Vote → Reveal.'
};

export function renderHost(ctx, state) {
  const { el, show, escapeHtml } = ctx;
  const lobbyBlock = el('lobbyBlock'), lobbyPlayers = el('lobbyPlayers');
  const hostQuestion = el('hostQuestion'), hostFeed = el('hostFeed');
  const endOptions = el('endOptions');

  // Lobby players list and VIP badge (during lobby and tutorial)
  lobbyPlayers.innerHTML = '';
  if (state.phase === 'lobby' || state.phase === 'tutorial') {
    show(lobbyBlock, true);
    (state.playersInLobby || []).forEach(p => {
      const d = document.createElement('div'); d.className = 'pill2';
      d.textContent = p.name + (p.id === state.vipId ? ' ★VIP' : '');
      lobbyPlayers.appendChild(d);
    });
  } else {
    show(lobbyBlock, false);
  }

  // Host feed & question
  hostQuestion.textContent = '';
  hostFeed.innerHTML = '';
  show(endOptions, state.phase === 'done');

  if (state.phase === 'lobby') {
    hostQuestion.textContent = 'Waiting for VIP to start…';
    return;
  }
  if (state.phase === 'tutorial') {
    hostQuestion.textContent = 'How to play';
    hostFeed.innerHTML = `
      <div class="item">1. One player is secretly the criminal.</div>
      <div class="item">2. Everyone writes an alibi consistent with the facts.</div>
      <div class="item">3. Submit one question to interrogate the suspects.</div>
      <div class="item">4. Vote on who the criminal is.</div>
    `;
    return;
  }
  if (state.phase === 'alibi') {
    hostQuestion.textContent = 'Write your alibi.';
    (state.round?.alibis || []).forEach(entry => {
      const it = document.createElement('div'); it.className='item';
      it.innerHTML = `<strong>${escapeHtml(entry.name)}</strong> — submitted`;
      hostFeed.appendChild(it);
    });
    return;
  }
  if (state.phase === 'interrogate') {
    hostQuestion.textContent = 'Interrogation questions:';
    (state.round?.questions || []).forEach(entry => {
      const it = document.createElement('div'); it.className='item';
      it.innerHTML = `<strong>${escapeHtml(entry.name)}</strong>: ${escapeHtml(entry.text)}`;
      hostFeed.appendChild(it);
    });
    return;
  }
  if (state.phase === 'vote') {
    hostQuestion.textContent = 'Vote: who is the criminal?';
    return;
  }
  if (state.phase === 'reveal') {
    hostQuestion.innerHTML = `The criminal was <strong>${nameOf(state.criminalId)}</strong>.<br>
Crime: ${state.crime.location}, ${state.crime.weapon}, motive ${state.crime.motive}.`;
    const counts = state.round?.votesCount || {};
    Object.entries(counts).sort((a,b)=>b[1]-a[1]).forEach(([pid, n]) => {
      const it = document.createElement('div'); it.className='item';
      it.innerHTML = `${escapeHtml(nameOf(pid))}: ${n} vote(s)`;
      hostFeed.appendChild(it);
    });
  }
  function nameOf(pid){
    const p = (state.players || []).find(x => x.id === pid);
    return p ? p.name : 'Unknown';
  }
}

export function renderHostSettings(ctx, state) {
  // Example: settings inputs already exist in DOM; keep SDK minimal.
  // If a game had custom settings UI, it could render here.
}

export function renderPlayer(ctx, state) {
  const { el, show, escapeHtml, socket, stateRef, isVIP } = ctx;
  const playerUI = el('playerUI');

  playerUI.innerHTML = '';
  if (state.phase === 'lobby') {
    const p = document.createElement('p'); p.className='muted';
    p.textContent = isVIP() ? 'You are VIP. Tap to start when ready.' : 'Waiting for VIP to start…';
    playerUI.appendChild(p);
    if (isVIP()) {
      const b = document.createElement('button'); b.className='btn'; b.textContent='Start game';
      b.onclick = () => socket.emit('game:event', { code: state.code, type: 'vip:start' });
      playerUI.appendChild(b);
    }
    return;
  }
  if (state.phase === 'tutorial') {
    const steps = [
      'One of you is secretly the criminal.',
      'Write an alibi consistent with the facts.',
      'Interrogate with one question.',
      'Vote on who the criminal is.'
    ];
    const list = document.createElement('div'); list.className='list';
    steps.forEach(t => {
      const it = document.createElement('div'); it.className='item'; it.textContent = t;
      list.appendChild(it);
    });
    playerUI.appendChild(list);
    if (isVIP()) {
      const b = document.createElement('button'); b.className='btn'; b.textContent='Skip tutorial';
      b.onclick = () => socket.emit('game:event', { code: state.code, type: 'vip:skipTutorial' });
      playerUI.appendChild(document.createElement('br'));
      playerUI.appendChild(b);
    }
    return;
  }
  if (state.phase === 'alibi') {
    const ta = document.createElement('textarea');
    ta.placeholder = 'Where were you at 10pm? Who saw you? Keep it consistent…';
    const btn = document.createElement('button'); btn.className='btn'; btn.textContent='Submit alibi';
    btn.onclick = () => {
      const text = (ta.value || '').trim();
      if (!text) return;
      btn.disabled = true;
      socket.emit('game:event', { code: state.code, type: 'alibi:submit', payload: { text } });
      playerUI.innerHTML = '<div class="item">Alibi submitted.</div>';
    };
    playerUI.append(ta, document.createElement('br'), btn);
    return;
  }
  if (state.phase === 'interrogate') {
    const ta = document.createElement('textarea');
    ta.placeholder = 'Write one question to interrogate the suspects…';
    const btn = document.createElement('button'); btn.className='btn'; btn.textContent='Submit question';
    btn.onclick = () => {
      const text = (ta.value || '').trim();
      if (!text) return;
      btn.disabled = true;
      socket.emit('game:event', { code: state.code, type: 'interrogate:submit', payload: { text } });
      playerUI.innerHTML = '<div class="item">Question submitted.</div>';
    };
    playerUI.append(ta, document.createElement('br'), btn);
    return;
  }
  if (state.phase === 'vote') {
    const title = document.createElement('div'); title.className='question'; title.textContent='Vote: who is the criminal?';
    const list = document.createElement('div'); list.className='choices';
    (state.players || []).forEach(p => {
      if (p.id === stateRef.myPlayerId) return;
      const b = document.createElement('button'); b.className='btn'; b.textContent = p.name;
      b.onclick = () => {
        list.querySelectorAll('button').forEach(x => x.disabled = true);
        socket.emit('game:event', { code: state.code, type: 'vote:submit', payload: { suspectId: p.id } });
        el('playerUI').innerHTML = '<div class="item">Vote submitted.</div>';
      };
      list.appendChild(b);
    });
    playerUI.append(title, list);
    return;
  }
  if (state.phase === 'reveal') {
    const p = document.createElement('div'); p.className='item'; p.textContent='Revealing the culprit…';
    playerUI.appendChild(p);
    return;
  }
  if (state.phase === 'done') {
    const p = document.createElement('div'); p.className='item';
    p.textContent = 'Round complete. Waiting for host to choose next step.'; playerUI.appendChild(p);
  }
}
