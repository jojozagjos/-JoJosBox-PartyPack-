function clearTimer(t) { if (t) clearTimeout(t); }

export const sampleTrivia = {
  key: 'sampleTrivia',
  name: 'Sample Trivia',
  minPlayers: 1,
  maxPlayers: 12,

  createInitialState() {
    return {
      phase: 'lobby',
      questionIndex: -1,
      perQuestionMs: 20000,
      revealMs: 4000,
      questions: [
        { q: 'What is 2 + 2?', choices: ['3', '4', '5'], answerIndex: 1 },
        { q: 'Capital of France?', choices: ['Rome', 'Paris', 'Berlin'], answerIndex: 1 },
        { q: 'RGB stands for?', choices: ['Red Green Blue', 'Right Good Better', 'Real Graph Bits'], answerIndex: 0 }
      ],
      answers: {},           // socketId -> { choiceIndex, timeTakenMs }
      questionStartAt: null, // ms
      questionDeadline: null,// ms
      questionTimeout: null,
      revealEndsAt: null,    // ms
      revealTimeout: null
    };
  },

  // Sanitized public state. Do not leak future answers.
  public(room) {
    const s = room.gameState;
    const q = s.questionIndex >= 0 ? s.questions[s.questionIndex] : null;

    // Build a sorted leaderboard from room.players
    const leaderboard = [...room.players]
      .map(p => ({ id: p.id, name: p.name, score: p.score || 0 }))
      .sort((a, b) => b.score - a.score);

    return {
      phase: s.phase,
      questionIndex: s.questionIndex,
      currentQuestion: q ? { q: q.q, choices: q.choices } : null,
      // Only reveal the answer during reveal/done
      answerIndex: s.phase === 'reveal' || s.phase === 'done' ? q?.answerIndex ?? null : null,
      answeredCount: Object.keys(s.answers || {}).length,
      totalPlayers: room.players.length,
      timer: {
        now: Date.now(),
        deadline: s.questionDeadline,
        revealEndsAt: s.revealEndsAt,
        perQuestionMs: s.perQuestionMs,
        revealMs: s.revealMs
      },
      leaderboard
    };
  },

  onStart(room) {
    const s = room.gameState;
    // Reset scores
    room.players.forEach(p => p.score = 0);
    s.phase = 'question';
    s.questionIndex = 0;
    s.answers = {};
    s.questionStartAt = Date.now();
    s.questionDeadline = s.questionStartAt + s.perQuestionMs;

    clearTimer(s.questionTimeout);
    s.questionTimeout = setTimeout(() => {
      this._moveToReveal(room);
    }, s.perQuestionMs);

    room._notify();
  },

  onEvent(room, { socketId, type, payload }) {
    const s = room.gameState;

    if (type === 'answer:submit' && s.phase === 'question') {
      // Ignore duplicate answers
      if (s.answers[socketId]) return;
      const timeTakenMs = Math.max(0, Date.now() - (s.questionStartAt || Date.now()));
      s.answers[socketId] = { choiceIndex: payload.choiceIndex, timeTakenMs };

      // If all players have answered, move immediately to reveal
      if (Object.keys(s.answers).length >= room.players.length) {
        this._moveToReveal(room);
      } else {
        room._notify();
      }
    }

    // Allow host to restart in 'done' if desired (future use)
    if (type === 'host:restart' && s.phase === 'done' && socketId === room.ownerSocketId) {
      this.onStart(room);
    }
  },

  _moveToReveal(room) {
    const s = room.gameState;
    if (s.phase !== 'question') return;

    clearTimer(s.questionTimeout);

    // Score awarding
    const q = s.questions[s.questionIndex];
    for (const p of room.players) {
      const ans = s.answers[p.id];
      if (!ans) continue;
      const correct = ans.choiceIndex === q.answerIndex;
      if (correct) {
        const remaining = Math.max(0, (s.perQuestionMs - ans.timeTakenMs));
        const bonus = Math.round(500 * (remaining / s.perQuestionMs)); // up to +500 for speed
        p.score = (p.score || 0) + 1000 + bonus;
      } else {
        // Optional consolation
        p.score = (p.score || 0);
      }
    }

    s.phase = 'reveal';
    s.revealEndsAt = Date.now() + s.revealMs;

    clearTimer(s.revealTimeout);
    s.revealTimeout = setTimeout(() => {
      this._advance(room);
    }, s.revealMs);

    room._notify();
  },

  _advance(room) {
    const s = room.gameState;
    if (s.phase !== 'reveal') return;

    // Next question or done
    if (s.questionIndex + 1 < s.questions.length) {
      s.phase = 'question';
      s.questionIndex++;
      s.answers = {};
      s.questionStartAt = Date.now();
      s.questionDeadline = s.questionStartAt + s.perQuestionMs;

      clearTimer(s.questionTimeout);
      s.questionTimeout = setTimeout(() => {
        this._moveToReveal(room);
      }, s.perQuestionMs);
    } else {
      s.phase = 'done';
      clearTimer(s.questionTimeout);
      clearTimer(s.revealTimeout);
    }

    room._notify();
  },

  onDispose(room) {
    const s = room.gameState;
    clearTimer(s?.questionTimeout);
    clearTimer(s?.revealTimeout);
  }
};
