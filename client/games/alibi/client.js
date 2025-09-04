/**
 * The Alibi — host-first UX
 * - Host shows rich visuals + timer + “check phones” cues for input phases.
 * - Players only see inputs during input phases; otherwise a “Look at the host screen” card.
 */

export const meta = {
  key: 'alibi',
  name: 'The Alibi',
  description: 'Improv a cover story. One criminal. Everyone else suspects.'
};

// Tiny helpers
function typewriter(el, text, speed=18) {
  el.textContent = '';
  let i = 0;
  function tick(){
    el.textContent = text.slice(0, i++);
    if (i <= text.length) requestAnimationFrame(tick);
  }
  tick();
}
function underline() {
  const u = document.createElement('div');
  u.className = 'alibi-underline';
  return u;
}
function infoCard(html) {
  const d = document.createElement('div'); d.className = 'item'; d.innerHTML = html; return d;
}

export function renderHost(ctx, state) {
  const { el } = ctx.helpers;
  const hostQ = el('hostQuestion');
  const feed  = el('hostFeed');

  function setHeadline(phaseLabel, title) {
    const tag = document.createElement('div');
    tag.className = 'alibi-sub';
    tag.textContent = phaseLabel.toUpperCase();

    const h = document.createElement('div');
    h.className = 'alibi-headline';
    typewriter(h, title);

    feed.appendChild(tag);
    feed.appendChild(h);
    feed.appendChild(underline());
  }

  // LOBBY
  if (state.phase === 'lobby') {
    hostQ.textContent = 'Waiting for VIP to start…';
    const row = document.createElement('div'); row.className = 'cta-row';
    const start = document.createElement('button'); start.className = 'btn vip'; start.textContent = 'Start game (VIP)';
    start.onclick = () => ctx.socket.emit('game:event', { code: state.code, type: 'vip:start' });
    row.appendChild(start);
    feed.appendChild(row);
    feed.appendChild(infoCard('<div class="vip-hint">First player is VIP and can start or skip tutorial.</div>'));
    return;
  }

  // TUTORIAL
  if (state.phase === 'tutorial') {
    setHeadline('Tutorial', 'How to play: The Alibi');
    // Keep it host-centric; players see “Look at the host screen”
    feed.appendChild(infoCard('Watch the host screen to learn the rules. The VIP can skip if everyone already knows how to play.'));
    const row = document.createElement('div'); row.className = 'cta-row';
    const skip = document.createElement('button'); skip.className = 'btn vip'; skip.textContent = 'Skip tutorial (VIP)';
    skip.onclick = () => ctx.socket.emit('game:event', { code: state.code, type: 'vip:skipTutorial' });
    row.appendChild(skip);
    feed.appendChild(row);
    return;
  }

  // BRIEF (criminal receives details)
  if (state.phase === 'brief') {
    setHeadline('Briefing', 'One player receives the secret details…');
    const c = state.crime || {};
    const grid = document.createElement('div'); grid.className = 'alibi-grid';
    [
      ['Location', c.location || '—'],
      ['Weapon',   c.weapon   || '—'],
      ['Motive',   c.motive   || '—']
    ].forEach(([k,v]) => {
      const card = document.createElement('div'); card.className='evidence-card';
      card.innerHTML = `<strong>${k}</strong>${v}`;
      grid.appendChild(card);
    });
    feed.appendChild(grid);
    feed.appendChild(infoCard('<div class="vip-hint">Everyone: Look at the host screen.</div>'));
    return;
  }

  // ALIBI (INPUT PHASE)
  if (state.phase === 'alibi') {
    setHeadline('Alibi', 'Write your alibi now');
    feed.appendChild(infoCard('<strong>Check your phones now.</strong><br>Write where you were and what you were doing.'));
    return;
  }

  // INTERROGATE (INPUT PHASE)
  if (state.phase === 'interrogate') {
    setHeadline('Interrogation', 'Ask one sharp question');
    feed.appendChild(infoCard('<strong>Check your phones now.</strong><br>Write a question that could trip someone up.'));
    // Show any questions as they arrive
    if (state.round?.questions) {
      state.round.questions.forEach(q => {
        const d = document.createElement('div'); d.className = 'item';
        d.textContent = `${q.name}: ${q.text}`;
        feed.appendChild(d);
      });
    }
    return;
  }

  // VOTE (INPUT PHASE)
  if (state.phase === 'vote') {
    setHeadline('Vote', 'Who is the criminal?');
    feed.appendChild(infoCard('<strong>Check your phones now.</strong><br>Pick the most suspicious player.'));
    return;
  }

  // REVEAL
  if (state.phase === 'reveal') {
    setHeadline('Reveal', 'Here is what really happened');
    const c = state.crime || {};
    const grid = document.createElement('div'); grid.className = 'alibi-grid';
    [
      ['Location', c.location || '—'],
      ['Weapon',   c.weapon   || '—'],
      ['Motive',   c.motive   || '—']
    ].forEach(([k,v]) => {
      const card = document.createElement('div'); card.className='evidence-card';
      card.innerHTML = `<strong>${k}</strong>${v}`;
      grid.appendChild(card);
    });
    feed.appendChild(grid);
    feed.appendChild(infoCard('<div class="vip-hint">Everyone: Look at the host screen.</div>'));
    return;
  }

  // DONE
  if (state.phase === 'done') {
    setHeadline('Game Over', 'Play again?');
    const row = document.createElement('div'); row.className = 'cta-row';
    const same = document.createElement('button'); same.className = 'btn'; same.textContent = 'Same players';
    const fresh= document.createElement('button'); fresh.className= 'btn'; fresh.textContent = 'New players';
    same.onclick = () => ctx.socket.emit('game:event', { code: state.code, type: 'host:restartSame' });
    fresh.onclick= () => ctx.socket.emit('game:event', { code: state.code, type: 'host:restartNew' });
    row.appendChild(same); row.appendChild(fresh);
    feed.appendChild(row);
    return;
  }
}

export function renderPlayer(ctx, state) {
  const { el } = ctx.helpers;
  const ui = el('playerUI');

  function watchHostCard(text='Look at the host screen') {
    const d = document.createElement('div'); d.className = 'item'; d.style.textAlign='center';
    d.innerHTML = `<div style="font-weight:900; font-size:18px; margin-bottom:6px;">${text}</div>
                   <div class="muted">Your device will prompt you when it’s your turn to type or vote.</div>`;
    ui.appendChild(d);
  }
  function textInput(placeholder, cta, evtType) {
    const wrap = document.createElement('div'); wrap.className = 'alibi-stage';
    const t = document.createElement('textarea'); t.placeholder = placeholder; t.spellcheck = false;
    const row = document.createElement('div'); row.className='cta-row';
    const b = document.createElement('button'); b.className='btn'; b.textContent = cta;
    b.onclick = () => ctx.socket.emit('game:event', { code: state.code, type: evtType, payload: { text: t.value } });
    row.appendChild(b); wrap.appendChild(t); wrap.appendChild(row);
    ui.appendChild(wrap);
    t.focus({ preventScroll: true });
  }
  function voteList() {
    const me = ctx.stateRef.myPlayerId;
    const others = (state.players || []).filter(p => p.id !== me);
    if (!others.length) return watchHostCard('Wait for the reveal…');
    const list = document.createElement('div'); list.className = 'list';
    others.forEach(p => {
      const btn = document.createElement('button'); btn.className = 'item'; btn.textContent = p.name;
      btn.onclick = () => ctx.socket.emit('game:event', { code: state.code, type: 'vote:submit', payload: { suspectId: p.id } });
      list.appendChild(btn);
    });
    ui.appendChild(list);
  }

  if (state.phase === 'lobby')         return watchHostCard('Waiting for VIP to start…');
  if (state.phase === 'tutorial')      return watchHostCard('Learn the rules');
  if (state.phase === 'brief')         return watchHostCard('Someone received a secret brief…');

  if (state.phase === 'alibi')         return textInput('Where were you at 10pm?', 'Submit alibi', 'alibi:submit');
  if (state.phase === 'interrogate')   return textInput('Ask one sharp question…', 'Submit question', 'interrogate:submit');
  if (state.phase === 'vote')          return voteList();

  if (state.phase === 'reveal')        return watchHostCard('The truth is being revealed…');
  if (state.phase === 'done')          return watchHostCard('Round finished');

  // Fallback
  return watchHostCard();
}

export function renderHostSettings(){ /* compact settings handled by shell */ }
