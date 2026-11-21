// SOLMAR — entry program for the make.fun gta6-01 bounty.
// Copies the playable game (game/) and its screenshots (screenshots/) into the
// output directory and writes the dossier the judge reads, using the kit's own
// library (vendor/makefun-game.ts) with the gate's caps, so the dossier handed
// in is byte for byte the one the scorer rebuilds from the same files.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const root = dirname(fileURLToPath(import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, 'game'), join(out, 'game'), { recursive: true });
cpSync(join(root, 'screenshots'), join(out, 'screenshots'), { recursive: true });

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);
console.log(`solmar: game/, screenshots/ and dossier.json (${dossier.length} bytes) written to ${out}`);
