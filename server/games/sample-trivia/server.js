export const sampleTrivia = {
  key: 'sampleTrivia',
  name: 'Sample Trivia',
  minPlayers: 1,
  maxPlayers: 8,
  createInitialState() {
    return {
      phase: 'lobby',
      questionIndex: -1,
      questions: [
        { q: 'What is 2 + 2?', choices: ['3', '4', '5'], answerIndex: 1 },
        { q: 'Capital of France?', choices: ['Rome', 'Paris', 'Berlin'], answerIndex: 1 }
      ],
      answers: {}
    };
  },
  onStart(room) {
    const state = room.gameState;
    state.phase = 'question';
    state.questionIndex = 0;
    state.answers = {};
  },
  onEvent(room, { socketId, type, payload }) {
    const s = room.gameState;
    if (s.phase === 'question' && type === 'answer:submit') {
      s.answers[socketId] = payload.choiceIndex;
      if (Object.keys(s.answers).length >= room.players.length) {
        s.phase = 'reveal';
      }
    } else if (s.phase === 'reveal' && type === 'host:next') {
      if (s.questionIndex + 1 < s.questions.length) {
        s.questionIndex++;
        s.phase = 'question';
        s.answers = {};
      } else {
        s.phase = 'done';
      }
    }
  }
};
