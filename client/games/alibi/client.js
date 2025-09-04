export const meta = {
  key: 'alibi',
  name: 'The Alibi',
  description: 'Improv a cover story. One criminal. Everyone else suspects.'
};

// small haptic helper
const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };

function typeLine(el, text, speed=18) {
  el.textContent = "";
  el.classList.add("tw-type");
  let i=0;
  const t = setInterval(()=> {
    el.textContent = text.slice(0, ++i);
    if (i >= text.length) { clearInterval(t); el.classList.remove("tw-type"); }
  }, speed);
  return t;
}

export function renderHost(ctx, state) {
  const { el } = ctx.helpers;
  const hostQ = el('hostQuestion');
  const feed = el('hostFeed');

  // Phase banner
  const banner = document.createElement('div');
  banner.className = 'phaseTag pop';
  banner.textContent = state.phase.toUpperCase();
  feed.appendChild(banner);

  if (state.phase === 'lobby') {
    const h = document.createElement('div'); h.className='question';
    h.textContent = 'Waiting for VIP to start…';
    feed.appendChild(h);
    const b = document.createElement('button'); b.className='btn glow'; b.textContent='Start game (VIP)';
    b.onclick = () => ctx.socket.emit('game:event', { code: state.code, type: 'vip:start' });
    feed.appendChild(b);
    return;
  }

  if (state.phase === 'tutorial') {
    const title = document.createElement('div'); title.className = 'question'; feed.appendChild(title);
    typeLine(title, 'How to play: The Alibi', 14);

    const slides = [
      'A crime occurred… Location, weapon, motive.',
      'One player is the criminal and gets a secret brief.',
      'Everyone writes an alibi. Funny yet plausible.',
      'Interrogate with one sharp question.',
      'Vote on who the criminal is.',
    ];
    let idx = 0;
    const slideEl = document.createElement('div'); slideEl.className='item spot'; feed.appendChild(slideEl);
    const dots = document.createElement('div'); dots.style.textAlign='center'; dots.style.marginTop='8px'; feed.appendChild(dots);

    function renderDots(i){
      dots.innerHTML = slides.map((_,j)=>`<span style="display:inline-block;width:8px;height:8px;border-radius:9999px;margin:0 4px;background:${i===j?'linear-gradient(90deg,#7c5cff,#32d6ff)':'rgba(255,255,255,.25)'}"></span>`).join('');
    }
    function next() {
      slideEl.classList.remove('shake'); slideEl.classList.add('pop');
      slideEl.textContent = slides[idx]; renderDots(idx);
      idx = (idx + 1) % slides.length;
    }
    next();
    const timer = setInterval(next, 2200); ctx._tutorialTimer = timer;

    // VIP skip (host screen)
    const row = document.createElement('div');
    row.style.display='flex'; row.style.justifyContent='center'; row.style.marginTop='10px';
    const skip = document.createElement('button'); skip.className='btn'; skip.textContent='Skip tutorial (VIP)';
    skip.onclick = () => ctx.socket.emit('game:event', { code: state.code, type: 'vip:skipTutorial' });
    row.appendChild(skip); feed.appendChild(row);
    return;
  }

  if (state.phase === 'brief') {
    const info = document.createElement('div'); info.className='item';
    info.textContent = 'Criminal is reading their brief…';
    feed.appendChild(info);
    return;
  }

  if (state.phase === 'alibi') {
    const q = document.createElement('div'); q.className='question';
    q.textContent = 'Write your alibi now!';
    feed.appendChild(q);
    // mini countdown
    const cd = document.createElement('div'); cd.className='countdown'; feed.appendChild(cd);
    let n = 3; cd.textContent = n;
    const t = setInterval(()=>{ n--; cd.textContent = n>0 ? n : 'Go!'; if (n<=0){ clearInterval(t); setTimeout(()=>cd.remove(),600);} }, 600);
    return;
  }

  if (state.phase === 'interrogate') {
    const q = document.createElement('div'); q.className='question';
    q.textContent = 'Write one pointed question…';
    feed.appendChild(q);
    if (state.round?.questions) {
      state.round.questions.forEach(q => {
        const d = document.createElement('div'); d.className = 'item';
        d.textContent = `${q.name}: ${q.text}`;
        feed.appendChild(d);
      });
    }
    return;
  }

  if (state.phase === 'vote') {
    const q = document.createElement('div'); q.className='question';
    q.textContent = 'Who is the criminal?';
    feed.appendChild(q);
    return;
  }

  if (state.phase === 'reveal') {
    const c = state.crime || {};
    const wrap = document.createElement('div'); wrap.className='item spot';
    const title = document.createElement('div'); title.className='question';
    title.textContent = 'Reveal';
    wrap.appendChild(title);
    const body = document.createElement('div');
    body.innerHTML = `Crime: <strong>${c.location}</strong>, <strong>${c.weapon}</strong>, motive <strong>${c.motive}</strong>`;
    wrap.appendChild(body);
    feed.appendChild(wrap);
    return;
  }

  if (state.phase === 'done') {
    const h = document.createElement('div'); h.className='question';
    h.textContent = 'Game Over';
    feed.appendChild(h);
    return;
  }
}

export function renderPlayer(ctx, state) {
  const { el, isVIP } = ctx.helpers;
  const ui = el('playerUI');

  // VIP controls on PHONE
  if (state.phase === 'lobby') {
    const d = document.createElement('div'); d.className='item';
    d.textContent = isVIP() ? 'You are VIP. You can start the game.' : 'Waiting for VIP to start…';
    ui.appendChild(d);

    // Mini lobby list on player devices
    const listWrap = document.createElement('div'); listWrap.className = 'list'; ui.appendChild(listWrap);
    const list = (state.playersInLobby && Array.isArray(state.playersInLobby) ? state.playersInLobby : (state.players || []));
    list.forEach(p => {
      const li = document.createElement('div'); li.className = 'item';
      li.textContent = p.name + (p.id === state.vipId ? ' ★VIP' : '');
      listWrap.appendChild(li);
    });

    if (isVIP()) {
      const b = document.createElement('button'); b.className='btn'; b.textContent='Start game (VIP)';
      b.onclick = () => { ctx.socket.emit('game:event', { code: state.code, type: 'vip:start' }); };
      ui.appendChild(b);
    }
    return;
  }

  if (state.phase === 'tutorial') {
    const t = document.createElement('div'); t.className = 'item';
    t.textContent = 'Tutorial playing on the host screen…';
    ui.appendChild(t);

    if (isVIP()) {
      const s = document.createElement('button'); s.className='btn'; s.textContent='Skip tutorial (VIP)';
      s.onclick = () => ctx.socket.emit('game:event', { code: state.code, type: 'vip:skipTutorial' });
      ui.appendChild(s);
    }
    return;
  }

  if (state.phase === 'alibi') {
    const ta = document.createElement('textarea'); ta.placeholder = 'Where were you at 10pm?'; ta.className='pop';
    const b = document.createElement('button'); b.className='btn'; b.textContent = 'Submit alibi';
    b.onclick = () => { ctx.socket.emit('game:event', { code: state.code, type: 'alibi:submit', payload: { text: ta.value } }); vibrate(20); };
    ui.appendChild(ta); ui.appendChild(b);
    return;
  }

  if (state.phase === 'interrogate') {
    const ta = document.createElement('textarea'); ta.placeholder = 'Ask one sharp question…'; ta.className='pop';
    const b = document.createElement('button'); b.className='btn'; b.textContent = 'Submit question';
    b.onclick = () => { ctx.socket.emit('game:event', { code: state.code, type: 'interrogate:submit', payload: { text: ta.value } }); vibrate(20); };
    ui.appendChild(ta); ui.appendChild(b);
    return;
  }

  if (state.phase === 'vote') {
    const me = ctx.stateRef.myPlayerId;
    const others = (state.players || []).filter(p => p.id !== me);
    const list = document.createElement('div'); list.className = 'list';
    others.forEach(p => {
      const btn = document.createElement('button'); btn.className = 'item';
      btn.textContent = p.name;
      btn.onclick = () => { ctx.socket.emit('game:event', { code: state.code, type: 'vote:submit', payload: { suspectId: p.id } }); vibrate([20,40]); };
      list.appendChild(btn);
    });
    ui.appendChild(list);
    return;
  }

  if (state.phase === 'reveal') {
    const d = document.createElement('div'); d.className = 'item';
    d.textContent = 'Revealing…';
    ui.appendChild(d);
    return;
  }

  if (state.phase === 'done') {
    const d = document.createElement('div'); d.className = 'item';
    d.textContent = 'Round finished.';
    ui.appendChild(d);
    return;
  }
}

export function renderHostSettings() { /* no-op (compact shell renders) */ }
