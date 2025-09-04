import { AudioManager } from "../../audio.js";

export const meta = {
  key: 'alibi',
  name: 'The Alibi',
  description: 'Improvised detective mystery with hidden roles.'
};

// Minimal host render: show phase line, and play audio per phase
export function renderHost(ctx, state) {
  const { el, isHost } = ctx;
  const hq = el('hostQuestion');
  hq.textContent = `Phase: ${state.phase}`;

  if (!isHost()) return;

  // Choose tracks for each phase — add your files under /public/audio/alibi/
  if (state.phase === 'lobby') {
    AudioManager.playMusic('/audio/alibi/lobby.mp3');
  } else if (state.phase === 'tutorial') {
    AudioManager.playMusic('/audio/alibi/tutorial.mp3');
    // Optional voice-over file: drop tutorial_voice.mp3 in /public/audio/alibi/
    AudioManager.playVoice('/audio/alibi/tutorial_voice.mp3');
  } else if (state.phase === 'brief') {
    // short in-between cue works too; otherwise keep previous track
  } else if (state.phase === 'alibi') {
    AudioManager.playMusic('/audio/alibi/interrogate.mp3'); // reuse if you have a dedicated alibi.mp3, change path
  } else if (state.phase === 'interrogate') {
    AudioManager.playMusic('/audio/alibi/interrogate.mp3');
    // Example: soft tick SFX on submit events: place sfx_tick.mp3 if you want and call AudioManager.playSfx('/audio/common/tick.mp3')
  } else if (state.phase === 'vote') {
    // build tension; reuse interrogate or add vote.mp3
    AudioManager.playMusic('/audio/alibi/interrogate.mp3');
  } else if (state.phase === 'reveal') {
    AudioManager.playMusic('/audio/alibi/reveal.mp3');
    AudioManager.playSfx('/audio/alibi/sfx_vote.mp3');
  } else if (state.phase === 'done') {
    // You can stop or play a victory loop
    AudioManager.playMusic('/audio/alibi/reveal.mp3');
  }
}

// Player render (kept minimal; real UI is elsewhere)
export function renderPlayer(ctx, state) {
  const { el } = ctx;
  const root = el('playerUI');
  const d = document.createElement('div'); d.className = 'item';
  d.textContent = `Playing: ${state.gameName || 'The Alibi'} — ${state.phase}`;
  root.appendChild(d);
}
