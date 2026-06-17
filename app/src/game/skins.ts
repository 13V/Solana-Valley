import Phaser from 'phaser';

// Cosmetic outfit recolours for the farmer.
//
// The Sprout Lands character sheet (`pchar`, an 8×24 grid of 48px frames) is
// almost entirely one cream "outfit" colour, with a purple ink outline, peach
// skin and yellow hair. A skin is a 3-stop recolour of *just the outfit ramp*
// (highlight / base / shadow); the outline, skin, hair and held-tool greys are
// left untouched, so every colourway is unmistakably the same farmer in a
// different outfit. All 192 frames are remapped automatically at boot — we
// never hand-edit the long sheet.
//
// NOTE: these recolours are in-game cosmetics only. The Sprout Lands licence
// forbids NFT use, so skins must not be minted — see CREDITS.md / docs/IDEAS.md.

export type RGB = [number, number, number];

export interface Skin {
  id: string;
  name: string;
  desc: string;
  cost: number; // coins to unlock (0 = free, owned from the start)
  /** Outfit ramp [highlight, base, shadow]; null = the original art (classic). */
  ramp: [RGB, RGB, RGB] | null;
  /** Optional solid swatch colour for the UI (defaults to the ramp gradient). */
  swatch?: string;
}

// The base sheet's outfit colours (packed 0xRRGGBB) → ramp stop index:
// 0 = highlight, 1 = base, 2 = shadow. Every other colour is preserved.
const OUTFIT_STOPS: Array<[number, 0 | 1 | 2]> = [
  [0xf7f7f7, 0],
  [0xf3f4e7, 0],
  [0xf3f2c0, 1], // the dominant cream — the body of the outfit
  [0xddd5de, 2],
  [0xdce0d2, 2],
];

export const SKINS: Skin[] = [
  { id: 'classic', name: 'Classic Cream', desc: 'The original cosy farmhand.', cost: 0, ramp: null, swatch: '#f3f2c0' },
  { id: 'rose', name: 'Rosie', desc: 'Soft strawberry pink.', cost: 600, ramp: [[255, 224, 230], [244, 150, 175], [206, 110, 140]] },
  { id: 'sky', name: 'Bluebell', desc: 'Clear-morning blue.', cost: 600, ramp: [[220, 239, 255], [150, 193, 238], [96, 140, 200]] },
  { id: 'mint', name: 'Sprout', desc: 'Fresh garden green.', cost: 800, ramp: [[221, 246, 228], [150, 214, 170], [95, 176, 128]] },
  { id: 'peach', name: 'Orchard', desc: 'Warm peach orange.', cost: 800, ramp: [[255, 233, 212], [244, 186, 128], [210, 140, 80]] },
  { id: 'honey', name: 'Honeycomb', desc: 'Sun-ripened gold.', cost: 1000, ramp: [[255, 240, 196], [240, 205, 100], [196, 150, 55]] },
  { id: 'lilac', name: 'Lilac', desc: 'Twilight lavender.', cost: 1200, ramp: [[236, 226, 255], [186, 160, 228], [132, 108, 190]] },
  { id: 'crimson', name: 'Harvest Red', desc: 'Bold heirloom crimson.', cost: 1500, ramp: [[255, 210, 205], [220, 110, 100], [170, 62, 62]] },
  { id: 'noir', name: 'Midnight', desc: 'Charcoal for the night owls.', cost: 2000, ramp: [[200, 204, 214], [110, 116, 132], [60, 64, 84]] },
];

export const SKIN_BY_ID: Record<string, Skin> = Object.fromEntries(SKINS.map((s) => [s.id, s]));
export const DEFAULT_SKIN = 'classic';

const BASE_SHEET = 'pchar';
const FRAME = 48;

// Texture key the player sprite + its animations use for a given skin.
export function skinTextureKey(id: string): string {
  return id === DEFAULT_SKIN ? BASE_SHEET : `${BASE_SHEET}_${id}`;
}

// A CSS background (gradient) for the wardrobe swatch chip.
export function skinSwatch(skin: Skin): string {
  if (!skin.ramp) return skin.swatch ?? '#f3f2c0';
  const [hi, base, sh] = skin.ramp.map((c) => `rgb(${c[0]},${c[1]},${c[2]})`);
  return `linear-gradient(135deg, ${hi} 0%, ${base} 55%, ${sh} 100%)`;
}

// Recolour the base character sheet into one canvas spritesheet per skin and
// register each with the texture manager. Call once after `pchar` has loaded
// (BootScene.create), before any scene builds the player animations.
export function buildSkinTextures(scene: Phaser.Scene): void {
  const base = scene.textures.get(BASE_SHEET);
  if (!base || base.key === '__MISSING') return;
  const src = base.getSourceImage() as CanvasImageSource & { width: number; height: number };
  const w = src.width;
  const h = src.height;
  const cols = Math.floor(w / FRAME);
  const rows = Math.floor(h / FRAME);

  for (const skin of SKINS) {
    if (!skin.ramp) continue; // classic uses the base sheet unmodified
    const key = skinTextureKey(skin.id);
    if (scene.textures.exists(key)) continue;

    // Per-skin lookup: packed source rgb → replacement rgb.
    const remap = new Map<number, RGB>();
    for (const [rgb, stop] of OUTFIT_STOPS) remap.set(rgb, skin.ramp[stop]);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.drawImage(src, 0, 0);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 100) continue; // skip transparent pixels
      const packed = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      const rep = remap.get(packed);
      if (rep) {
        d[i] = rep[0];
        d[i + 1] = rep[1];
        d[i + 2] = rep[2];
      }
    }
    ctx.putImageData(img, 0, 0);

    const tex = scene.textures.addCanvas(key, canvas);
    if (!tex) continue;
    // Cut the same 48px grid so generateFrameNumbers() works like the base sheet.
    let f = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        tex.add(f++, 0, c * FRAME, r * FRAME, FRAME, FRAME);
      }
    }
  }
}
