import Phaser from 'phaser';
import { TILE, COLORS, STAGES } from '../constants';
import { PLANTS, type Plant } from '../economy';

type Dir = 'down' | 'up' | 'side';

// Generates all textures procedurally (no external art assets) as pixel art,
// then starts the farm. Keeps the project self-contained and IP-free.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    this.makeGroundTextures();
    this.makePlayerFrames();
    this.makeCropTextures();
    this.makeDecorTextures();
    this.makeFxTextures();
    this.scene.start('Farm');
  }

  private gfx(): Phaser.GameObjects.Graphics {
    return this.make.graphics({ x: 0, y: 0 }, false);
  }

  // ---- ground -------------------------------------------------------------

  private makeGroundTextures() {
    const T = TILE;
    const variants: Array<Array<[number, number]>> = [
      [[5, 7], [18, 10], [11, 20], [24, 15]],
      [[8, 5], [20, 18], [4, 22], [14, 12]],
      [[16, 6], [6, 14], [22, 8], [12, 24]],
    ];
    variants.forEach((patches, i) => {
      const g = this.gfx();
      g.fillStyle(COLORS.grass, 1);
      g.fillRect(0, 0, T, T);
      g.fillStyle(COLORS.grassDark, 1);
      patches.forEach(([x, y]) => g.fillRect(x, y, 2, 2));
      g.fillStyle(COLORS.grassLight, 1);
      patches.forEach(([x, y]) => g.fillRect((x + 9) % T, (y + 5) % T, 1, 1));
      g.fillStyle(COLORS.grassDark, 1);
      g.fillRect((4 + i * 3) % T, 26, 1, 3);
      g.fillRect((19 + i * 5) % T, 23, 1, 3);
      g.generateTexture(`grass${i}`, T, T);
      g.destroy();
    });

    let g = this.gfx();
    g.fillStyle(COLORS.soil, 1);
    g.fillRect(0, 0, T, T);
    g.fillStyle(COLORS.soilDark, 1);
    for (let y = 5; y < T; y += 8) g.fillRect(2, y, T - 4, 2);
    [[6, 3], [14, 11], [22, 19], [10, 25], [26, 7]].forEach(([x, y]) => g.fillRect(x, y, 1, 1));
    g.fillStyle(0x000000, 0.12);
    g.fillRect(0, T - 3, T, 3);
    g.fillRect(T - 3, 0, 3, T);
    g.generateTexture('soil', T, T);
    g.destroy();

    g = this.gfx();
    g.fillStyle(COLORS.soilWet, 1);
    g.fillRect(0, 0, T, T);
    g.fillStyle(COLORS.soilWetDark, 1);
    for (let y = 5; y < T; y += 8) g.fillRect(2, y, T - 4, 2);
    g.fillStyle(COLORS.water, 0.35);
    [[8, 8], [18, 14], [12, 22], [24, 18]].forEach(([x, y]) => g.fillRect(x, y, 2, 1));
    g.fillStyle(0x000000, 0.15);
    g.fillRect(0, T - 3, T, 3);
    g.fillRect(T - 3, 0, 3, T);
    g.generateTexture('soil_wet', T, T);
    g.destroy();

    // Two water frames for a gentle shimmer animation.
    for (let f = 0; f < 2; f++) {
      g = this.gfx();
      g.fillStyle(COLORS.water, 1);
      g.fillRect(0, 0, T, T);
      g.fillStyle(COLORS.waterDark, 1);
      g.fillRect(0, T - 4, T, 4);
      g.fillStyle(COLORS.waterLight, 1);
      const o = f * 6;
      g.fillRect((4 + o) % T, 7, 8, 1);
      g.fillRect((16 + o) % T, 14, 9, 1);
      g.fillRect((9 + o) % T, 22, 7, 1);
      g.generateTexture(`water${f}`, T, T);
      g.destroy();
    }

    g = this.gfx();
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

  // ---- player walk cycle --------------------------------------------------

  private makePlayerFrames() {
    const dirs: Dir[] = ['down', 'up', 'side'];
    for (const dir of dirs) {
      for (let frame = 0; frame < 4; frame++) {
        const g = this.gfx();
        this.drawCharacter(g, dir, frame);
        g.generateTexture(`player_${dir}_${frame}`, 24, 28);
        g.destroy();
      }
    }
  }

  private drawCharacter(g: Phaser.GameObjects.Graphics, dir: Dir, frame: number) {
    const cx = 12;
    const skin = 0xf1c27d;
    const hair = 0x5a3a1a;
    const shirt = 0xc0392b;
    const denim = 0x2f6db0;
    const boot = 0x3a2a1a;
    const eye = 0x232323;
    const legPhase = [0, 1, 0, -1][frame];
    const armPhase = [0, 1, 0, -1][frame];

    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(cx, 27, 16, 4);

    if (dir === 'side') {
      g.fillStyle(denim, 1);
      g.fillRect(cx - 3 + legPhase, 20, 3, 6);
      g.fillRect(cx + 1 - legPhase, 20, 3, 6);
      g.fillStyle(boot, 1);
      g.fillRect(cx - 3 + legPhase, 26, 3, 2);
      g.fillRect(cx + 1 - legPhase, 26, 3, 2);
      g.fillStyle(shirt, 1);
      g.fillRect(cx - 3, 11, 7, 9);
      g.fillRect(cx + 2, 12, 2, 6 + (armPhase > 0 ? 1 : 0));
      g.fillStyle(skin, 1);
      g.fillRect(cx + 2, 18 + (armPhase > 0 ? 1 : 0), 2, 2);
      g.fillStyle(skin, 1);
      g.fillRect(cx - 2, 4, 7, 7);
      g.fillStyle(hair, 1);
      g.fillRect(cx - 3, 3, 8, 3);
      g.fillRect(cx - 3, 3, 2, 6);
      g.fillStyle(eye, 1);
      g.fillRect(cx + 3, 7, 1, 1);
      return;
    }

    g.fillStyle(denim, 1);
    g.fillRect(cx - 4, 20, 3, 6 - Math.max(0, legPhase));
    g.fillRect(cx + 1, 20, 3, 6 - Math.max(0, -legPhase));
    g.fillStyle(boot, 1);
    g.fillRect(cx - 4, 26 - Math.max(0, legPhase), 3, 2);
    g.fillRect(cx + 1, 26 - Math.max(0, -legPhase), 3, 2);
    g.fillStyle(shirt, 1);
    g.fillRect(cx - 4, 11, 8, 5);
    g.fillStyle(denim, 1);
    g.fillRect(cx - 4, 15, 8, 6);
    g.fillRect(cx - 3, 11, 1, 5);
    g.fillRect(cx + 2, 11, 1, 5);
    g.fillStyle(shirt, 1);
    g.fillRect(cx - 6, 11, 2, 6 + (armPhase > 0 ? 1 : 0));
    g.fillRect(cx + 4, 11, 2, 6 + (armPhase < 0 ? 1 : 0));
    g.fillStyle(skin, 1);
    g.fillRect(cx - 6, 17 + (armPhase > 0 ? 1 : 0), 2, 2);
    g.fillRect(cx + 4, 17 + (armPhase < 0 ? 1 : 0), 2, 2);
    g.fillStyle(skin, 1);
    g.fillRect(cx - 4, 4, 8, 7);
    g.fillStyle(hair, 1);
    g.fillRect(cx - 4, 3, 8, 3);
    if (dir === 'up') {
      g.fillRect(cx - 4, 3, 8, 6);
    } else {
      g.fillStyle(eye, 1);
      g.fillRect(cx - 2, 8, 1, 1);
      g.fillRect(cx + 1, 8, 1, 1);
    }
  }

  // ---- crops --------------------------------------------------------------

  private makeCropTextures() {
    for (const plant of PLANTS) {
      for (let s = 0; s < STAGES; s++) {
        const f = s / (STAGES - 1);
        const g = this.gfx();
        const baseY = TILE - 3;

        g.fillStyle(0x4a3320, 1);
        g.fillEllipse(TILE / 2, baseY + 1, 14, 5);

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
        g.fillStyle(0x000000, 0.12);
        g.fillEllipse(cx, topY + 5, 18, 6);
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
        // colored crown poking from the soil
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

  // ---- decorations --------------------------------------------------------

  private makeDecorTextures() {
    let g = this.gfx();
    g.fillStyle(0x6b4a2a, 1);
    g.fillRect(13, 30, 6, 16);
    g.fillStyle(0x553a20, 1);
    g.fillRect(13, 30, 2, 16);
    g.fillStyle(0x2f6b2f, 1);
    g.fillCircle(16, 18, 14);
    g.fillCircle(8, 22, 9);
    g.fillCircle(24, 22, 9);
    g.fillStyle(0x3a8a3a, 1);
    g.fillCircle(16, 16, 11);
    g.fillStyle(0x4fb04f, 1);
    g.fillCircle(13, 12, 5);
    g.fillCircle(20, 15, 4);
    g.generateTexture('tree', 32, 48);
    g.destroy();

    g = this.gfx();
    g.fillStyle(0x6f747c, 1);
    g.fillEllipse(14, 16, 24, 12);
    g.fillStyle(0x8a8f98, 1);
    g.fillEllipse(14, 13, 22, 13);
    g.fillStyle(0xa8adb5, 1);
    g.fillEllipse(11, 10, 9, 5);
    g.fillStyle(0x5c6068, 1);
    g.fillRect(8, 14, 8, 1);
    g.fillRect(15, 17, 6, 1);
    g.generateTexture('rock', 28, 24);
    g.destroy();

    g = this.gfx();
    g.fillStyle(0xc8a06a, 1);
    g.fillRect(8, 34, 80, 44);
    g.fillStyle(0xb08a54, 1);
    g.fillRect(8, 34, 80, 4);
    g.fillStyle(0xa97f4a, 0.5);
    for (let y = 44; y < 78; y += 8) g.fillRect(8, y, 80, 1);
    g.fillStyle(0x9b3b2f, 1);
    g.beginPath();
    g.moveTo(2, 36);
    g.lineTo(48, 6);
    g.lineTo(94, 36);
    g.closePath();
    g.fillPath();
    g.fillStyle(0x7f2f25, 1);
    g.fillRect(2, 34, 92, 4);
    g.fillStyle(0x6b4423, 1);
    g.fillRect(42, 52, 16, 26);
    g.fillStyle(0x4d3018, 1);
    g.fillRect(42, 52, 16, 2);
    g.fillStyle(0xe0c060, 1);
    g.fillRect(54, 64, 2, 2);
    g.fillStyle(0x86c5e0, 1);
    g.fillRect(18, 46, 14, 12);
    g.fillRect(64, 46, 14, 12);
    g.lineStyle(2, 0x6b4423, 1);
    g.strokeRect(18, 46, 14, 12);
    g.strokeRect(64, 46, 14, 12);
    g.generateTexture('cabin', 96, 80);
    g.destroy();

    // a few wild flowers to scatter on the grass
    const flowerColors = [0xff6b9d, 0xffd23d, 0xa66bff, 0xff8a3d];
    flowerColors.forEach((col, i) => {
      g = this.gfx();
      g.fillStyle(0x3f9a3f, 1);
      g.fillRect(7, 9, 2, 6);
      g.fillStyle(col, 1);
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        g.fillCircle(8 + Math.cos(a) * 3, 7 + Math.sin(a) * 3, 2);
      }
      g.fillStyle(0xffe14a, 1);
      g.fillCircle(8, 7, 1.6);
      g.generateTexture(`flower${i}`, 16, 16);
      g.destroy();
    });
  }

  // ---- fx -----------------------------------------------------------------

  private makeFxTextures() {
    // Soft radial glow (additive) for rare crops.
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
  }
}
