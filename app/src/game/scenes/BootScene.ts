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
    // Premium character: 8 cols × 24 rows of 48px frames. Locomotion lives in
    // rows 0–11 = three states (idle / walk / run) × four directions
    // (down, up, left, right); rows 12–23 are tool-use poses.
    this.load.spritesheet('pchar', `${A}pchar.png`, { frameWidth: 48, frameHeight: 48 });
    this.load.spritesheet('cropsheet', `${A}crops.png`, { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('fences', `${A}fences.png`, { frameWidth: 16, frameHeight: 16 });
    // Chickens (16px) and cows (32px) come in several palette swaps; one is
    // picked per animal for variety.
    for (const c of ['white', 'blue', 'brown', 'green', 'red']) {
      this.load.spritesheet(`chick_${c}`, `${A}chick_${c}.png`, { frameWidth: 16, frameHeight: 16 });
    }
    for (const c of ['brown', 'green', 'light', 'pink', 'purple']) {
      this.load.spritesheet(`cow_${c}`, `${A}cow_${c}.png`, { frameWidth: 32, frameHeight: 32 });
    }
    // Baby animals (for breeding) share the adult palette swaps.
    for (const c of ['white', 'blue', 'brown', 'green', 'red']) {
      this.load.spritesheet(`baby_chick_${c}`, `${A}baby_chick_${c}.png`, { frameWidth: 16, frameHeight: 16 });
    }
    for (const c of ['brown', 'green', 'light', 'pink', 'purple']) {
      this.load.spritesheet(`baby_cow_${c}`, `${A}baby_cow_${c}.png`, { frameWidth: 32, frameHeight: 32 });
    }
    this.load.spritesheet('eggitem', `${A}eggitem.png`, { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('milkitem', `${A}milkitem.png`, { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('mfs', `${A}mfs.png`, { frameWidth: 16, frameHeight: 16 });
    for (const t of ['apple', 'orange', 'peach', 'pear']) {
      this.load.spritesheet(`tree_${t}`, `${A}tree_${t}.png`, { frameWidth: 32, frameHeight: 48 });
      this.load.spritesheet(`fruit_${t}`, `${A}fruit_${t}.png`, { frameWidth: 16, frameHeight: 16 });
    }
    this.load.image('biome', `${A}biome.png`);
    this.load.image('house', `${A}house.png`);
    this.load.image('coop', `${A}coop.png`);
    this.load.image('well', `${A}well.png`);
    // Decorative props.
    this.load.image('workstation', `${A}workstation.png`);
    this.load.image('picnic', `${A}picnic.png`);
    this.load.image('basket', `${A}basket.png`);
    this.load.spritesheet('chest', `${A}chest.png`, { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('gate', `${A}gate.png`, { frameWidth: 16, frameHeight: 16 });
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
    // A complete chicken coop (orange roof) from the modular coop sheet.
    this.textures.get('coop').add('coop', 0, 64, 0, 64, 80);
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
    g.fillStyle(0xbfe3ff, 1);
    g.fillRect(0, 0, 2, 9);
    g.generateTexture('raindrop', 2, 9);
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
