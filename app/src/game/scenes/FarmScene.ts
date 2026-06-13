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

type Tile = { tilled: boolean; watered: boolean; obstacle: boolean };
type Crop = {
  cropId: string;
  daysWatered: number;
  mature: boolean;
  sprite: Phaser.GameObjects.Image;
};
type Dir = 'down' | 'up' | 'side';

// Fixed decoration layout. Kept away from the central spawn so there's open
// farmland in the middle.
const TREES: Array<[number, number]> = [
  [8, 3], [12, 6], [21, 4], [26, 7], [6, 13], [23, 15], [18, 2], [3, 12],
];
const ROCKS: Array<[number, number]> = [
  [10, 9], [24, 11], [15, 3], [19, 13], [5, 6],
];
const POND: { x0: number; y0: number; w: number; h: number } = { x0: 25, y0: 14, w: 3, h: 2 };
const CABIN = { cx: 3, baseY: 3, tilesW: 3 }; // 3 tiles wide, base on row 3

// The authoritative game world. Owns all farm state and exposes it to the UI
// through the EventBus. Real-time movement + tool use here is fully off-chain;
// see docs/ROADMAP.md for what moves on-chain.
export class FarmScene extends Phaser.Scene {
  private tiles: Tile[][] = [];
  private ground: Phaser.GameObjects.Image[][] = [];
  private crops = new Map<string, Crop>();
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;

  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private highlight!: Phaser.GameObjects.Image;
  private facing: Dir = 'down';
  private faceLeft = false;
  private pointerInside = false;

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
    this.obstacles = this.physics.add.staticGroup();
    this.buildWorld();
    this.placeDecorations();

    this.player = this.physics.add.sprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'player_down_0');
    this.player.setCollideWorldBounds(true);
    this.player.body!.setSize(10, 8).setOffset(7, 19); // collide on the feet only
    this.physics.add.collider(this.player, this.obstacles);
    this.createAnims();

    this.highlight = this.add.image(0, 0, 'highlight').setVisible(false).setDepth(100000);

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

    // Only show the tile cursor while the mouse is actually over the game.
    this.input.on('pointermove', () => (this.pointerInside = true));
    this.input.on('gameout', () => (this.pointerInside = false));

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

  private createAnims() {
    const make = (key: string, dir: Dir) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: [0, 1, 2, 3].map((n) => ({ key: `player_${dir}_${n}` })),
        frameRate: 8,
        repeat: -1,
      });
    };
    make('walk-down', 'down');
    make('walk-up', 'up');
    make('walk-side', 'side');
  }

  private buildWorld() {
    for (let y = 0; y < GRID_H; y++) {
      this.tiles[y] = [];
      this.ground[y] = [];
      for (let x = 0; x < GRID_W; x++) {
        this.tiles[y][x] = { tilled: false, watered: false, obstacle: false };
        const variant = (x * 7 + y * 13) % 3;
        this.ground[y][x] = this.add
          .image(x * TILE + TILE / 2, y * TILE + TILE / 2, `grass${variant}`)
          .setDepth(0);
      }
    }
  }

  private placeDecorations() {
    // Pond (ground-level water tiles + colliders).
    for (let dy = 0; dy < POND.h; dy++) {
      for (let dx = 0; dx < POND.w; dx++) {
        const tx = POND.x0 + dx;
        const ty = POND.y0 + dy;
        const cx = tx * TILE + TILE / 2;
        const cy = ty * TILE + TILE / 2;
        this.add.image(cx, cy, 'water').setDepth(1);
        this.tiles[ty][tx].obstacle = true;
        this.addCollider(cx, cy, TILE, TILE);
      }
    }

    // Cabin.
    const cabinX = CABIN.cx * TILE + TILE / 2;
    const cabinBase = (CABIN.baseY + 1) * TILE;
    this.add.image(cabinX, cabinBase, 'cabin').setOrigin(0.5, 1).setDepth(cabinBase);
    for (let ty = CABIN.baseY - 1; ty <= CABIN.baseY; ty++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = CABIN.cx + dx;
        if (this.inBounds(tx, ty)) this.tiles[ty][tx].obstacle = true;
      }
    }
    this.addCollider(cabinX, cabinBase - 13, 84, 26);

    // Rocks.
    for (const [tx, ty] of ROCKS) {
      const cx = tx * TILE + TILE / 2;
      const cy = ty * TILE + TILE / 2;
      this.add.image(cx, cy, 'rock').setDepth(cy + 8);
      this.tiles[ty][tx].obstacle = true;
      this.addCollider(cx, cy + 4, 22, 12);
    }

    // Trees (origin bottom-center; collide at the trunk only).
    for (const [tx, ty] of TREES) {
      const cx = tx * TILE + TILE / 2;
      const baseY = ty * TILE + TILE;
      this.add.image(cx, baseY, 'tree').setOrigin(0.5, 1).setDepth(baseY);
      this.tiles[ty][tx].obstacle = true;
      this.addCollider(cx, baseY - 6, 14, 10);
    }
  }

  // Invisible static collision box, sized from the 1x1 'pixel' texture.
  private addCollider(cx: number, cy: number, w: number, h: number) {
    const box = this.obstacles.create(cx, cy, 'pixel') as Phaser.Physics.Arcade.Sprite;
    box.setVisible(false).setDisplaySize(w, h).refreshBody();
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
    if (t.watered) this.ground[y][x].setTexture('soil_wet');
    else if (t.tilled) this.ground[y][x].setTexture('soil');
    else this.ground[y][x].setTexture(`grass${(x * 7 + y * 13) % 3}`);
  }

  private useToolAt(tx: number, ty: number) {
    if (!this.inBounds(tx, ty) || !this.inRange(tx, ty)) return;
    const tile = this.tiles[ty][tx];
    if (tile.obstacle) return;

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
    const baseY = ty * TILE + TILE;
    const sprite = this.add
      .image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, `crop_${cropId}_0`)
      .setDepth(baseY - 1);
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

    if (vx !== 0 || vy !== 0) {
      if (vx !== 0) {
        this.facing = 'side';
        this.faceLeft = vx < 0;
      } else {
        this.facing = vy < 0 ? 'up' : 'down';
      }
      this.player.setFlipX(this.facing === 'side' && this.faceLeft);
      this.player.anims.play(`walk-${this.facing}`, true);
    } else {
      this.player.anims.stop();
      this.player.setTexture(`player_${this.facing}_0`);
      this.player.setFlipX(this.facing === 'side' && this.faceLeft);
    }

    // y-sort the player against trees/rocks/crops by its feet position.
    this.player.setDepth(this.player.y + 14);

    // Tile highlight under the cursor: white if reachable, red if too far.
    const p = this.input.activePointer;
    const tx = Math.floor(p.worldX / TILE);
    const ty = Math.floor(p.worldY / TILE);
    if (this.pointerInside && this.inBounds(tx, ty)) {
      this.highlight
        .setVisible(true)
        .setPosition(tx * TILE + TILE / 2, ty * TILE + TILE / 2)
        .setTint(this.inRange(tx, ty) ? 0xffffff : 0xff5555);
    } else {
      this.highlight.setVisible(false);
    }
  }
}
