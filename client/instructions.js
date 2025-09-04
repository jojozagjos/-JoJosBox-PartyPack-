/**
 * Minimal, video-like tutorial overlay.
 * window.instructions.open(gameKey?)   -> show & autoplay steps
 * window.instructions.close()          -> hide
 */
(function(){
  const el = (sel, root=document) => root.querySelector(sel);

  // Build DOM once
  const overlay = document.createElement('div'); overlay.className = 'instr-overlay'; overlay.setAttribute('aria-hidden','true');
  overlay.innerHTML = `
    <div class="instr-stage" role="dialog" aria-label="How to play tutorial">
      <div class="instr-card">
        <div class="instr-head">
          <div class="instr-title">How to play</div>
          <button class="instr-btn" id="instrSkip">Skip</button>
        </div>
        <div class="instr-steps" id="instrSteps"></div>
        <div class="instr-foot">
          <div class="instr-muted" id="instrHint">Autoplay is on</div>
          <div>
            <button class="instr-btn" id="instrReplay">Replay</button>
            <button class="instr-btn" id="instrClose">Close</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const stepsEl   = el('#instrSteps', overlay);
  const btnSkip   = el('#instrSkip', overlay);
  const btnClose  = el('#instrClose', overlay);
  const btnReplay = el('#instrReplay', overlay);

  // Default generic steps; you can tailor per gameKey
  function stepsFor(gameKey){
    switch(gameKey){
      // Example: customise per game if you like
      // case 'alibi': return [ ... ];
      default:
        return [
          {emoji:'Ì≥±', text:'Use your phone to join the room. Enter the 4-letter code and your name.'},
          {emoji:'‚úçÔ∏è', text:'Read the prompt on your device and submit your best answer on time.'},
          {emoji:'‚úÖ', text:'Vote for your favorite entries. Highest score wins the round.'}
        ];
    }
  }

  let timer = null, idx = 0, seq = [];
  function renderStep(i){
    stepsEl.innerHTML = '';
    const s = seq[i]; if(!s) return;
    const step = document.createElement('div'); step.className = 'instr-step';
    step.innerHTML = `<div class="bubble"><span class="instr-emoji">${s.emoji}</span>${s.text}</div>`;
    stepsEl.appendChild(step);
  }
  function play(){
    clearInterval(timer);
    renderStep(idx=0);
    timer = setInterval(()=>{
      idx++;
      if(idx >= seq.length){
        clearInterval(timer);
        el('#instrHint', overlay).textContent = 'Tutorial ended';
        return;
      }
      renderStep(idx);
    }, 2200); // advance every ~2.2s
  }

  function open(gameKey){
    seq = stepsFor(gameKey);
    overlay.style.display = 'block';
    overlay.setAttribute('aria-hidden','false');
    el('#instrHint', overlay).textContent = 'Autoplay is on';
    play();
  }
  function close(){
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden','true');
    clearInterval(timer);
  }

  btnSkip.addEventListener('click', close);
  btnClose.addEventListener('click', close);
  btnReplay.addEventListener('click', play);

  window.instructions = { open, close };
})();
