let currentMusic = null;
let currentTitle = "";
let currentPath = "";
let enabled = false;          // host toggles this on via UI
let unlocked = false;         // becomes true after a user gesture
let musicVolume = 0.6;
let sfxVolume = 0.9;

let changeListener = null;
function onChange() {
  if (typeof changeListener === 'function') {
    changeListener({ kind: 'music', title: currentTitle, path: currentPath, enabled, unlocked, isPlaying: !!currentMusic });
  }
}

function tryPlay(audio) {
  if (!enabled || !unlocked) return Promise.reject('audio disabled/unlocked');
  return audio.play().catch(() => {});
}
function stop(el) { try { el.pause(); el.currentTime = 0; } catch {} }

function titleFromPath(path) {
  try {
    const base = path.split('/').pop() || '';
    const noExt = base.replace(/\.[a-z0-9]+$/i, '');
    return noExt
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, c => c.toUpperCase());
  } catch { return ''; }
}

export const AudioManager = {
  isEnabled(){ return enabled; },
  setEnabled(on){ enabled = !!on; if (!on) this.stopMusic(); onChange(); },

  async unlockWithGesture() {
    unlocked = true;
    try { const a = new Audio(); a.src = ''; await a.play().catch(()=>{}); a.pause(); } catch {}
    onChange();
    return unlocked;
  },

  onChange(fn){ changeListener = fn; },

  playMusic(path, { loop = true, volume = musicVolume, title } = {}) {
    if (currentMusic) { stop(currentMusic); currentMusic = null; }
    currentPath = path || "";
    currentTitle = title || titleFromPath(path || "");
    if (!enabled || !unlocked) { onChange(); return; }
    const audio = new Audio(path);
    audio.loop = loop;
    audio.volume = volume;
    tryPlay(audio);
    currentMusic = audio;
    onChange();
  },

  stopMusic() {
    if (currentMusic) { stop(currentMusic); currentMusic = null; }
    currentTitle = ""; currentPath = "";
    onChange();
  },

  playSfx(path, { volume = sfxVolume } = {}) {
    if (!enabled || !unlocked) return;
    const s = new Audio(path);
    s.volume = volume;
    tryPlay(s);
  },

  playVoice(path, { volume = 1.0 } = {}) {
    if (!enabled || !unlocked) return null;
    const v = new Audio(path);
    v.volume = volume;
    tryPlay(v);
    return v;
  }
};
