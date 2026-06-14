import Phaser from 'phaser';
import { TILE } from '../constants';

// Loads the Sprout Lands art (ground, water, character, crops, decorations) and
// generates only the FX bits procedurally (particles, glow, vignette), then
// starts the farm.
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
    this.load.spritesheet('actions', `${A}actions.png`, { frameWidth: 48, frameHeight: 48 });
    this.load.spritesheet('cropsheet', `${A}crops.png`, { frameWidth: 16, frameHeight: 16 });
    this.load.image('biome', `${A}biome.png`);
    this.load.image('house', `${A}house.png`);
  }

  create() {
    this.makeUtilTextures();
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
