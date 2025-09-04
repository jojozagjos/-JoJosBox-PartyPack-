import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load any server.js under server/games/<key>/server.js
export async function loadGamesRegistry() {
  const gamesDir = path.join(__dirname, '..');
  let entries = [];
  try {
    entries = await fs.promises.readdir(gamesDir, { withFileTypes: true });
  } catch (e) {
    // If games directory missing, return empty registry gracefully
    return {};
  }

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
    // Accept common export names
    const game = mod.game || mod.default || mod.alibiGame || (mod[Object.keys(mod)[0]]);
    if (!game?.key) {
      console.warn(`[games] Skipping ${ent.name}: no .key export`);
      continue;
    }
    registry[game.key] = game;
  }
  return registry;
}
