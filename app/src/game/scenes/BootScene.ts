import Phaser from 'phaser';
import { TILE, COLORS, CROP_LIST } from '../constants';

// Generates all textures procedurally (no external art assets), then starts the
// farm. Keeps the project self-contained and avoids any third-party sprite IP.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    this.makeGroundTextures();
    this.makePlayerTexture();
    this.makeCropTextures();
    this.scene.start('Farm');
  }

  private gfx(): Phaser.GameObjects.Graphics {
    return this.make.graphics({ x: 0, y: 0 }, false);
  }

  private makeGroundTextures() {
    // Grass
    let g = this.gfx();
    g.fillStyle(COLORS.grass, 1);
    g.fillRect(0, 0, TILE, TILE);
    g.fillStyle(COLORS.grassAlt, 1);
    g.fillRect(4, 6, 3, 3);
    g.fillRect(20, 12, 3, 3);
    g.fillRect(12, 22, 3, 3);
    g.generateTexture('grass', TILE, TILE);
    g.destroy();

    // Tilled soil
    g = this.gfx();
    g.fillStyle(COLORS.soil, 1);
    g.fillRect(0, 0, TILE, TILE);
    g.lineStyle(1, 0x000000, 0.15);
    for (let i = 4; i < TILE; i += 6) {
      g.beginPath();
      g.moveTo(0, i);
      g.lineTo(TILE, i);
      g.strokePath();
    }
    g.generateTexture('soil', TILE, TILE);
    g.destroy();

    // Watered soil (darker)
    g = this.gfx();
    g.fillStyle(COLORS.soilWet, 1);
    g.fillRect(0, 0, TILE, TILE);
    g.lineStyle(1, 0x000000, 0.2);
    for (let i = 4; i < TILE; i += 6) {
      g.beginPath();
      g.moveTo(0, i);
      g.lineTo(TILE, i);
      g.strokePath();
    }
    g.generateTexture('soil_wet', TILE, TILE);
    g.destroy();

    // Tile highlight (white border, tinted at runtime for valid/invalid)
    g = this.gfx();
    g.lineStyle(2, 0xffffff, 1);
    g.strokeRect(1, 1, TILE - 2, TILE - 2);
    g.generateTexture('highlight', TILE, TILE);
    g.destroy();
  }

  private makePlayerTexture() {
    const w = 20;
    const h = 28;
    const g = this.gfx();
    g.fillStyle(0x3a6ea5, 1); // overalls
    g.fillRect(4, 14, 12, 12);
    g.fillStyle(0xc0392b, 1); // shirt
    g.fillRect(4, 10, 12, 5);
    g.fillStyle(0xf0c89a, 1); // head
    g.fillRect(6, 3, 8, 8);
    g.fillStyle(0x6b4423, 1); // hat
    g.fillRect(4, 1, 12, 3);
    g.fillStyle(0x2b2b2b, 1); // boots
    g.fillRect(5, 26, 4, 2);
    g.fillRect(11, 26, 4, 2);
    g.generateTexture('player', w, h);
    g.destroy();
  }

  private makeCropTextures() {
    // For each crop, generate one texture per growth stage (0..daysToGrow).
    for (const crop of CROP_LIST) {
      for (let n = 0; n <= crop.daysToGrow; n++) {
        const f = n / crop.daysToGrow;
        const g = this.gfx();
        const stemH = Math.round(4 + f * 18);
        const baseY = TILE - 3;

        g.fillStyle(0x2e7d32, 1); // stem
        g.fillRect(TILE / 2 - 1, baseY - stemH, 3, stemH);

        g.fillStyle(0x43a047, 1); // leaves
        const leaf = Math.max(2, Math.round(2 + f * 4));
        g.fillRect(TILE / 2 - 1 - leaf, baseY - stemH + 3, leaf, 3);
        g.fillRect(TILE / 2 + 2, baseY - stemH + 6, leaf, 3);

        if (n === crop.daysToGrow) {
          // mature: show the fruit
          g.fillStyle(crop.color, 1);
          g.fillCircle(TILE / 2 + 0.5, baseY - stemH - 1, 5);
          g.lineStyle(1, 0x000000, 0.25);
          g.strokeCircle(TILE / 2 + 0.5, baseY - stemH - 1, 5);
        }

        g.generateTexture(`crop_${crop.id}_${n}`, TILE, TILE);
        g.destroy();
      }
    }
  }
}
