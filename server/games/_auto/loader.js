import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

// Load any server.js under server/games/<key>/server.js
export async function loadGamesRegistry() {
  const gamesDir = path.join(__dirname, '..');
  const entries = await fs.promises.readdir(gamesDir, { withFileTypes: true });
  const registry = {};
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (ent.name.startsWith('_')) continue;
    const serverJs = path.join(gamesDir, ent.name, 'server.js');
    try {
      await fs.promises.access(serverJs, fs.constants.R_OK);
    } catch {
      continue;
    }
    const mod = await import(pathToFileURL(serverJs).href);
    // each server module must export an object with .key (unique)
    const game = mod.alibiGame || mod.game || mod.default || mod[Object.keys(mod)[0]];
    if (!game?.key) {
      console.warn(`[games] Skipping ${ent.name}: no .key export`);
      continue;
    }
    registry[game.key] = game;
  }
  return registry;
}
