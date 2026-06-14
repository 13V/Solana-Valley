// Downloads the free Sprout Lands art pack (by Cup Nooble) used for the game's
// visuals. The art is NOT committed to this repo (its license restricts
// redistribution) — it is fetched on demand from a public mirror. See
// app/public/assets/sprout/CREDITS.md. Review the pack's license before shipping:
// https://cupnooble.itch.io/sprout-lands-asset-pack
import { mkdir, writeFile, access } from 'node:fs/promises';

const BASE =
  'https://media.githubusercontent.com/media/perquis/sprout_lands/main/assets/packages/sprites_basic_pack';
const OUT = new URL('../app/public/assets/sprout/', import.meta.url);

const FILES = {
  'grass.png': 'Tilesets/Grass/Grass.png',
  'tilled.png': 'Tilesets/Tilled Dirt/Tilled Dirt.png',
  'water.png': 'Tilesets/Water.png',
  'hills.png': 'Tilesets/Hills/Hills.png',
  'fences.png': 'Tilesets/Fences/Fences.png',
  'house.png': 'Tilesets/Wooden House.png',
  'character.png': 'Characters/Basic Charakter Spritesheet/Basic Charakter Spritesheet.png',
  'actions.png': 'Characters/Basic Charakter Actions/Basic Charakter Actions.png',
  'tools.png': 'Characters/Tools/Tools.png',
  'plants.png': 'Objects/Basic Plants/Basic Plants.png',
  'biome.png': 'Objects/Basic Grass Biom things/Basic Grass Biom things 1.png',
  'paths.png': 'Objects/Paths/Paths.png',
};

const force = process.argv.includes('--force');
await mkdir(OUT, { recursive: true });

let ok = 0;
for (const [local, remote] of Object.entries(FILES)) {
  const dest = new URL(local, OUT);
  if (!force) {
    try {
      await access(dest);
      console.log('skip (exists)', local);
      ok++;
      continue;
    } catch {
      /* not present, download */
    }
  }
  const url = `${BASE}/${remote.split('/').map(encodeURIComponent).join('/')}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error('FAIL', res.status, remote);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(dest, buf);
    console.log('saved', local, `${buf.length} bytes`);
    ok++;
  } catch (err) {
    // Never fail the install/build over an art download — the game still runs
    // (with placeholder rects for missing textures); just warn.
    console.error('WARN could not fetch', local, String(err?.message ?? err));
  }
}
console.log(`done: ${ok}/${Object.keys(FILES).length} assets ready`);
