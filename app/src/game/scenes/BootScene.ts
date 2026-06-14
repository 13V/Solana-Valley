import Phaser from 'phaser';
import { TILE } from '../constants';
import { PLANTS, type Plant } from '../economy';

// Loads the Sprout Lands art pack (ground, water, character, decorations) and
// generates the remaining bits procedurally (crops, particles, glow, vignette),
// then starts the farm. Run `node scripts/fetch-assets.mjs` to download the art.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    const A = 'assets/sprout/';
    this.load.spritesheet('grass', `${A}grass.png`, { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('tilled', `${A}tilled.png`, { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('water', `${A}water.png`, { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('char', `${A}character.png`, { frameWidth: 48, frameHeight: 48 });
    this.load.image('biome', `${A}biome.png`);
    this.load.image('house', `${A}house.png`);
  }

  create() {
    this.makeUtilTextures();
    this.makeCropTextures();
    this.makeFxTextures();
    this.defineAssetFrames();
    this.scene.start('Farm');
  }

  private gfx(): Phaser.GameObjects.Graphics {
    return this.make.graphics({ x: 0, y: 0 }, false);
  }

  // Sub-rectangles cut out of the packed Sprout Lands sheets (source pixels).
  private defineAssetFrames() {
    const biome = this.textures.get('biome');
    // [name, x, y, w, h] cut from biome.png (9x5 grid of 16px cells)
    const frames: Array<[string, number, number, number, number]> = [
      ['tree', 16, 0, 32, 32],
      ['tree_apple', 48, 0, 32, 32],
      ['bush', 0, 48, 16, 16],
      ['bush2', 16, 48, 16, 16],
      ['rock_s', 112, 16, 16, 16],
      ['rock_l', 128, 16, 16, 16],
      ['rock_pile', 80, 64, 16, 16],
      ['stump', 48, 32, 16, 16],
      ['flower_y', 96, 32, 16, 16],
      ['flower_p', 0, 32, 16, 16],
      ['flower_p2', 96, 48, 16, 16],
      ['sprout', 80, 16, 16, 16],
    ];
    for (const [name, x, y, w, h] of frames) biome.add(name, 0, x, y, w, h);

    // House: chimney + walls + window block from the modular house sheet.
    this.textures.get('house').add('cottage', 0, 0, 0, 48, 64);
  }

  private makeUtilTextures() {
    const T = TILE;
    let g = this.gfx();
    g.lineStyle(2, 0xffffff, 1);
    g.strokeRect(1, 1, T - 2, T - 2);
    g.generateTexture('highlight', T, T);
    g.destroy();

    g = this.gfx();
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 1, 1);
    g.generateTexture('pixel', 1, 1);
    g.destroy();
  }

  // ---- crops (procedural; Sprout Lands free pack has no crop growth art) ---

  private makeCropTextures() {
    const STAGES = 4;
    for (const plant of PLANTS) {
      for (let s = 0; s < STAGES; s++) {
        const f = s / (STAGES - 1);
        const g = this.gfx();
        const baseY = TILE - 3;
        g.fillStyle(0x4a3320, 0.0); // keep transparent base (soil drawn by tile)
        const stemH = Math.round(5 + f * 13);
        g.fillStyle(plant.leaf, 1);
        g.fillRect(TILE / 2 - 1, baseY - stemH, 3, stemH);
        const leaf = Math.max(2, Math.round(2 + f * 4));
        g.fillRect(TILE / 2 - 1 - leaf, baseY - stemH + 4, leaf, 3);
        g.fillRect(TILE / 2 + 2, baseY - stemH + 7, leaf, 3);
        g.fillStyle(0xffffff, 0.18);
        g.fillRect(TILE / 2 - 1, baseY - stemH, 1, stemH);
        if (s === STAGES - 1) this.drawFruit(g, plant, TILE / 2, baseY - stemH);
        g.generateTexture(`crop_${plant.id}_${s}`, TILE, TILE);
        g.destroy();
      }
    }
  }

  private drawFruit(g: Phaser.GameObjects.Graphics, plant: Plant, cx: number, topY: number) {
    const c = plant.fruit;
    const outline = 0x00000022;
    const hi = 0xffffff;
    const dot = (x: number, y: number, r: number) => {
      g.fillStyle(c, 1);
      g.fillCircle(x, y, r);
      g.fillStyle(hi, 0.35);
      g.fillCircle(x - r * 0.35, y - r * 0.35, r * 0.35);
      g.lineStyle(1, outline, 1);
      g.strokeCircle(x, y, r);
    };
    switch (plant.shape) {
      case 'round':
        dot(cx, topY - 1, 6);
        break;
      case 'giant':
        g.fillStyle(c, 1);
        g.fillEllipse(cx, topY + 2, 18, 13);
        g.fillStyle(hi, 0.25);
        g.fillEllipse(cx - 4, topY - 1, 7, 4);
        g.lineStyle(1, outline, 1);
        g.strokeEllipse(cx, topY + 2, 18, 13);
        break;
      case 'berry':
        dot(cx - 3, topY, 3);
        dot(cx + 3, topY - 1, 3);
        dot(cx, topY - 4, 3);
        break;
      case 'root':
        g.fillStyle(c, 1);
        g.fillTriangle(cx - 4, topY + 4, cx + 4, topY + 4, cx, topY + 11);
        g.fillStyle(hi, 0.25);
        g.fillTriangle(cx - 2, topY + 4, cx, topY + 4, cx - 1, topY + 8);
        break;
      case 'leafy':
        g.fillStyle(plant.leaf, 1);
        g.fillCircle(cx - 3, topY + 2, 4);
        g.fillCircle(cx + 3, topY + 2, 4);
        dot(cx, topY - 2, 5);
        break;
      case 'star':
        this.drawStar(g, cx, topY - 1, 5, 8, 3.5, c);
        g.fillStyle(hi, 0.3);
        g.fillCircle(cx - 1, topY - 2, 1.5);
        break;
      case 'flower': {
        const petals = 6;
        g.fillStyle(c, 1);
        for (let i = 0; i < petals; i++) {
          const a = (i / petals) * Math.PI * 2;
          g.fillCircle(cx + Math.cos(a) * 5, topY + Math.sin(a) * 5, 3);
        }
        g.fillStyle(0xffe14a, 1);
        g.fillCircle(cx, topY, 3);
        break;
      }
    }
  }

  private drawStar(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    points: number,
    outer: number,
    inner: number,
    color: number,
  ) {
    g.fillStyle(color, 1);
    g.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fillPath();
  }

  // ---- fx -----------------------------------------------------------------

  private makeFxTextures() {
    let g = this.gfx();
    const R = 24;
    for (let i = R; i > 0; i--) {
      g.fillStyle(0xffffff, 0.045);
      g.fillCircle(R, R, i);
    }
    g.generateTexture('glow', R * 2, R * 2);
    g.destroy();

    g = this.gfx();
    g.fillStyle(0x9fd4ff, 1);
    g.fillCircle(2.5, 2.5, 2.5);
    g.generateTexture('p_droplet', 5, 5);
    g.destroy();

    g = this.gfx();
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 4, 4);
    g.generateTexture('p_bit', 4, 4);
    g.destroy();

    g = this.gfx();
    this.drawStar(g, 4, 4, 4, 4, 1.6, 0xffffff);
    g.generateTexture('p_star', 8, 8);
    g.destroy();

    g = this.gfx();
    const vw = 160;
    const vh = 96;
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      g.lineStyle(5, 0x000000, Math.pow(t, 3.5) * 0.38);
      g.strokeEllipse(vw / 2, vh / 2, vw * t * 1.2, vh * t * 1.2);
    }
    g.generateTexture('vignette', vw, vh);
    g.destroy();
  }
}
