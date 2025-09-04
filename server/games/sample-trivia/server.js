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
      answers: {} // playerId -> choiceIndex
    };
  },
  onStart(room) {
    const state = room.gameState;
    state.phase = 'question';
    state.questionIndex = 0;
    state.answers = {};
  },
  onEvent(room, { socketId, type, payload }) {
    const state = room.gameState;
    if (state.phase === 'question' && type === 'answer:submit') {
      state.answers[socketId] = payload.choiceIndex;
      // When all present players have answered, advance
      if (Object.keys(state.answers).length >= room.players.length) {
        state.phase = 'reveal';
      }
    } else if (state.phase === 'reveal' && type === 'host:next') {
      if (state.questionIndex + 1 < state.questions.length) {
        state.questionIndex++;
        state.phase = 'question';
        state.answers = {};
      } else {
        state.phase = 'done';
      }
    }
  }
};
