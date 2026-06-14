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
  STAGES,
  WET_MS,
  DAY_LENGTH_MS,
  RESTOCK_MS,
} from '../constants';
import {
  PLANTS,
  PLANT_BY_ID,
  RARITY,
  RARITY_UNLOCK,
  rarityRank,
  pickMutation,
  cropValue,
  stackKey,
  rollShop,
  MUTATION_BY_ID,
  type Plant,
  type Mutation,
} from '../economy';
import {
  ACHIEVEMENTS,
  EMPTY_UPGRADES,
  UPGRADE_BY_ID,
  fortuneLuck,
  growthFactor,
  harvestXp,
  levelInfo,
  restockReductionMs,
  toolRadius,
  type UpgradeId,
  type Upgrades,
} from '../progression';
import { ANIMAL_BY_ID, ANIMALS, type AnimalDef } from '../animals';
import { bus } from '../EventBus';
import { sfx } from '../audio';

type Tile = { tilled: boolean; wetUntil: number; obstacle: boolean };
type Crop = {
  plant: Plant;
  tx: number;
  ty: number;
  grownMs: number;
  stage: number;
  mature: boolean;
  mutation: Mutation | null;
  wetAtMature: boolean;
  sprite: Phaser.GameObjects.Image;
  glow?: Phaser.GameObjects.Image;
  sparkle?: Phaser.GameObjects.Particles.ParticleEmitter;
};
type Dir = 'down' | 'up' | 'left' | 'right';

const TREES: Array<[number, number]> = [
  [8, 3], [12, 6], [21, 4], [26, 7], [6, 13], [23, 15], [18, 2], [3, 12],
];
const ROCKS: Array<[number, number]> = [
  [10, 9], [24, 11], [15, 3], [19, 13], [5, 6],
];
const POND = { x0: 25, y0: 14, w: 3, h: 2 };
const CABIN = { cx: 4, baseY: 4 };
const PEN = { x0: 5 * TILE, y0: 6 * TILE, x1: 11 * TILE, y1: 11 * TILE }; // chicken roaming area

type Animal = {
  sprite: Phaser.GameObjects.Sprite;
  type: string;
  layAt: number;
  nextWander: number;
  product?: Phaser.GameObjects.Image;
};

const SAVE_KEY = 'solana-valley:save';
const SAVE_VERSION = 5;

type SaveData = {
  v: number;
  coins: number;
  selected: string;
  selectedSeed: string | null;
  seeds: Record<string, number>;
  harvest: Record<string, number>;
  shopStock: Record<string, number>;
  timeMs: number;
  restockMs: number;
  tiles: Array<[number, number, number]>; // x, y, wetRemainingMs (tilled implied)
  crops: Array<{ x: number; y: number; p: string; g: number; m: boolean; mut: string | null; wet: boolean }>;
  // progression
  xp: number;
  upgrades: Upgrades;
  earned: number;
  harvested: number;
  mutationsFound: number;
  discPlants: string[];
  discMutations: string[];
  achievements: string[];
  animals: Record<string, number>;
};

export class FarmScene extends Phaser.Scene {
  private tiles: Tile[][] = [];
  private ground: Phaser.GameObjects.Image[][] = [];
  private overlay: Phaser.GameObjects.Image[][] = []; // tilled-dirt autotile over grass
  private crops = new Map<string, Crop>();
  private wetTiles = new Set<string>();
  private rainbowCrops = new Set<Crop>();
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;

  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private highlight!: Phaser.GameObjects.Image;
  private ambient!: Phaser.GameObjects.Rectangle;
  private fireflies!: Phaser.GameObjects.Particles.ParticleEmitter;
  private facing: Dir = 'down';
  private pointerInside = false;
  private actingUntil = 0;

  private coins = STARTING_COINS;
  private selected = 'hoe';
  private selectedSeed: string | null = 'carrot';
  private seeds: Record<string, number> = { carrot: 5 };
  private harvestInv: Record<string, number> = {};
  private shopStock: Record<string, number> = {};

  // progression
  private xp = 0;
  private upgrades: Upgrades = { ...EMPTY_UPGRADES };
  private earned = 0;
  private harvested = 0;
  private mutationsFound = 0;
  private discoveredPlants = new Set<string>();
  private discoveredMutations = new Set<string>();
  private achievements = new Set<string>();
  private animals: Animal[] = [];
  private animalCounts: Record<string, number> = {};

  private timeMs = DAY_LENGTH_MS * 0.34; // start mid-morning
  private restockMs = RESTOCK_MS;
  private growthMult = 1;
  private forcedMutation: Mutation | null = null;
  private persist = true;
  private unsubs: Array<() => void> = [];

  constructor() {
    super('Farm');
  }

  create() {
    this.applyDevParams();

    this.physics.world.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.obstacles = this.physics.add.staticGroup();
    this.createAnims();
    this.buildWorld();
    this.placeDecorations();

    this.player = this.physics.add.sprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'char', 0);
    this.player.setCollideWorldBounds(true);
    this.player.setOrigin(0.5, 0.72).setScale(1.25);
    this.player.body!.setSize(13, 9).setOffset(17, 33);
    this.physics.add.collider(this.player, this.obstacles);

    // Fireflies drift in at night.
    this.fireflies = this.add
      .particles(0, 0, 'p_bit', {
        tint: [0xfff3a0, 0xfff7c8, 0xd6ff9a],
        x: { min: 0, max: GAME_WIDTH },
        y: { min: GAME_HEIGHT * 0.15, max: GAME_HEIGHT },
        lifespan: 2800,
        frequency: 200,
        scale: { start: 1.4, end: 0 },
        alpha: { start: 0.9, end: 0 },
        speed: { min: 4, max: 16 },
        blendMode: 'ADD',
        emitting: false,
      })
      .setDepth(89500);

    this.add
      .image(0, 0, 'vignette')
      .setOrigin(0, 0)
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
      .setDepth(88000);

    this.ambient = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0a1430, 1)
      .setOrigin(0, 0)
      .setDepth(90000)
      .setAlpha(0);

    this.highlight = this.add.image(0, 0, 'highlight').setVisible(false).setDepth(100000);

    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = {
      up: kb.addKey('W'),
      down: kb.addKey('S'),
      left: kb.addKey('A'),
      right: kb.addKey('D'),
    };
    ['ONE', 'TWO', 'THREE'].forEach((key, i) => {
      kb.on(`keydown-${key}`, () => this.setTool((['hoe', 'can', 'seed'] as const)[i]));
    });

    // Browsers suspend audio until a user gesture; resume on first input.
    this.input.once('pointerdown', () => sfx.resume());
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.tryCollectAnimal(p.worldX, p.worldY)) return;
      this.useToolAt(Math.floor(p.worldX / TILE), Math.floor(p.worldY / TILE));
    });
    this.input.on('pointermove', () => (this.pointerInside = true));
    this.input.on('gameout', () => (this.pointerInside = false));

    this.shopStock = rollShop(levelInfo(this.xp).level);
    if (this.persist) this.loadSave();

    this.unsubs.push(
      bus.on('ui:selectTool', (id) => this.setTool(id)),
      bus.on('ui:selectSeed', (id) => this.selectSeed(id)),
      bus.on('ui:buySeed', (id) => this.buySeed(id)),
      bus.on('ui:sellStack', (key) => this.sellStack(key)),
      bus.on('ui:sellAll', () => this.sellAll()),
      bus.on('ui:buyUpgrade', (id) => this.buyUpgrade(id)),
      bus.on('ui:buyAnimal', (id) => this.buyAnimal(id)),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubs.forEach((u) => u());
      this.unsubs = [];
    });

    if (this.persist) {
      this.time.addEvent({ delay: 8000, loop: true, callback: () => this.saveState() });
      const onHide = () => this.saveState();
      window.addEventListener('visibilitychange', onHide);
      window.addEventListener('pagehide', onHide);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        window.removeEventListener('visibilitychange', onHide);
        window.removeEventListener('pagehide', onHide);
        this.saveState();
      });
    }

    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.emitClock() });

    this.emitState();
    this.emitClock();

    // Expose for debugging / e2e screenshots when a dev param is present.
    if (location.search.length > 1) {
      (window as unknown as { __farm?: FarmScene }).__farm = this;
    }
  }

  // Debug snapshot used by the screenshot harness.
  debugDump() {
    const sample = [...this.crops.values()][0];
    return {
      coins: this.coins,
      seeds: this.seeds,
      selected: this.selected,
      selectedSeed: this.selectedSeed,
      crops: this.crops.size,
      growthMult: this.growthMult,
      sample: sample
        ? { id: sample.plant.id, stage: sample.stage, mature: sample.mature, grownMs: Math.round(sample.grownMs) }
        : null,
    };
  }

  // Optional URL params for testing/screenshots: ?fast=N (growth speed),
  // ?give=carrot:5,pumpkin:3 (grant seeds), ?mut=gold (force a mutation).
  private applyDevParams() {
    const params = new URLSearchParams(location.search);
    const fast = Number(params.get('fast'));
    this.growthMult = Number.isFinite(fast) && fast > 0 ? fast : 1;

    const give = params.get('give');
    if (give) {
      let first: string | null = null;
      for (const part of give.split(',')) {
        const [id, count] = part.split(':');
        if (PLANT_BY_ID[id]) {
          this.seeds[id] = (this.seeds[id] ?? 0) + (Number(count) || 1);
          first ??= id;
        }
      }
      if (first) this.selectedSeed = first;
    }

    const mut = params.get('mut');
    this.forcedMutation = mut && MUTATION_BY_ID[mut] ? MUTATION_BY_ID[mut] : null;

    const timeRaw = params.get('time');
    if (timeRaw !== null) {
      const t = Number(timeRaw);
      if (Number.isFinite(t) && t >= 0 && t < 1) this.timeMs = DAY_LENGTH_MS * t;
    }

    const coins = Number(params.get('coins'));
    if (Number.isFinite(coins) && coins > 0) this.coins = coins;

    const xp = Number(params.get('xp'));
    if (Number.isFinite(xp) && xp > 0) this.xp = xp;

    if (params.has('reset')) localStorage.removeItem(SAVE_KEY);
    // Don't load/save during scripted/dev sessions so demos stay deterministic.
    this.persist = !['fast', 'give', 'mut', 'time', 'debug', 'reset', 'coins', 'xp'].some((k) => params.has(k));
  }

  private static DIR_ROW: Record<Dir, number> = { down: 0, up: 4, left: 8, right: 12 };

  private createAnims() {
    for (const dir of ['down', 'up', 'left', 'right'] as Dir[]) {
      const key = `walk-${dir}`;
      if (this.anims.exists(key)) continue;
      const start = FarmScene.DIR_ROW[dir];
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers('char', { start, end: start + 3 }),
        frameRate: 8,
        repeat: -1,
      });
    }
    if (!this.anims.exists('water-anim')) {
      this.anims.create({
        key: 'water-anim',
        frames: this.anims.generateFrameNumbers('water', { start: 0, end: 3 }),
        frameRate: 6,
        repeat: -1,
      });
    }
    // Tool-use poses from the Sprout Lands action sheet.
    const actionFrames: Record<string, number[]> = { hoe: [0, 1, 0], water: [16, 17, 16] };
    for (const [name, frames] of Object.entries(actionFrames)) {
      const key = `act-${name}`;
      if (!this.anims.exists(key)) {
        this.anims.create({ key, frames: this.anims.generateFrameNumbers('actions', { frames }), frameRate: 8, repeat: 0 });
      }
    }
    for (const a of ANIMALS) {
      if (!this.anims.exists(`${a.id}-idle`)) {
        this.anims.create({ key: `${a.id}-idle`, frames: this.anims.generateFrameNumbers(a.sheet, { frames: a.idleFrames }), frameRate: 3, repeat: -1 });
      }
      if (!this.anims.exists(`${a.id}-walk`)) {
        this.anims.create({ key: `${a.id}-walk`, frames: this.anims.generateFrameNumbers(a.sheet, { frames: a.walkFrames }), frameRate: 6, repeat: -1 });
      }
    }
  }

  private playAction(tool: 'hoe' | 'water') {
    this.actingUntil = this.time.now + 360;
    this.player.anims.play(`act-${tool}`, true);
  }

  private grassFrame(x: number, y: number): number {
    return (x * 7 + y * 13) % 3; // clean full-grass tiles 0..2
  }

  // Solid tilled-dirt tiles (premium Tilled_Dirt_v2 sheet, 11 cols) that tile
  // seamlessly into a filled plot; a few variants add subtle texture.
  private static TILLED_FRAMES = [55, 56, 57];

  private buildWorld() {
    for (let y = 0; y < GRID_H; y++) {
      this.tiles[y] = [];
      this.ground[y] = [];
      this.overlay[y] = [];
      for (let x = 0; x < GRID_W; x++) {
        this.tiles[y][x] = { tilled: false, wetUntil: 0, obstacle: false };
        const cx = x * TILE + TILE / 2;
        const cy = y * TILE + TILE / 2;
        this.ground[y][x] = this.add.image(cx, cy, 'grass', this.grassFrame(x, y)).setScale(2).setDepth(0);
        this.overlay[y][x] = this.add.image(cx, cy, 'tilled', 42).setScale(2).setDepth(1).setVisible(false);
      }
    }
  }

  private solidTilledFrame(x: number, y: number): number {
    return FarmScene.TILLED_FRAMES[(x * 7 + y * 13) % 3];
  }

  // Refresh a tile and its 4 neighbours (their autotile edges depend on it).
  private refreshTile(x: number, y: number) {
    const around: Array<[number, number]> = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of around) if (this.inBounds(x + dx, y + dy)) this.setGroundTexture(x + dx, y + dy);
  }

  private placeDecorations() {
    // Pond (animated water).
    for (let dy = 0; dy < POND.h; dy++) {
      for (let dx = 0; dx < POND.w; dx++) {
        const tx = POND.x0 + dx;
        const ty = POND.y0 + dy;
        const cx = tx * TILE + TILE / 2;
        const cy = ty * TILE + TILE / 2;
        this.add.sprite(cx, cy, 'water', 0).setScale(2).setDepth(1).play('water-anim');
        this.tiles[ty][tx].obstacle = true;
        this.addCollider(cx, cy, TILE, TILE);
      }
    }

    // Cottage.
    const cabinX = CABIN.cx * TILE + TILE / 2;
    const cabinBase = (CABIN.baseY + 1) * TILE;
    this.add.image(cabinX, cabinBase, 'house', 'cottage').setOrigin(0.5, 1).setScale(2).setDepth(cabinBase);
    for (let ty = CABIN.baseY - 2; ty <= CABIN.baseY; ty++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = CABIN.cx + dx;
        if (this.inBounds(tx, ty)) this.tiles[ty][tx].obstacle = true;
      }
    }
    this.addCollider(cabinX, cabinBase - 12, 84, 24);

    // Rocks.
    const rockFrames = ['rock_l', 'rock_s', 'rock_pile'];
    ROCKS.forEach(([tx, ty], i) => {
      const cx = tx * TILE + TILE / 2;
      const cy = ty * TILE + TILE / 2;
      this.add.image(cx, cy + 4, 'biome', rockFrames[i % rockFrames.length]).setScale(2).setDepth(cy + 8);
      this.tiles[ty][tx].obstacle = true;
      this.addCollider(cx, cy + 6, 24, 12);
    });

    // Trees (with a gentle sway from the base).
    const treeFrames = ['tree', 'tree_apple'];
    TREES.forEach(([tx, ty], i) => {
      const cx = tx * TILE + TILE / 2;
      const baseY = ty * TILE + TILE;
      const tree = this.add
        .image(cx, baseY + 4, 'biome', treeFrames[i % treeFrames.length])
        .setOrigin(0.5, 1)
        .setScale(2)
        .setDepth(baseY);
      this.tiles[ty][tx].obstacle = true;
      this.addCollider(cx, baseY - 4, 16, 12);
      this.tweens.add({
        targets: tree,
        angle: { from: -1.3, to: 1.3 },
        duration: 2200 + Math.random() * 800,
        delay: Math.random() * 1500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    });

    // Water well (left of the cabin).
    const wellX = 2 * TILE + TILE / 2;
    const wellY = 7 * TILE;
    this.add.image(wellX, wellY, 'well').setScale(2).setDepth(wellY + 24);
    for (const [ox, oy] of [[1, 6], [2, 6], [1, 7], [2, 7]] as Array<[number, number]>) {
      if (this.inBounds(ox, oy)) this.tiles[oy][ox].obstacle = true;
    }
    this.addCollider(wellX, wellY, 44, 38);

    // Chicken coop above the animal pen.
    const coopX = 8 * TILE;
    const coopBase = 6 * TILE;
    this.add.image(coopX, coopBase, 'coop', 'coop').setOrigin(0.5, 1).setScale(2).setDepth(coopBase);
    for (let oy = 4; oy <= 5; oy++) {
      for (let ox = 6; ox <= 9; ox++) if (this.inBounds(ox, oy)) this.tiles[oy][ox].obstacle = true;
    }
    this.addCollider(coopX, coopBase - 18, 110, 30);

    // Scatter flowers / bushes on open grass.
    const decoFrames = ['flower_y', 'flower_p', 'flower_p2', 'bush', 'bush2', 'sprout', 'stump'];
    let placed = 0;
    let guard = 0;
    while (placed < 18 && guard++ < 300) {
      const tx = Phaser.Math.Between(1, GRID_W - 2);
      const ty = Phaser.Math.Between(1, GRID_H - 2);
      if (this.tiles[ty][tx].obstacle) continue;
      this.add
        .image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'biome', decoFrames[placed % decoFrames.length])
        .setScale(2)
        .setDepth(2);
      placed++;
    }

    // Scatter premium mushrooms / stones / flowers for extra life.
    const mfsFrames = [0, 3, 12, 15, 25, 36, 48, 52];
    let m = 0;
    let mg = 0;
    while (m < 12 && mg++ < 200) {
      const tx = Phaser.Math.Between(1, GRID_W - 2);
      const ty = Phaser.Math.Between(1, GRID_H - 2);
      if (this.tiles[ty][tx].obstacle) continue;
      this.add
        .image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'mfs', mfsFrames[m % mfsFrames.length])
        .setScale(2)
        .setDepth(3);
      m++;
    }
  }

  private addCollider(cx: number, cy: number, w: number, h: number) {
    const box = this.obstacles.create(cx, cy, 'pixel') as Phaser.Physics.Arcade.Sprite;
    box.setVisible(false).setDisplaySize(w, h).refreshBody();
  }

  // ---- helpers ------------------------------------------------------------

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

  private isWet(tx: number, ty: number): boolean {
    return this.time.now < this.tiles[ty][tx].wetUntil;
  }

  private cropDepth(ty: number): number {
    return ty * TILE + TILE;
  }

  private setGroundTexture(x: number, y: number) {
    const ov = this.overlay[y][x];
    if (this.tiles[y][x].tilled) {
      ov.setVisible(true).setFrame(this.solidTilledFrame(x, y)).setTint(this.isWet(x, y) ? 0x9b8763 : 0xffffff);
    } else {
      ov.setVisible(false);
    }
  }

  // ---- tools --------------------------------------------------------------

  private useToolAt(tx: number, ty: number) {
    if (!this.inBounds(tx, ty) || !this.inRange(tx, ty)) return;
    const crop = this.crops.get(this.key(tx, ty));
    if (crop && crop.mature) {
      this.harvest(tx, ty);
      return;
    }

    if (this.selected === 'hoe') {
      let did = false;
      this.forArea(tx, ty, toolRadius(this.upgrades.hoe), (x, y) => {
        if (this.till(x, y)) did = true;
      });
      if (did) {
        this.playAction('hoe');
        sfx.play('till'); // once per click, not per tilled tile
      }
    } else if (this.selected === 'can') {
      let did = false;
      this.forArea(tx, ty, toolRadius(this.upgrades.water), (x, y) => {
        if (this.waterTile(x, y)) did = true;
      });
      if (did) {
        this.playAction('water');
        sfx.play('water'); // once per click, not per watered tile
      }
    } else if (this.selected === 'seed') {
      this.plant(tx, ty);
    }
  }

  // Apply a callback over a (2r+1)² area, skipping out-of-bounds/obstacle tiles.
  private forArea(cx: number, cy: number, r: number, fn: (x: number, y: number) => void) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (this.inBounds(x, y) && !this.tiles[y][x].obstacle) fn(x, y);
      }
    }
  }

  private till(x: number, y: number): boolean {
    const t = this.tiles[y][x];
    if (t.tilled || this.crops.has(this.key(x, y))) return false;
    t.tilled = true;
    this.refreshTile(x, y);
    return true;
  }

  private waterTile(x: number, y: number): boolean {
    if (!this.tiles[y][x].tilled) return false;
    this.water(x, y);
    return true;
  }

  private water(tx: number, ty: number) {
    this.tiles[ty][tx].wetUntil = this.time.now + WET_MS;
    this.wetTiles.add(this.key(tx, ty));
    this.setGroundTexture(tx, ty);
    this.burst(tx * TILE + TILE / 2, ty * TILE + 8, 'p_droplet', {
      speed: { min: 30, max: 80 },
      angle: { min: 200, max: 340 },
      lifespan: 450,
      scale: { start: 1, end: 0 },
      gravityY: 160,
    }, 7);
  }

  private plant(tx: number, ty: number) {
    const tile = this.tiles[ty][tx];
    if (!tile.tilled || this.crops.has(this.key(tx, ty))) return;
    const seed = this.selectedSeed;
    if (!seed) {
      this.toast('Select a seed first');
      return;
    }
    if ((this.seeds[seed] ?? 0) <= 0) {
      this.toast(`No ${PLANT_BY_ID[seed].name} seeds`);
      return;
    }
    const plant = PLANT_BY_ID[seed];
    const sprite = this.add
      .image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'cropsheet', plant.cropRow * 5)
      .setScale(2)
      .setDepth(this.cropDepth(ty) - 1);
    this.crops.set(this.key(tx, ty), {
      plant, tx, ty, grownMs: 0, stage: 0, mature: false, mutation: null, wetAtMature: false, sprite,
    });
    this.seeds[seed] -= 1;
    this.burst(tx * TILE + TILE / 2, ty * TILE + 12, 'p_bit', {
      tint: 0x8a5a2b,
      speed: { min: 20, max: 55 },
      angle: { min: 240, max: 300 },
      lifespan: 380,
      scale: { start: 1, end: 0 },
    }, 6);
    sfx.play('plant');
    this.emitState();
  }

  private matureCrop(crop: Crop) {
    crop.mature = true;
    crop.stage = STAGES - 1;
    crop.mutation = this.forcedMutation ?? pickMutation(fortuneLuck(this.upgrades.fortune));
    crop.wetAtMature = this.isWet(crop.tx, crop.ty);
    this.applyMatureVisuals(crop, true);
  }

  // Sprite tint + glow + sparkle for a mature crop. Shared by fresh maturity
  // and save-restore (announce = show the "ready" toast).
  private applyMatureVisuals(crop: Crop, announce: boolean) {
    const m = crop.mutation;
    if (!m) return;
    crop.sprite.setFrame(crop.plant.cropRow * 5 + (STAGES - 1));

    const cx = crop.tx * TILE + TILE / 2;
    const cy = crop.ty * TILE + TILE / 2;
    const rank = rarityRank(crop.plant.rarity);
    const special = m.id !== 'normal' || rank >= 3;

    if (m.rainbow) this.rainbowCrops.add(crop);
    else if (m.tint != null) crop.sprite.setTint(m.tint);

    if (special) {
      const tint = m.rainbow ? 0xffffff : (m.tint ?? RARITY[crop.plant.rarity].glow);
      crop.glow = this.add
        .image(cx, cy - 4, 'glow')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(tint)
        .setDepth(this.cropDepth(crop.ty) - 2)
        .setScale(0.7)
        .setAlpha(0.5);
      this.tweens.add({
        targets: crop.glow,
        alpha: 0.85,
        scale: 0.95,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
      crop.sparkle = this.add
        .particles(cx, cy - 6, 'p_star', {
          lifespan: 900,
          frequency: 260,
          scale: { start: 0.8, end: 0 },
          alpha: { start: 0.9, end: 0 },
          tint: m.rainbow ? 0xffffff : (m.tint ?? RARITY[crop.plant.rarity].color),
          speedY: { min: -14, max: -3 },
          x: { min: -7, max: 7 },
          y: { min: -12, max: 2 },
        })
        .setDepth(this.cropDepth(crop.ty) + 1);

      if (announce) {
        const label = m.id !== 'normal' ? `${m.name} ` : '';
        this.toast(`✨ ${label}${crop.plant.name} is ready!`);
      }
    }
  }

  private harvest(tx: number, ty: number) {
    const k = this.key(tx, ty);
    const crop = this.crops.get(k);
    if (!crop || !crop.mature) return;
    sfx.play('harvest');
    const m = crop.mutation ?? MUTATION_BY_ID.normal;
    const value = cropValue(crop.plant, m, crop.wetAtMature);
    this.harvestInv[stackKey(crop.plant.id, m.id, crop.wetAtMature)] =
      (this.harvestInv[stackKey(crop.plant.id, m.id, crop.wetAtMature)] ?? 0) + 1;

    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    this.burst(cx, cy, 'p_bit', {
      tint: crop.plant.color,
      speed: { min: 40, max: 120 },
      lifespan: 560,
      scale: { start: 1.3, end: 0 },
      gravityY: 220,
    }, 12);
    if (rarityRank(crop.plant.rarity) >= 3 || m.id !== 'normal') {
      this.burst(cx, cy, 'p_star', {
        speed: { min: 30, max: 90 },
        lifespan: 700,
        scale: { start: 1, end: 0 },
        tint: m.rainbow ? 0xff7ad0 : (m.tint ?? RARITY[crop.plant.rarity].color),
      }, 8);
    }

    this.removeCrop(crop);
    this.crops.delete(k);

    this.harvested += 1;
    this.discoveredPlants.add(crop.plant.id);
    if (m.id !== 'normal') {
      this.mutationsFound += 1;
      this.discoveredMutations.add(m.id);
    }
    this.gainXp(harvestXp(crop.plant.baseValue));
    this.checkAchievements();

    const label = m.id !== 'normal' ? `${m.name} ` : '';
    this.toast(`Harvested ${label}${crop.plant.name} (worth ${value}🪙)`);
    this.emitState();
  }

  private removeCrop(crop: Crop) {
    crop.sprite.destroy();
    crop.glow?.destroy();
    crop.sparkle?.destroy();
    this.rainbowCrops.delete(crop);
  }

  // One-shot particle burst that cleans itself up.
  private burst(
    x: number,
    y: number,
    texture: string,
    cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig,
    count: number,
  ) {
    const emitter = this.add.particles(x, y, texture, { emitting: false, ...cfg });
    emitter.explode(count, x, y);
    const life = typeof cfg.lifespan === 'number' ? cfg.lifespan : 700;
    this.time.delayedCall(life + 200, () => emitter.destroy());
  }

  // ---- economy ------------------------------------------------------------

  private buySeed(plantId: string) {
    const plant = PLANT_BY_ID[plantId];
    if (!plant) return;
    if (RARITY_UNLOCK[plant.rarity] > levelInfo(this.xp).level) {
      this.toast(`${plant.rarity} unlocks at level ${RARITY_UNLOCK[plant.rarity]}`);
      return;
    }
    if ((this.shopStock[plantId] ?? 0) <= 0) {
      this.toast('Out of stock');
      return;
    }
    if (this.coins < plant.seedCost) {
      this.toast('Not enough coins');
      return;
    }
    this.coins -= plant.seedCost;
    this.shopStock[plantId] -= 1;
    this.seeds[plantId] = (this.seeds[plantId] ?? 0) + 1;
    this.selectedSeed = plantId;
    this.selected = 'seed';
    sfx.play('buy');
    this.toast(`Bought ${plant.name} seed`);
    this.emitState();
  }

  private selectSeed(plantId: string) {
    if ((this.seeds[plantId] ?? 0) <= 0) {
      this.toast(`No ${PLANT_BY_ID[plantId]?.name ?? ''} seeds`);
      return;
    }
    this.selectedSeed = plantId;
    this.selected = 'seed';
    this.emitState();
  }

  private sellStack(key: string) {
    const count = this.harvestInv[key] ?? 0;
    if (count <= 0) return;
    const [plantId, mutId, wet] = key.split('|');
    const value = cropValue(PLANT_BY_ID[plantId], MUTATION_BY_ID[mutId], wet === '1') * count;
    delete this.harvestInv[key];
    this.coins += value;
    this.earned += value;
    sfx.play('sell');
    this.checkAchievements();
    this.toast(`Sold ${count}× ${PLANT_BY_ID[plantId].name} (+${value}🪙)`);
    this.emitState();
  }

  private sellAll() {
    let total = 0;
    for (const [key, count] of Object.entries(this.harvestInv)) {
      const [plantId, mutId, wet] = key.split('|');
      total += cropValue(PLANT_BY_ID[plantId], MUTATION_BY_ID[mutId], wet === '1') * count;
    }
    if (total <= 0) {
      this.toast('Nothing to sell');
      return;
    }
    this.harvestInv = {};
    this.coins += total;
    this.earned += total;
    sfx.play('sell');
    this.checkAchievements();
    this.toast(`Sold everything (+${total}🪙)`);
    this.emitState();
  }

  private setTool(id: string) {
    if (id === 'seed' && !this.selectedSeed) {
      const owned = PLANTS.find((p) => (this.seeds[p.id] ?? 0) > 0);
      this.selectedSeed = owned?.id ?? null;
    }
    this.selected = id;
    this.emitState();
  }

  private restock() {
    this.shopStock = rollShop(levelInfo(this.xp).level);
    this.restockMs = Math.max(20_000, RESTOCK_MS - restockReductionMs(this.upgrades.supply));
    this.toast('🛒 The seed shop restocked!');
    this.emitState();
  }

  private gainXp(amount: number) {
    const before = levelInfo(this.xp).level;
    this.xp += amount;
    const after = levelInfo(this.xp).level;
    if (after > before) {
      sfx.play('levelup');
      this.toast(`⭐ Level ${after}!`);
      this.shopStock = rollShop(after); // reveal newly-unlocked tiers right away
    }
  }

  private checkAchievements() {
    const stats = {
      earned: this.earned,
      harvested: this.harvested,
      mutationsFound: this.mutationsFound,
      plantsDiscovered: this.discoveredPlants.size,
      level: levelInfo(this.xp).level,
    };
    for (const a of ACHIEVEMENTS) {
      if (!this.achievements.has(a.id) && a.test(stats)) {
        this.achievements.add(a.id);
        this.coins += a.reward;
        sfx.play('achievement');
        this.toast(`🏆 ${a.name}!  +${a.reward}🪙`);
      }
    }
  }

  private buyUpgrade(id: string) {
    const def = UPGRADE_BY_ID[id as UpgradeId];
    if (!def) return;
    const lvl = this.upgrades[def.id];
    if (lvl >= def.max) {
      this.toast('Already maxed');
      return;
    }
    const cost = def.cost(lvl);
    if (this.coins < cost) {
      this.toast('Not enough coins');
      return;
    }
    this.coins -= cost;
    this.upgrades[def.id] = lvl + 1;
    sfx.play('upgrade');
    this.toast(`${def.icon} ${def.name} upgraded to Lv ${lvl + 1}!`);
    this.emitState();
  }

  // ---- animals ------------------------------------------------------------

  private spawnAnimal(def: AnimalDef, x: number, y: number) {
    const s = this.add.sprite(x, y, def.sheet, def.idleFrames[0]).setScale(def.scale).setDepth(y + 14);
    s.play(`${def.id}-idle`);
    this.animals.push({
      sprite: s,
      type: def.id,
      layAt: this.time.now + def.layMs / this.growthMult,
      nextWander: this.time.now + 1500 + Math.random() * 3000,
    });
  }

  private buyAnimal(id: string) {
    const def = ANIMAL_BY_ID[id];
    if (!def) return;
    if (levelInfo(this.xp).level < def.unlockLevel) {
      this.toast(`${def.name}s unlock at level ${def.unlockLevel}`);
      return;
    }
    if (this.coins < def.cost) {
      this.toast('Not enough coins');
      return;
    }
    this.coins -= def.cost;
    this.animalCounts[id] = (this.animalCounts[id] ?? 0) + 1;
    this.spawnAnimal(
      def,
      Phaser.Math.Between(PEN.x0 + 16, PEN.x1 - 16),
      Phaser.Math.Between(PEN.y0 + 16, PEN.y1 - 16),
    );
    sfx.play('buy');
    this.toast(`Bought a ${def.name}! It roams the pen and makes ${def.productName.toLowerCase()}.`);
    this.emitState();
  }

  // Collect a ready product if the click landed on an animal. Returns true if so.
  private tryCollectAnimal(wx: number, wy: number): boolean {
    for (const a of this.animals) {
      if (a.product && Phaser.Math.Distance.Between(wx, wy, a.sprite.x, a.sprite.y) < 30) {
        const def = ANIMAL_BY_ID[a.type];
        a.product.destroy();
        a.product = undefined;
        a.layAt = this.time.now + def.layMs / this.growthMult;
        this.coins += def.productValue;
        this.earned += def.productValue;
        this.gainXp(def.xp);
        this.checkAchievements();
        sfx.play('sell');
        this.burst(a.sprite.x, a.sprite.y - 10, 'p_star', {
          speed: { min: 30, max: 80 }, lifespan: 600, scale: { start: 1, end: 0 }, tint: 0xfff3a0,
        }, 6);
        this.toast(`Collected ${def.productName} (+${def.productValue}🪙)`);
        this.emitState();
        return true;
      }
    }
    return false;
  }

  private updateAnimals(time: number) {
    for (const a of this.animals) {
      const def = ANIMAL_BY_ID[a.type];
      if (time > a.nextWander && !this.tweens.isTweening(a.sprite)) {
        a.nextWander = time + 2500 + Math.random() * 3500;
        const nx = Phaser.Math.Clamp(a.sprite.x + (Math.random() * 2 - 1) * 48, PEN.x0 + 12, PEN.x1 - 12);
        const ny = Phaser.Math.Clamp(a.sprite.y + (Math.random() * 2 - 1) * 48, PEN.y0 + 12, PEN.y1 - 12);
        a.sprite.setFlipX(nx < a.sprite.x);
        a.sprite.play(`${a.type}-walk`, true);
        this.tweens.add({
          targets: a.sprite, x: nx, y: ny, duration: 1100, ease: 'Sine.inOut',
          onComplete: () => a.sprite.play(`${a.type}-idle`, true),
        });
      }
      if (!a.product && time >= a.layAt) {
        a.product = this.add
          .image(a.sprite.x, a.sprite.y + def.productOffsetY, def.productSheet, def.productFrame)
          .setScale(2)
          .setDepth(99990);
      }
      if (a.product) a.product.setPosition(a.sprite.x, a.sprite.y + def.productOffsetY);
      a.sprite.setDepth(a.sprite.y + 14);
    }
  }

  // ---- persistence (localStorage) ----------------------------------------

  private saveState() {
    const tiles: SaveData['tiles'] = [];
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const t = this.tiles[y][x];
        if (t.tilled) tiles.push([x, y, Math.max(0, t.wetUntil - this.time.now)]);
      }
    }
    const crops: SaveData['crops'] = [];
    for (const c of this.crops.values()) {
      crops.push({
        x: c.tx, y: c.ty, p: c.plant.id, g: Math.round(c.grownMs),
        m: c.mature, mut: c.mutation?.id ?? null, wet: c.wetAtMature,
      });
    }
    const data: SaveData = {
      v: SAVE_VERSION,
      coins: this.coins,
      selected: this.selected,
      selectedSeed: this.selectedSeed,
      seeds: this.seeds,
      harvest: this.harvestInv,
      shopStock: this.shopStock,
      timeMs: this.timeMs,
      restockMs: this.restockMs,
      tiles,
      crops,
      xp: this.xp,
      upgrades: this.upgrades,
      earned: this.earned,
      harvested: this.harvested,
      mutationsFound: this.mutationsFound,
      discPlants: [...this.discoveredPlants],
      discMutations: [...this.discoveredMutations],
      achievements: [...this.achievements],
      animals: this.animalCounts,
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      // storage may be unavailable (private mode); ignore
    }
  }

  private loadSave(): boolean {
    let data: SaveData;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      data = JSON.parse(raw) as SaveData;
    } catch {
      return false;
    }
    if (!data || data.v !== SAVE_VERSION) return false;

    this.coins = data.coins ?? this.coins;
    this.seeds = data.seeds ?? this.seeds;
    this.harvestInv = data.harvest ?? {};
    this.shopStock = data.shopStock ?? this.shopStock;
    this.timeMs = data.timeMs ?? this.timeMs;
    this.restockMs = data.restockMs ?? RESTOCK_MS;
    this.selected = data.selected ?? 'hoe';
    this.selectedSeed = data.selectedSeed ?? null;

    this.xp = data.xp ?? 0;
    this.upgrades = { ...EMPTY_UPGRADES, ...(data.upgrades ?? {}) };
    this.earned = data.earned ?? 0;
    this.harvested = data.harvested ?? 0;
    this.mutationsFound = data.mutationsFound ?? 0;
    this.discoveredPlants = new Set(data.discPlants ?? []);
    this.discoveredMutations = new Set(data.discMutations ?? []);
    this.achievements = new Set(data.achievements ?? []);
    this.animalCounts = data.animals ?? {};
    for (const [type, count] of Object.entries(this.animalCounts)) {
      const adef = ANIMAL_BY_ID[type];
      if (!adef) continue;
      for (let i = 0; i < count; i++) {
        this.spawnAnimal(
          adef,
          Phaser.Math.Between(PEN.x0 + 16, PEN.x1 - 16),
          Phaser.Math.Between(PEN.y0 + 16, PEN.y1 - 16),
        );
      }
    }

    for (const [x, y, wetRemaining] of data.tiles ?? []) {
      if (!this.inBounds(x, y) || this.tiles[y][x].obstacle) continue;
      this.tiles[y][x].tilled = true;
      if (wetRemaining > 0) {
        this.tiles[y][x].wetUntil = this.time.now + wetRemaining;
        this.wetTiles.add(this.key(x, y));
      }
      this.setGroundTexture(x, y);
    }
    // Recompute autotile frames now that all tilled neighbours are known.
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) if (this.tiles[y][x].tilled) this.setGroundTexture(x, y);
    }

    for (const c of data.crops ?? []) {
      const plant = PLANT_BY_ID[c.p];
      if (!plant || !this.inBounds(c.x, c.y)) continue;
      const sprite = this.add
        .image(c.x * TILE + TILE / 2, c.y * TILE + TILE / 2, 'cropsheet', plant.cropRow * 5)
        .setScale(2)
        .setDepth(this.cropDepth(c.y) - 1);
      const crop: Crop = {
        plant, tx: c.x, ty: c.y, grownMs: c.g, stage: 0,
        mature: false, mutation: null, wetAtMature: false, sprite,
      };
      this.crops.set(this.key(c.x, c.y), crop);
      if (c.m) {
        crop.mature = true;
        crop.stage = STAGES - 1;
        crop.mutation = MUTATION_BY_ID[c.mut ?? 'normal'] ?? MUTATION_BY_ID.normal;
        crop.wetAtMature = c.wet;
        this.applyMatureVisuals(crop, false);
      } else {
        const ns = Math.min(STAGES - 1, Math.floor((c.g / (plant.growthSeconds * 1000)) * (STAGES - 1)));
        crop.stage = ns;
        crop.sprite.setFrame(plant.cropRow * 5 + ns);
      }
    }
    return true;
  }

  private toast(msg: string) {
    bus.emit('toast', msg);
  }

  private emitState() {
    const info = levelInfo(this.xp);
    bus.emit('state', {
      coins: this.coins,
      selected: this.selected,
      selectedSeed: this.selectedSeed,
      seeds: { ...this.seeds },
      harvest: { ...this.harvestInv },
      shop: PLANTS.map((p) => ({ plantId: p.id, stock: this.shopStock[p.id] ?? 0 })),
      animalCounts: { ...this.animalCounts },
      progress: {
        level: info.level,
        xpInto: info.into,
        xpNeed: info.need,
        upgrades: { ...this.upgrades },
        earned: this.earned,
        harvested: this.harvested,
        mutationsFound: this.mutationsFound,
        discoveredPlants: [...this.discoveredPlants],
        discoveredMutations: [...this.discoveredMutations],
        achievements: [...this.achievements],
      },
    });
  }

  private emitClock() {
    const frac = (this.timeMs % DAY_LENGTH_MS) / DAY_LENGTH_MS;
    const totalMin = Math.floor(frac * 24 * 60);
    const clock = `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
    const phase = frac < 0.28 ? 'night' : frac < 0.34 ? 'dawn' : frac < 0.78 ? 'day' : frac < 0.86 ? 'dusk' : 'night';
    bus.emit('clock', {
      day: Math.floor(this.timeMs / DAY_LENGTH_MS) + 1,
      clock,
      phase,
      restockIn: Math.ceil(this.restockMs / 1000),
    });
  }

  private ambientFor(frac: number): { color: number; alpha: number } {
    const stops = [
      { t: 0.0, c: 0x0a1430, a: 0.45 },
      { t: 0.28, c: 0x0a1430, a: 0.45 },
      { t: 0.33, c: 0xff8a4a, a: 0.22 },
      { t: 0.37, c: 0xffffff, a: 0.0 },
      { t: 0.76, c: 0xffffff, a: 0.0 },
      { t: 0.82, c: 0xff6a3a, a: 0.22 },
      { t: 0.87, c: 0x0a1430, a: 0.45 },
      { t: 1.0, c: 0x0a1430, a: 0.45 },
    ];
    let a = stops[0];
    let b = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (frac >= stops[i].t && frac <= stops[i + 1].t) {
        a = stops[i];
        b = stops[i + 1];
        break;
      }
    }
    const u = (frac - a.t) / ((b.t - a.t) || 1);
    const ca = Phaser.Display.Color.IntegerToColor(a.c);
    const cb = Phaser.Display.Color.IntegerToColor(b.c);
    const lerp = (x: number, y: number) => x + (y - x) * u;
    return {
      color: Phaser.Display.Color.GetColor(
        Math.round(lerp(ca.red, cb.red)),
        Math.round(lerp(ca.green, cb.green)),
        Math.round(lerp(ca.blue, cb.blue)),
      ),
      alpha: lerp(a.a, b.a),
    };
  }

  update(time: number, delta: number) {
    // movement
    let vx = 0;
    let vy = 0;
    if (this.cursors.left.isDown || this.wasd.left.isDown) vx = -1;
    else if (this.cursors.right.isDown || this.wasd.right.isDown) vx = 1;
    if (this.cursors.up.isDown || this.wasd.up.isDown) vy = -1;
    else if (this.cursors.down.isDown || this.wasd.down.isDown) vy = 1;
    const len = Math.hypot(vx, vy) || 1;
    this.player.setVelocity((vx / len) * PLAYER_SPEED, (vy / len) * PLAYER_SPEED);
    if (vx !== 0 || vy !== 0) {
      this.actingUntil = 0; // moving cancels the tool pose
      if (vx < 0) this.facing = 'left';
      else if (vx > 0) this.facing = 'right';
      else this.facing = vy < 0 ? 'up' : 'down';
      this.player.anims.play(`walk-${this.facing}`, true);
    } else if (time < this.actingUntil) {
      // let the tool-use animation play out
    } else {
      this.player.anims.stop();
      this.player.setTexture('char', FarmScene.DIR_ROW[this.facing]);
    }
    this.player.setDepth(this.player.y + 18);

    this.updateAnimals(time);

    // crop growth
    for (const crop of this.crops.values()) {
      if (crop.mature) continue;
      const wet = this.isWet(crop.tx, crop.ty);
      crop.grownMs += delta * (wet ? 2 : 1) * this.growthMult * growthFactor(this.upgrades.growth);
      const total = crop.plant.growthSeconds * 1000;
      const ns = Math.min(STAGES - 1, Math.floor((crop.grownMs / total) * (STAGES - 1)));
      if (ns !== crop.stage && ns < STAGES - 1) {
        crop.stage = ns;
        crop.sprite.setFrame(crop.plant.cropRow * 5 + ns);
      }
      if (crop.grownMs >= total) this.matureCrop(crop);
    }

    // rainbow shimmer
    if (this.rainbowCrops.size) {
      const hue = (time * 0.06) % 360;
      const col = Phaser.Display.Color.HSVToRGB(hue / 360, 0.8, 1).color;
      this.rainbowCrops.forEach((c) => c.sprite.setTint(col));
    }

    // dry soil
    if (this.wetTiles.size) {
      for (const key of this.wetTiles) {
        const [x, y] = key.split(',').map(Number);
        if (time >= this.tiles[y][x].wetUntil) {
          this.wetTiles.delete(key);
          this.setGroundTexture(x, y);
        }
      }
    }

    // clock + restock + ambient
    this.timeMs += delta;
    this.restockMs -= delta;
    if (this.restockMs <= 0) this.restock();
    const frac = (this.timeMs % DAY_LENGTH_MS) / DAY_LENGTH_MS;
    const { color, alpha } = this.ambientFor(frac);
    this.ambient.setFillStyle(color);
    this.ambient.setAlpha(alpha);
    this.fireflies.emitting = frac < 0.3 || frac >= 0.82;

    // tile cursor
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
