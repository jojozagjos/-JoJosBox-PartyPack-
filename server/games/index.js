// server/games/index.js
import { sampleTrivia } from './sample-trivia/server.js';

export const gamesRegistry = {
  [sampleTrivia.key]: sampleTrivia
};
