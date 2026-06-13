import Phaser from 'phaser';
import {
  TILE,
  GRID_W,
  GRID_H,
  GAME_WIDTH,
  GAME_HEIGHT,
  PLAYER_SPEED,
  REACH,
  STARTING_COINS,
  CROPS,
  SEED_TO_CROP,
  HOTBAR,
} from '../constants';
import { bus } from '../EventBus';

type Tile = { tilled: boolean; watered: boolean };
type Crop = {
  cropId: string;
  daysWatered: number;
  mature: boolean;
  sprite: Phaser.GameObjects.Image;
};

// The authoritative game world. Owns all farm state and exposes it to the UI
// through the EventBus. Real-time movement + tool use here is fully off-chain;
// see docs/ROADMAP.md for what moves on-chain.
export class FarmScene extends Phaser.Scene {
  private tiles: Tile[][] = [];
  private ground: Phaser.GameObjects.Image[][] = [];
  private crops = new Map<string, Crop>();

  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private highlight!: Phaser.GameObjects.Image;

  private inventory: Record<string, number> = { parsnip_seed: 5 };
  private coins = STARTING_COINS;
  private day = 1;
  private selected = 'hoe';
  private unsubs: Array<() => void> = [];

  constructor() {
    super('Farm');
  }

  create() {
    this.physics.world.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.buildWorld();

    this.player = this.physics.add.sprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);

    this.highlight = this.add.image(0, 0, 'highlight').setVisible(false).setDepth(20);

    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = {
      up: kb.addKey('W'),
      down: kb.addKey('S'),
      left: kb.addKey('A'),
      right: kb.addKey('D'),
    };

    // Number keys 1..5 select hotbar slots.
    ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'].forEach((key, i) => {
      kb.on(`keydown-${key}`, () => {
        const slot = HOTBAR[i];
        if (slot) this.setTool(slot.id);
      });
    });

    // Click a tile to use the selected tool there.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.useToolAt(Math.floor(p.worldX / TILE), Math.floor(p.worldY / TILE));
    });

    // UI intents -> scene actions.
    this.unsubs.push(
      bus.on('ui:selectTool', (id) => this.setTool(id)),
      bus.on('ui:endDay', () => this.endDay()),
      bus.on('ui:buySeed', (cropId) => this.buySeed(cropId)),
      bus.on('ui:sellCrop', (cropId) => this.sellCrop(cropId)),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubs.forEach((u) => u());
      this.unsubs = [];
    });

    this.emitState();
  }

  private buildWorld() {
    for (let y = 0; y < GRID_H; y++) {
      this.tiles[y] = [];
      this.ground[y] = [];
      for (let x = 0; x < GRID_W; x++) {
        this.tiles[y][x] = { tilled: false, watered: false };
        this.ground[y][x] = this.add
          .image(x * TILE + TILE / 2, y * TILE + TILE / 2, 'grass')
          .setDepth(0);
      }
    }
  }

  private key(x: number, y: number): string {
    return `${x},${y}`;
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && x < GRID_W && y >= 0 && y < GRID_H;
  }

  private inRange(tx: number, ty: number): boolean {
    const px = Math.floor(this.player.x / TILE);
    const py = Math.floor(this.player.y / TILE);
    return Math.max(Math.abs(px - tx), Math.abs(py - ty)) <= REACH;
  }

  private setGroundTexture(x: number, y: number) {
    const t = this.tiles[y][x];
    const key = t.watered ? 'soil_wet' : t.tilled ? 'soil' : 'grass';
    this.ground[y][x].setTexture(key);
  }

  private useToolAt(tx: number, ty: number) {
    if (!this.inBounds(tx, ty) || !this.inRange(tx, ty)) return;

    const tile = this.tiles[ty][tx];
    const crop = this.crops.get(this.key(tx, ty));

    // A mature crop is harvested by any interaction.
    if (crop && crop.mature) {
      this.harvest(tx, ty);
      return;
    }

    if (this.selected === 'hoe') {
      if (!tile.tilled && !crop) {
        tile.tilled = true;
        this.setGroundTexture(tx, ty);
      }
    } else if (this.selected === 'can') {
      if (tile.tilled && !tile.watered) {
        tile.watered = true;
        this.setGroundTexture(tx, ty);
      }
    } else if (SEED_TO_CROP[this.selected]) {
      this.plant(tx, ty, this.selected);
    }
  }

  private plant(tx: number, ty: number, seedId: string) {
    const tile = this.tiles[ty][tx];
    if (!tile.tilled || this.crops.has(this.key(tx, ty))) return;
    if ((this.inventory[seedId] ?? 0) <= 0) {
      this.toast('Out of seeds');
      return;
    }
    const cropId = SEED_TO_CROP[seedId];
    const sprite = this.add
      .image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, `crop_${cropId}_0`)
      .setDepth(5);
    this.crops.set(this.key(tx, ty), { cropId, daysWatered: 0, mature: false, sprite });
    this.inventory[seedId] -= 1;
    this.emitState();
  }

  private harvest(tx: number, ty: number) {
    const k = this.key(tx, ty);
    const crop = this.crops.get(k);
    if (!crop) return;
    const def = CROPS[crop.cropId];
    crop.sprite.destroy();
    this.crops.delete(k);
    this.inventory[def.produceId] = (this.inventory[def.produceId] ?? 0) + 1;
    // Soil remains tilled but dries out.
    this.tiles[ty][tx].watered = false;
    this.setGroundTexture(tx, ty);
    this.toast(`Harvested ${def.name}`);
    this.emitState();
  }

  // Sleep: watered crops advance one growth day; all soil dries overnight.
  private endDay() {
    for (const [k, crop] of this.crops) {
      const [x, y] = k.split(',').map(Number);
      const tile = this.tiles[y][x];
      if (tile.watered && !crop.mature) {
        const def = CROPS[crop.cropId];
        crop.daysWatered = Math.min(crop.daysWatered + 1, def.daysToGrow);
        if (crop.daysWatered >= def.daysToGrow) crop.mature = true;
        crop.sprite.setTexture(`crop_${crop.cropId}_${crop.daysWatered}`);
      }
    }
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (this.tiles[y][x].watered) {
          this.tiles[y][x].watered = false;
          this.setGroundTexture(x, y);
        }
      }
    }
    this.day += 1;
    this.toast(`Day ${this.day} — a new morning`);
    this.emitState();
  }

  private buySeed(cropId: string) {
    const def = CROPS[cropId];
    if (!def) return;
    if (this.coins < def.seedCost) {
      this.toast('Not enough coins');
      return;
    }
    this.coins -= def.seedCost;
    this.inventory[def.seedId] = (this.inventory[def.seedId] ?? 0) + 1;
    this.toast(`Bought ${def.name} seed`);
    this.emitState();
  }

  private sellCrop(cropId: string) {
    const def = CROPS[cropId];
    if (!def) return;
    if ((this.inventory[def.produceId] ?? 0) <= 0) {
      this.toast(`No ${def.name} to sell`);
      return;
    }
    this.inventory[def.produceId] -= 1;
    this.coins += def.sellPrice;
    this.toast(`Sold ${def.name} (+${def.sellPrice})`);
    this.emitState();
  }

  private setTool(id: string) {
    this.selected = id;
    this.emitState();
  }

  private toast(msg: string) {
    bus.emit('toast', msg);
  }

  private emitState() {
    bus.emit('state', {
      coins: this.coins,
      day: this.day,
      selected: this.selected,
      inventory: { ...this.inventory },
    });
  }

  update() {
    let vx = 0;
    let vy = 0;
    if (this.cursors.left.isDown || this.wasd.left.isDown) vx = -1;
    else if (this.cursors.right.isDown || this.wasd.right.isDown) vx = 1;
    if (this.cursors.up.isDown || this.wasd.up.isDown) vy = -1;
    else if (this.cursors.down.isDown || this.wasd.down.isDown) vy = 1;

    const len = Math.hypot(vx, vy) || 1;
    this.player.setVelocity((vx / len) * PLAYER_SPEED, (vy / len) * PLAYER_SPEED);
    if (vx < 0) this.player.setFlipX(true);
    else if (vx > 0) this.player.setFlipX(false);

    // Tile highlight under the cursor: white if reachable, red if out of range.
    const p = this.input.activePointer;
    const tx = Math.floor(p.worldX / TILE);
    const ty = Math.floor(p.worldY / TILE);
    if (this.inBounds(tx, ty)) {
      this.highlight
        .setVisible(true)
        .setPosition(tx * TILE + TILE / 2, ty * TILE + TILE / 2)
        .setTint(this.inRange(tx, ty) ? 0xffffff : 0xff5555);
    } else {
      this.highlight.setVisible(false);
    }
  }
}
