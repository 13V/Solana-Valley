import Phaser from 'phaser';
import { TILE, COLORS, CROP_LIST } from '../constants';

// Direction used for the player walk cycle. "side" is drawn facing right and
// mirrored with flipX for left, so we only generate three directions.
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
    this.scene.start('Farm');
  }

  private gfx(): Phaser.GameObjects.Graphics {
    return this.make.graphics({ x: 0, y: 0 }, false);
  }

  // ---- ground -------------------------------------------------------------

  private makeGroundTextures() {
    const T = TILE;

    // Three grass variants for visual variety across the field.
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
      // a couple of grass blades
      g.fillStyle(COLORS.grassDark, 1);
      g.fillRect((4 + i * 3) % T, 26, 1, 3);
      g.fillRect((19 + i * 5) % T, 23, 1, 3);
      g.generateTexture(`grass${i}`, T, T);
      g.destroy();
    });

    // Tilled soil: furrowed rows + speckles + edge shadow.
    let g = this.gfx();
    g.fillStyle(COLORS.soil, 1);
    g.fillRect(0, 0, T, T);
    g.fillStyle(COLORS.soilDark, 1);
    for (let y = 5; y < T; y += 8) g.fillRect(2, y, T - 4, 2);
    [[6, 3], [14, 11], [22, 19], [10, 25], [26, 7]].forEach(([x, y]) =>
      g.fillRect(x, y, 1, 1),
    );
    g.fillStyle(0x000000, 0.12);
    g.fillRect(0, T - 3, T, 3);
    g.fillRect(T - 3, 0, 3, T);
    g.generateTexture('soil', T, T);
    g.destroy();

    // Watered soil: darker, with damp blue specks.
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

    // Water (for the pond).
    g = this.gfx();
    g.fillStyle(COLORS.water, 1);
    g.fillRect(0, 0, T, T);
    g.fillStyle(COLORS.waterDark, 1);
    g.fillRect(0, T - 4, T, 4);
    g.fillStyle(COLORS.waterLight, 1);
    g.fillRect(4, 7, 8, 1);
    g.fillRect(16, 14, 9, 1);
    g.fillRect(9, 22, 7, 1);
    g.generateTexture('water', T, T);
    g.destroy();

    // Tile highlight (white border, tinted at runtime).
    g = this.gfx();
    g.lineStyle(2, 0xffffff, 1);
    g.strokeRect(1, 1, T - 2, T - 2);
    g.generateTexture('highlight', T, T);
    g.destroy();

    // 1x1 white pixel, used for invisible collision boxes.
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

    // soft drop shadow
    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(cx, 27, 16, 4);

    if (dir === 'side') {
      // legs (front/back stride)
      g.fillStyle(denim, 1);
      g.fillRect(cx - 3 + legPhase, 20, 3, 6);
      g.fillRect(cx + 1 - legPhase, 20, 3, 6);
      g.fillStyle(boot, 1);
      g.fillRect(cx - 3 + legPhase, 26, 3, 2);
      g.fillRect(cx + 1 - legPhase, 26, 3, 2);
      // torso
      g.fillStyle(shirt, 1);
      g.fillRect(cx - 3, 11, 7, 9);
      // swinging arm
      g.fillStyle(shirt, 1);
      g.fillRect(cx + 2, 12, 2, 6 + (armPhase > 0 ? 1 : 0));
      g.fillStyle(skin, 1);
      g.fillRect(cx + 2, 18 + (armPhase > 0 ? 1 : 0), 2, 2);
      // head
      g.fillStyle(skin, 1);
      g.fillRect(cx - 2, 4, 7, 7);
      g.fillStyle(hair, 1);
      g.fillRect(cx - 3, 3, 8, 3);
      g.fillRect(cx - 3, 3, 2, 6);
      // eye toward facing (right)
      g.fillStyle(eye, 1);
      g.fillRect(cx + 3, 7, 1, 1);
      return;
    }

    // down / up share the front-on body
    // legs (alternate lift)
    g.fillStyle(denim, 1);
    g.fillRect(cx - 4, 20, 3, 6 - Math.max(0, legPhase));
    g.fillRect(cx + 1, 20, 3, 6 - Math.max(0, -legPhase));
    g.fillStyle(boot, 1);
    g.fillRect(cx - 4, 26 - Math.max(0, legPhase), 3, 2);
    g.fillRect(cx + 1, 26 - Math.max(0, -legPhase), 3, 2);

    // overalls + shirt
    g.fillStyle(shirt, 1);
    g.fillRect(cx - 4, 11, 8, 5);
    g.fillStyle(denim, 1);
    g.fillRect(cx - 4, 15, 8, 6);
    g.fillRect(cx - 3, 11, 1, 5);
    g.fillRect(cx + 2, 11, 1, 5);

    // arms (swing)
    g.fillStyle(shirt, 1);
    g.fillRect(cx - 6, 11, 2, 6 + (armPhase > 0 ? 1 : 0));
    g.fillRect(cx + 4, 11, 2, 6 + (armPhase < 0 ? 1 : 0));
    g.fillStyle(skin, 1);
    g.fillRect(cx - 6, 17 + (armPhase > 0 ? 1 : 0), 2, 2);
    g.fillRect(cx + 4, 17 + (armPhase < 0 ? 1 : 0), 2, 2);

    // head
    g.fillStyle(skin, 1);
    g.fillRect(cx - 4, 4, 8, 7);
    g.fillStyle(hair, 1);
    g.fillRect(cx - 4, 3, 8, 3);
    if (dir === 'up') {
      // back of head: mostly hair
      g.fillRect(cx - 4, 3, 8, 6);
    } else {
      // face
      g.fillStyle(eye, 1);
      g.fillRect(cx - 2, 8, 1, 1);
      g.fillRect(cx + 1, 8, 1, 1);
    }
  }

  // ---- crops --------------------------------------------------------------

  private makeCropTextures() {
    for (const crop of CROP_LIST) {
      for (let n = 0; n <= crop.daysToGrow; n++) {
        const f = n / crop.daysToGrow;
        const g = this.gfx();
        const baseY = TILE - 3;
        const stemH = Math.round(4 + f * 18);

        // little soil mound
        g.fillStyle(0x4a3320, 1);
        g.fillEllipse(TILE / 2, baseY + 1, 14, 5);

        // stem
        g.fillStyle(0x2e7d32, 1);
        g.fillRect(TILE / 2 - 1, baseY - stemH, 3, stemH);
        g.fillStyle(0x256528, 1);
        g.fillRect(TILE / 2 - 1, baseY - stemH, 1, stemH);

        // leaves
        const leaf = Math.max(2, Math.round(2 + f * 4));
        g.fillStyle(0x43a047, 1);
        g.fillRect(TILE / 2 - 1 - leaf, baseY - stemH + 3, leaf, 3);
        g.fillRect(TILE / 2 + 2, baseY - stemH + 6, leaf, 3);
        g.fillStyle(0x5cbb5c, 1);
        g.fillRect(TILE / 2 - 1 - leaf, baseY - stemH + 3, leaf, 1);

        // mature fruit
        if (n === crop.daysToGrow) {
          const fy = baseY - stemH - 1;
          g.fillStyle(crop.color, 1);
          g.fillCircle(TILE / 2 + 0.5, fy, 5);
          g.fillStyle(0xffffff, 0.4);
          g.fillCircle(TILE / 2 - 1, fy - 1.5, 1.5);
          g.lineStyle(1, 0x000000, 0.22);
          g.strokeCircle(TILE / 2 + 0.5, fy, 5);
        }

        g.generateTexture(`crop_${crop.id}_${n}`, TILE, TILE);
        g.destroy();
      }
    }
  }

  // ---- decorations --------------------------------------------------------

  private makeDecorTextures() {
    // Tree (origin bottom-center when placed): trunk + layered canopy.
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

    // Rock (origin center).
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

    // Cabin (origin bottom-center): walls, plank lines, roof, door, windows.
    g = this.gfx();
    g.fillStyle(0xc8a06a, 1);
    g.fillRect(8, 34, 80, 44);
    g.fillStyle(0xb08a54, 1);
    g.fillRect(8, 34, 80, 4);
    g.fillStyle(0xa97f4a, 0.5);
    for (let y = 44; y < 78; y += 8) g.fillRect(8, y, 80, 1);
    // roof
    g.fillStyle(0x9b3b2f, 1);
    g.beginPath();
    g.moveTo(2, 36);
    g.lineTo(48, 6);
    g.lineTo(94, 36);
    g.closePath();
    g.fillPath();
    g.fillStyle(0x7f2f25, 1);
    g.fillRect(2, 34, 92, 4);
    // door
    g.fillStyle(0x6b4423, 1);
    g.fillRect(42, 52, 16, 26);
    g.fillStyle(0x4d3018, 1);
    g.fillRect(42, 52, 16, 2);
    g.fillStyle(0xe0c060, 1);
    g.fillRect(54, 64, 2, 2);
    // windows
    g.fillStyle(0x86c5e0, 1);
    g.fillRect(18, 46, 14, 12);
    g.fillRect(64, 46, 14, 12);
    g.lineStyle(2, 0x6b4423, 1);
    g.strokeRect(18, 46, 14, 12);
    g.strokeRect(64, 46, 14, 12);
    g.generateTexture('cabin', 96, 80);
    g.destroy();
  }
}
