function clearTimer(t){ if(t) clearTimeout(t); }

const LOCATIONS = ['the museum','Riverside Park','old train yard','Seaside Motel','Moonlight Diner','city library'];
const WEAPONS   = ['candlestick','wrench','rope','antique pistol','poison','lead pipe'];
const MOTIVES   = ['jealousy','money','revenge','cover-up','panic','blackmail'];

function randItem(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

export const alibiGame = {
  key: 'alibi',
  name: 'The Alibi',
  description: 'Improvised detective mystery. One player is secretly the criminal. Everyone writes alibis, asks questions, and then votes.',
  minPlayers: 1,
  maxPlayers: 12,

  // Show only the fields we want editable
  settingsSchema: {
    // NOT editable:
    tutorialMs:   { label: 'Tutorial',    type: 'number', min: 3000,  max: 60000,  step: 1000, editable: false },
    briefMs:      { label: 'Brief',       type: 'number', min: 3000,  max: 15000,  step: 1000, editable: false },
    revealMs:     { label: 'Reveal',      type: 'number', min: 3000,  max: 15000,  step: 1000, editable: false },
    // Editable (host can tune these, but we’ll render in seconds in the client):
    alibiMs:      { label: 'Alibi time',  type: 'number', min: 10000, max: 90000,  step: 5000, editable: true },
    interrogateMs:{ label: 'Questions',   type: 'number', min: 10000, max: 90000,  step: 5000, editable: true },
    voteMs:       { label: 'Voting',      type: 'number', min: 5000,  max: 60000,  step: 5000, editable: true }
  },

  defaultSettings: {
    tutorialMs: 10000,
    briefMs: 6000,
    alibiMs: 45000,
    interrogateMs: 30000,
    voteMs: 20000,
    revealMs: 6000
  },

  createInitialState(){
    return {
      phase: 'lobby',
      settings: { ...this.defaultSettings },
      crime: null,
      criminalId: null,
      alibis: {},
      questions: {},
      votes: {},
      phaseDeadline: null,
      _timeout: null
    };
  },

  public(room){
    const s = room.gameState;
    const votesCount = {};
    for(const [voter, suspect] of Object.entries(s.votes || {})){
      if(!suspect) continue;
      votesCount[suspect] = (votesCount[suspect] || 0) + 1;
    }
    return {
      phase: s.phase,
      phaseDeadline: s.phaseDeadline,
      settings: s.settings,
      playersInLobby: room.players.map(p => ({ id:p.id, name:p.name })),
      vipId: room.vipId,
      crime: (s.phase === 'reveal' || s.phase === 'done') ? s.crime : null,
      criminalId: (s.phase === 'reveal' || s.phase === 'done') ? s.criminalId : null,
      round: {
        alibis: s.phase !== 'lobby' && s.phase !== 'tutorial' ? mapTexts(room.players, s.alibis) : null,
        questions: (['interrogate','vote','reveal','done'].includes(s.phase)) ? mapTexts(room.players, s.questions) : null,
        votesCount: (s.phase === 'reveal' || s.phase === 'done') ? votesCount : null
      }
    };
  },

  onStart(room){
    const s = room.gameState;
    if (room.players.length < this.minPlayers) return;
    s.alibis = {}; s.questions = {}; s.votes = {};
    s.crime = { location: randItem(LOCATIONS), weapon: randItem(WEAPONS), motive: randItem(MOTIVES) };
    const idx = Math.floor(Math.random()*room.players.length);
    s.criminalId = room.players[idx].id;
    const brief = `Keep it cool. Stick to: ${s.crime.location}, ${s.crime.weapon}, motive ${s.crime.motive}.`;
    room._send(s.criminalId, 'alibi:brief', { brief, crime: s.crime });
    this._goto(room, 'tutorial', s.settings.tutorialMs);
  },

  onEvent(room, { socketId, type, payload }){
    const s = room.gameState;

    if (type === 'host:updateSettings' && room.ownerSocketId === socketId && s.phase === 'lobby') {
      s.settings = sanitizeSettings(payload || {}, this.defaultSettings, this.settingsSchema);
      room._notify();
      return;
    }

    if (type === 'vip:start' && socketId === room.vipId && s.phase === 'lobby') {
      this.onStart(room);
      return;
    }

    if (type === 'vip:skipTutorial' && socketId === room.vipId && s.phase === 'tutorial') {
      this._goto(room, 'brief', s.settings.briefMs);
      return;
    }

    if (s.phase === 'alibi' && type === 'alibi:submit') {
      s.alibis[socketId] = (payload?.text || '').slice(0, 500);
      if (Object.keys(s.alibis).length >= room.players.length) {
        this._goto(room, 'interrogate', s.settings.interrogateMs);
      } else {
        room._notify();
      }
      return;
    }

    if (s.phase === 'interrogate' && type === 'interrogate:submit') {
      s.questions[socketId] = (payload?.text || '').slice(0, 200);
      if (Object.keys(s.questions).length >= room.players.length) {
        this._goto(room, 'vote', s.settings.voteMs);
      } else {
        room._notify();
      }
      return;
    }

    if (s.phase === 'vote' && type === 'vote:submit') {
      const target = payload?.suspectId;
      if (target && target !== socketId && room.players.find(p => p.id === target)) {
        s.votes[socketId] = target;
        if (Object.keys(s.votes).length >= room.players.length) {
          this._goto(room, 'reveal', s.settings.revealMs, () => this._goto(room, 'done', 0));
        } else {
          room._notify();
        }
      }
      return;
    }

    if (s.phase === 'done' && socketId === room.ownerSocketId) {
      if (type === 'host:restartSame') {
        room.vipId = room.players[0]?.id || null;
        s.alibis = {}; s.questions = {}; s.votes = {}; s.criminalId = null; s.crime = null;
        s.phase = 'lobby'; s.phaseDeadline = null; clearTimer(s._timeout);
        room._notify();
        return;
      }
      if (type === 'host:restartNew') {
        room.players = []; room.vipId = null;
        s.alibis = {}; s.questions = {}; s.votes = {}; s.criminalId = null; s.crime = null;
        s.phase = 'lobby'; s.phaseDeadline = null; clearTimer(s._timeout);
        room._notify();
        return;
      }
    }
  },

  _goto(room, phase, ms, onAfter){
    const s = room.gameState;
    clearTimer(s._timeout);
    s.phase = phase;
    s.phaseDeadline = ms ? Date.now() + ms : null;
    s._timeout = ms ? setTimeout(() => {
      if (phase === 'tutorial')         this._goto(room, 'brief', s.settings.briefMs);
      else if (phase === 'brief')       this._goto(room, 'alibi', s.settings.alibiMs);
      else if (phase === 'alibi')       this._goto(room, 'interrogate', s.settings.interrogateMs);
      else if (phase === 'interrogate') this._goto(room, 'vote', s.settings.voteMs);
      else if (phase === 'vote')        this._goto(room, 'reveal', s.settings.revealMs, () => this._goto(room, 'done', 0));
      else if (phase === 'reveal')      this._goto(room, 'done', 0);
      if (onAfter) onAfter();
      room._notify();
    }, ms) : null;
    room._notify();
  },

  onDispose(room){
    const s = room.gameState;
    clearTimer(s?._timeout);
  }
};

function mapTexts(players, dict){
  const byId = Object.fromEntries(players.map(p => [p.id, p]));
  return Object.entries(dict).map(([pid, text]) => ({
    id: pid, name: byId[pid]?.name || 'Player', text
  }));
}

function sanitizeSettings(raw, defaults, schema){
  const out = { ...defaults };
  for (const [key, meta] of Object.entries(schema || {})) {
    if (!meta.editable) continue; // ignore non-editable fields
    let v = Number(raw[key]);
    if (!Number.isFinite(v)) continue;
    const min = Number.isFinite(meta.min) ? meta.min : 3000;
    const max = Number.isFinite(meta.max) ? meta.max : 180000;
    v = Math.max(min, Math.min(max, v));
    out[key] = v;
  }
  return out;
}
