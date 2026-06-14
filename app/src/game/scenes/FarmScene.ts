import Phaser from 'phaser';
import {
  TILE,
  GRID_W,
  GRID_H,
  WORLD_WIDTH,
  WORLD_HEIGHT,
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
  marketBonus,
  restockReductionMs,
  sprinklerIntervalMs,
  toolRadius,
  type UpgradeId,
  type Upgrades,
} from '../progression';
import { ANIMAL_BY_ID, ANIMALS, type AnimalDef } from '../animals';
import { HOME, MY_PLOT, isInMyPlot, NEIGHBORS, type Neighbor } from '../plots';
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

// Decorative trees/rocks in the open margins (kept clear of homestead + plots).
const TREES: Array<[number, number]> = [
  [1, 3], [1, 11], [7, 11], [20, 11], [33, 11], [39, 11], [1, 21], [39, 3], [1, 43], [39, 43],
];
const ROCKS: Array<[number, number]> = [
  [14, 11], [27, 11], [0, 20], [40, 20], [0, 33], [40, 37],
];
const POND = { x0: HOME.pond.x0, y0: HOME.pond.y0, w: HOME.pond.w, h: HOME.pond.h };
const CABIN = { cx: HOME.houseCx, baseY: HOME.houseBaseRow - 1 };
const PEN = { x0: HOME.pen.x0 * TILE, y0: HOME.pen.y0 * TILE, x1: (HOME.pen.x1 + 1) * TILE, y1: (HOME.pen.y1 + 1) * TILE };
const ORCHARD = { x0: HOME.orchard.x0 * TILE, y0: HOME.orchard.y0 * TILE, x1: (HOME.orchard.x1 + 1) * TILE, y1: (HOME.orchard.y1 + 1) * TILE };

type Animal = {
  sprite: Phaser.GameObjects.Sprite;
  type: string;
  color: string; // texture/anim key of the chosen palette swap
  layAt: number;
  nextWander: number;
  product?: Phaser.GameObjects.Image;
  baby?: boolean; // a young animal that grows into an adult
  growUpAt?: number; // when a baby becomes an adult
  breedAt?: number; // when an adult next tries to produce a baby
};

const SAVE_KEY = 'solana-valley:save';
const SAVE_VERSION = 6;

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
  private fireflyZone!: Phaser.Geom.Rectangle;
  private rain!: Phaser.GameObjects.Particles.ParticleEmitter;
  private rainZone!: Phaser.Geom.Rectangle;
  private storm!: Phaser.GameObjects.Rectangle;
  private raining = false;
  private weatherUntil = 0;
  private lastRainWater = 0;
  private lastSprinkle = 0;
  private startRaining = false;
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
  private gate?: Phaser.GameObjects.Sprite;
  private gateOpen = false;
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

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.obstacles = this.physics.add.staticGroup();
    this.createAnims();
    this.buildWorld();
    this.buildPaths();
    this.placeDecorations();
    this.buildFences();
    this.buildPlots();

    this.player = this.physics.add.sprite(
      (MY_PLOT.px + MY_PLOT.pw / 2) * TILE,
      (MY_PLOT.py + MY_PLOT.ph + 1) * TILE,
      'pchar',
      0,
    );
    this.player.setCollideWorldBounds(true);
    this.player.setOrigin(0.5, 0.72).setScale(1.25);
    this.player.body!.setSize(13, 9).setOffset(17, 33);
    this.physics.add.collider(this.player, this.obstacles);

    // A tiled-grass backdrop (well past the world edges) so the field fills any
    // screen size — no flat margin on wide monitors. The camera may roam into it.
    const M = 1400;
    this.add
      .tileSprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH + 2 * M, WORLD_HEIGHT + 2 * M, 'grass', 0)
      .setTileScale(2, 2)
      .setDepth(-10000);

    // Camera follows the player around the larger world (bounds include the backdrop).
    this.cameras.main.setBounds(-M, -M, WORLD_WIDTH + 2 * M, WORLD_HEIGHT + 2 * M);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    // Full-screen overlays live in screen space (scrollFactor 0) and track the
    // viewport size so they always cover the window.
    const sw = this.scale.width;
    const sh = this.scale.height;

    // Fireflies drift in at night, spawning across the visible viewport.
    this.fireflyZone = new Phaser.Geom.Rectangle(0, sh * 0.15, sw, sh * 0.85);
    this.fireflies = this.add
      .particles(0, 0, 'p_bit', {
        tint: [0xfff3a0, 0xfff7c8, 0xd6ff9a],
        lifespan: 2800,
        frequency: 130,
        scale: { start: 1.4, end: 0 },
        alpha: { start: 0.9, end: 0 },
        speed: { min: 4, max: 16 },
        blendMode: 'ADD',
        emitting: false,
        emitZone: { type: 'random', source: this.fireflyZone } as Phaser.Types.GameObjects.Particles.ParticleEmitterConfig['emitZone'],
      })
      .setDepth(89500)
      .setScrollFactor(0);

    // Rain (falling streaks) + a storm tint, toggled by the weather scheduler.
    this.rainZone = new Phaser.Geom.Rectangle(-40, -16, sw + 80, 6);
    this.rain = this.add
      .particles(0, 0, 'raindrop', {
        lifespan: 2200,
        frequency: 10,
        quantity: 2,
        speedY: { min: 520, max: 660 },
        speedX: { min: -120, max: -80 },
        scaleY: { min: 0.8, max: 1.4 },
        alpha: { start: 0.55, end: 0.2 },
        emitting: false,
        emitZone: { type: 'random', source: this.rainZone } as Phaser.Types.GameObjects.Particles.ParticleEmitterConfig['emitZone'],
      })
      .setDepth(89800)
      .setScrollFactor(0);
    this.storm = this.add
      .rectangle(0, 0, sw, sh, 0x3a4a66, 1)
      .setOrigin(0, 0)
      .setDepth(89900)
      .setScrollFactor(0)
      .setAlpha(0);

    this.ambient = this.add
      .rectangle(0, 0, sw, sh, 0x0a1430, 1)
      .setOrigin(0, 0)
      .setDepth(90000)
      .setScrollFactor(0)
      .setAlpha(0);

    // Keep the screen-space overlays covering the viewport on window resize.
    this.scale.on('resize', (gs: Phaser.Structs.Size) => {
      this.ambient.setSize(gs.width, gs.height);
      this.storm.setSize(gs.width, gs.height);
      this.fireflyZone.setTo(0, gs.height * 0.15, gs.width, gs.height * 0.85);
      this.rainZone.setTo(-40, -16, gs.width + 80, 6);
    });

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

    // A little welcome moment pointing the player at their plot.
    this.time.delayedCall(700, () => this.toast('🌱 Welcome! This is ★ Your Plot — hoe the soil and plant your seeds.'));

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

    this.startRaining = params.has('rain');

    if (params.has('reset')) localStorage.removeItem(SAVE_KEY);
    // Don't load/save during scripted/dev sessions so demos stay deterministic.
    this.persist = !['fast', 'give', 'mut', 'time', 'debug', 'reset', 'coins', 'xp', 'rain'].some((k) => params.has(k));
  }

  // Premium character sheet (8 frames/row). Rows 0–3 = idle, 4–7 = walk, each
  // ordered down/up/left/right. First frame of each idle row doubles as the
  // standing pose.
  private static IDLE_ROW: Record<Dir, number> = { down: 0, up: 8, left: 16, right: 24 };
  private static WALK_ROW: Record<Dir, number> = { down: 32, up: 40, left: 48, right: 56 };
  // Tool swings: rows 12–15 (hoe) and 20–23 (watering can), each 8 frames,
  // ordered down/up/right/left in the sheet.
  private static TOOL_ROW: Record<'hoe' | 'water', Record<Dir, number>> = {
    hoe: { down: 96, up: 104, right: 112, left: 120 },
    water: { down: 160, up: 168, right: 176, left: 184 },
  };

  private createAnims() {
    for (const dir of ['down', 'up', 'left', 'right'] as Dir[]) {
      const walk = `walk-${dir}`;
      if (!this.anims.exists(walk)) {
        const start = FarmScene.WALK_ROW[dir];
        this.anims.create({
          key: walk,
          frames: this.anims.generateFrameNumbers('pchar', { start, end: start + 7 }),
          frameRate: 12,
          repeat: -1,
        });
      }
      const idle = `idle-${dir}`;
      if (!this.anims.exists(idle)) {
        const start = FarmScene.IDLE_ROW[dir];
        this.anims.create({
          key: idle,
          frames: this.anims.generateFrameNumbers('pchar', { start, end: start + 7 }),
          frameRate: 6,
          repeat: -1,
        });
      }
    }
    if (!this.anims.exists('water-anim')) {
      this.anims.create({
        key: 'water-anim',
        frames: this.anims.generateFrameNumbers('water', { start: 0, end: 3 }),
        frameRate: 6,
        repeat: -1,
      });
    }
    // Directional tool swings from the premium sheet (rows 12–23, 8 frames each).
    for (const tool of ['hoe', 'water'] as const) {
      for (const dir of ['down', 'up', 'left', 'right'] as Dir[]) {
        const key = `act-${tool}-${dir}`;
        if (this.anims.exists(key)) continue;
        const start = FarmScene.TOOL_ROW[tool][dir];
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers('pchar', { start, end: start + 7 }),
          frameRate: 18,
          repeat: 0,
        });
      }
    }
    // Animations are keyed by sheet so every palette swap gets its own pair.
    for (const a of ANIMALS) {
      for (const sheet of a.colorways ?? [a.sheet]) {
        if (!this.anims.exists(`${sheet}-idle`)) {
          this.anims.create({ key: `${sheet}-idle`, frames: this.anims.generateFrameNumbers(sheet, { frames: a.idleFrames }), frameRate: 3, repeat: -1 });
        }
        if (!this.anims.exists(`${sheet}-walk`)) {
          this.anims.create({ key: `${sheet}-walk`, frames: this.anims.generateFrameNumbers(sheet, { frames: a.walkFrames }), frameRate: 6, repeat: -1 });
        }
      }
      // Baby palette swaps for breedable animals.
      if (a.breeding) {
        for (const sheet of a.breeding.babySheets) {
          if (!this.anims.exists(`${sheet}-idle`)) {
            this.anims.create({ key: `${sheet}-idle`, frames: this.anims.generateFrameNumbers(sheet, { frames: a.breeding.babyIdle }), frameRate: 4, repeat: -1 });
          }
          if (!this.anims.exists(`${sheet}-walk`)) {
            this.anims.create({ key: `${sheet}-walk`, frames: this.anims.generateFrameNumbers(sheet, { frames: a.breeding.babyWalk }), frameRate: 7, repeat: -1 });
          }
        }
      }
    }
  }

  private playAction(tool: 'hoe' | 'water') {
    this.actingUntil = this.time.now + 440; // ~8 frames @ 18fps
    this.player.anims.play(`act-${tool}-${this.facing}`, true);
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

  // Packed-dirt paths + a homestead yard, laid as ground decoration (premium
  // soil tiles). Walkways connect the homestead to the plot grid below.
  private layDirt(x0: number, y0: number, x1: number, y1: number) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!this.inBounds(x, y) || this.tiles[y][x].obstacle) continue;
        this.add.image(x * TILE + TILE / 2, y * TILE + TILE / 2, 'soil', this.solidTilledFrame(x, y)).setScale(2).setDepth(0.5);
      }
    }
  }

  private buildPaths() {
    // A dirt yard around the homestead.
    this.layDirt(2, 9, 7, 11);
    // A connector from your plot down to the main avenue.
    this.layDirt(11, 9, 12, 11);
    // The main avenue between the homestead and the plots.
    this.layDirt(1, 11, GRID_W - 2, 12);
    // Walkways running down the gaps between the neighbour plot columns.
    for (const cx of [8, 16, 24, 32]) this.layDirt(cx, 12, cx, GRID_H - 3);
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
    // Lily pads and reeds floating on the pond.
    this.add.image((POND.x0 + 1) * TILE, (POND.y0 + 0.4) * TILE, 'waterobj', 11).setScale(2).setDepth(3);
    this.add.image((POND.x0 + 0.4) * TILE, (POND.y0 + 1.1) * TILE, 'waterobj', 8).setScale(2).setDepth(3);
    this.add.image((POND.x0 + 2.1) * TILE, (POND.y0 + 0.9) * TILE, 'waterobj', 6).setScale(2).setDepth(4);

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

    // Water well (in the homestead yard, below the house).
    const wellX = HOME.well.x * TILE + TILE / 2;
    const wellY = HOME.well.y * TILE;
    this.add.image(wellX, wellY, 'well').setScale(2).setDepth(wellY + 24);
    for (const [ox, oy] of [[HOME.well.x, HOME.well.y - 1], [HOME.well.x, HOME.well.y]] as Array<[number, number]>) {
      if (this.inBounds(ox, oy)) this.tiles[oy][ox].obstacle = true;
    }
    this.addCollider(wellX, wellY, 44, 38);

    // Chicken coop crowning the top of the animal pen.
    const coopX = Math.round((HOME.pen.x0 + HOME.pen.x1) / 2) * TILE + TILE / 2;
    const coopBase = (HOME.pen.y0 + 1) * TILE;
    this.add.image(coopX, coopBase, 'coop', 'coop').setOrigin(0.5, 1).setScale(2).setDepth(coopBase);
    for (let oy = HOME.pen.y0; oy <= HOME.pen.y0 + 1; oy++) {
      for (let ox = HOME.pen.x0 + 1; ox <= HOME.pen.x1 - 1; ox++) if (this.inBounds(ox, oy)) this.tiles[oy][ox].obstacle = true;
    }
    this.addCollider(coopX, coopBase - 18, 110, 30);

    // Ranch feed station inside the pen: a wide hay bale and a feed trough.
    this.add.image((HOME.pen.x0 + 1) * TILE + 16, (HOME.pen.y0 + 3) * TILE, 'hay', 6).setScale(2).setDepth((HOME.pen.y0 + 3) * TILE);
    this.add.image((HOME.pen.x0 + 2) * TILE + 16, (HOME.pen.y0 + 3) * TILE, 'hay', 7).setScale(2).setDepth((HOME.pen.y0 + 3) * TILE);
    this.add.image((HOME.pen.x1 - 2) * TILE + 16, (HOME.pen.y0 + 4) * TILE, 'hay', 0).setScale(2).setDepth((HOME.pen.y0 + 5) * TILE);

    // Homestead props: a workbench and a treasure chest in the yard by the house.
    const benchX = (HOME.houseCx + 2) * TILE;
    const benchY = (HOME.houseBaseRow + 1) * TILE;
    this.add.image(benchX, benchY, 'workstation').setOrigin(0.5, 0.7).setScale(2).setDepth(benchY + 10);
    this.addCollider(benchX, benchY + 4, 56, 18);

    const chestX = (HOME.houseCx - 2) * TILE + TILE / 2;
    const chestY = (HOME.houseBaseRow + 1) * TILE;
    this.add.image(chestX, chestY, 'chest', 16).setOrigin(0.5, 1).setScale(2).setDepth(chestY);
    this.addCollider(chestX, chestY - 8, 26, 16);

    // A cosy picnic spot on the open grass between home and the plots.
    const picX = (HOME.houseCx + 1) * TILE;
    const picY = 11.5 * TILE;
    this.add.image(picX, picY, 'picnic').setScale(1.8).setDepth(2);
    this.add.image(picX + 16, picY - 4, 'basket').setScale(1.7).setDepth(3);

    // ---- nature: dense greenery across the open grass -----------------------
    const free = (tx: number, ty: number) =>
      this.inBounds(tx, ty) && !this.tiles[ty][tx].obstacle && !isInMyPlot(tx, ty) && !this.inNeighborPlot(tx, ty);

    const decoFrames = ['flower_y', 'flower_p', 'flower_p2', 'bush', 'bush2', 'sprout', 'stump'];
    let placed = 0, guard = 0;
    while (placed < 48 && guard++ < 800) {
      const tx = Phaser.Math.Between(1, GRID_W - 2), ty = Phaser.Math.Between(1, GRID_H - 2);
      if (!free(tx, ty)) continue;
      this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'biome', decoFrames[placed % decoFrames.length]).setScale(2).setDepth(2);
      placed++;
    }

    const mfsFrames = [0, 3, 12, 15, 25, 36, 48, 52];
    let m = 0, mg = 0;
    while (m < 28 && mg++ < 500) {
      const tx = Phaser.Math.Between(1, GRID_W - 2), ty = Phaser.Math.Between(1, GRID_H - 2);
      if (!free(tx, ty)) continue;
      this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'mfs', mfsFrames[m % mfsFrames.length]).setScale(2).setDepth(3);
      m++;
    }

    // Premium berry bushes & shrubs for colour (from the trees/bushes sheet).
    const bushFrames = [36, 37, 38, 39, 40, 48, 49, 50, 51];
    let b = 0, bg = 0;
    while (b < 20 && bg++ < 400) {
      const tx = Phaser.Math.Between(1, GRID_W - 2), ty = Phaser.Math.Between(1, GRID_H - 2);
      if (!free(tx, ty)) continue;
      this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'nature', bushFrames[b % bushFrames.length]).setScale(2).setDepth(ty * TILE + TILE);
      b++;
    }

    // A leafy tree-line framing the world out in the backdrop grass.
    const treePics = ['tree', 'tree_apple'];
    for (let i = 0; i < 30; i++) {
      const out = Phaser.Math.Between(80, 380);
      let x: number, y: number;
      switch (i % 4) {
        case 0: x = Phaser.Math.Between(-240, WORLD_WIDTH + 240); y = -out; break;
        case 1: x = Phaser.Math.Between(-240, WORLD_WIDTH + 240); y = WORLD_HEIGHT + out; break;
        case 2: x = -out; y = Phaser.Math.Between(-240, WORLD_HEIGHT + 240); break;
        default: x = WORLD_WIDTH + out; y = Phaser.Math.Between(-240, WORLD_HEIGHT + 240); break;
      }
      this.add.image(x, y, 'biome', treePics[i % 2]).setOrigin(0.5, 1).setScale(2).setDepth(y);
    }

    // A boat moored on the pond, and potted plants flanking the cabin.
    this.add.image((HOME.pond.x0 + 1.4) * TILE, (HOME.pond.y0 + 0.8) * TILE, 'boats', 0).setScale(1.15).setDepth((HOME.pond.y0 + 1) * TILE);
    this.add.image((HOME.houseCx - 1) * TILE, (HOME.houseBaseRow + 1) * TILE, 'furniture', 12).setScale(2).setDepth((HOME.houseBaseRow + 1) * TILE);
    this.add.image((HOME.houseCx + 1) * TILE, (HOME.houseBaseRow + 1) * TILE, 'furniture', 13).setScale(2).setDepth((HOME.houseBaseRow + 1) * TILE);
  }

  // True if a tile sits inside any neighbour plot's interior (keep decor out of them).
  private inNeighborPlot(tx: number, ty: number): boolean {
    for (const n of NEIGHBORS) {
      if (tx >= n.px && tx < n.px + n.pw && ty >= n.py && ty < n.py + n.ph) return true;
    }
    return false;
  }

  private addCollider(cx: number, cy: number, w: number, h: number) {
    const box = this.obstacles.create(cx, cy, 'pixel') as Phaser.Physics.Arcade.Sprite;
    box.setVisible(false).setDisplaySize(w, h).refreshBody();
  }

  // Wooden fences (autotiled from the 4×4 Sprout Lands fence sheet) that enclose
  // the animal pen and the orchard so the producers read as a real ranch.
  // Decorative only — animals are already kept in by their wander bounds.
  private buildFences() {
    // Pen: U-shape (left / right / bottom); the coop crowns the open top edge.
    this.encloseRegion(HOME.pen.x0, HOME.pen.y0, HOME.pen.x1, HOME.pen.y1, { left: true, right: true, bottom: true });
    // Orchard: full rectangle with a gap in the bottom edge for an entrance.
    const ogx = Math.floor((HOME.orchard.x0 + HOME.orchard.x1) / 2);
    this.encloseRegion(HOME.orchard.x0, HOME.orchard.y0, HOME.orchard.x1, HOME.orchard.y1, { top: true, bottom: true, left: true, right: true, gap: [ogx, HOME.orchard.y1] });

    // A gate in the orchard entrance that swings open as the farmer approaches.
    const gx = ogx * TILE + TILE / 2;
    const gy = HOME.orchard.y1 * TILE + TILE / 2;
    if (!this.anims.exists('gate-open')) {
      this.anims.create({ key: 'gate-open', frames: this.anims.generateFrameNumbers('gate', { start: 0, end: 9 }), frameRate: 24, repeat: 0 });
      this.anims.create({ key: 'gate-close', frames: this.anims.generateFrameNumbers('gate', { start: 9, end: 0 }), frameRate: 24, repeat: 0 });
    }
    this.gate = this.add.sprite(gx, gy, 'gate', 0).setScale(2).setDepth(gy + 6);
  }

  private encloseRegion(
    tx0: number,
    ty0: number,
    tx1: number,
    ty1: number,
    opts: { top?: boolean; bottom?: boolean; left?: boolean; right?: boolean; gap?: [number, number] },
  ) {
    // Collect the perimeter tiles we actually want a fence on (skipping anything
    // already occupied, e.g. a rock or the coop), then autotile each.
    const want = new Set<string>();
    const add = (x: number, y: number) => {
      if (this.inBounds(x, y) && !this.tiles[y][x].obstacle) want.add(this.key(x, y));
    };
    if (opts.top) for (let x = tx0; x <= tx1; x++) add(x, ty0);
    if (opts.bottom) for (let x = tx0; x <= tx1; x++) add(x, ty1);
    if (opts.left) for (let y = ty0; y <= ty1; y++) add(tx0, y);
    if (opts.right) for (let y = ty0; y <= ty1; y++) add(tx1, y);
    if (opts.gap) want.delete(this.key(opts.gap[0], opts.gap[1]));

    for (const k of want) {
      const [x, y] = k.split(',').map(Number);
      const has = (dx: number, dy: number) => want.has(this.key(x + dx, y + dy));
      const u = has(0, -1);
      const d = has(0, 1);
      const l = has(-1, 0);
      const r = has(1, 0);
      // Sheet rows pick the vertical connection, columns the horizontal one.
      const row = u && d ? 1 : d ? 0 : u ? 2 : 3;
      const col = l && r ? 2 : r ? 1 : l ? 3 : 0;
      const cx = x * TILE + TILE / 2;
      const cy = y * TILE + TILE / 2;
      this.add.image(cx, cy, 'fences', row * 4 + col).setScale(2).setDepth(cy + 6);
    }
  }

  // ---- plots --------------------------------------------------------------

  // The 20-plot server grid: fence + name-sign each plot. Your plot's soil is
  // tinted so it's easy to find; the neighbours show crops so the server reads
  // as alive.
  private buildPlots() {
    // Your plot: fence + faint tilled rows (so the planting slots are visible) +
    // a star sign and a little signpost.
    const p = MY_PLOT;
    this.encloseRegion(p.px - 1, p.py - 1, p.px + p.pw, p.py + p.ph, {
      top: true, bottom: true, left: true, right: true, gap: [p.px + Math.floor(p.pw / 2), p.py + p.ph],
    });
    // Checkerboard tint marks the plantable slots without looking pre-tilled.
    for (let y = p.py; y < p.py + p.ph; y++) {
      for (let x = p.px; x < p.px + p.pw; x++) {
        this.ground[y][x].setTint((x + y) % 2 === 0 ? 0xeaf7c4 : 0xcfe89c);
      }
    }
    this.addPlotSign(p.px + p.pw / 2, p.py, '★ Your Plot', true);
    this.addSignpost(p.px - 1, p.py - 1);

    // Neighbours: fence + growing crops + a name sign (the rest of the server).
    for (const n of NEIGHBORS) {
      this.encloseRegion(n.px - 1, n.py - 1, n.px + n.pw, n.py + n.ph, {
        top: true, bottom: true, left: true, right: true, gap: [n.px + Math.floor(n.pw / 2), n.py + n.ph],
      });
      this.dressNeighborPlot(n);
      this.addPlotSign(n.px + n.pw / 2, n.py, `${n.owner}'s plot`, false);
      this.addSignpost(n.px - 1, n.py - 1);
    }
  }

  private addSignpost(tx: number, ty: number) {
    this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE, 'signs', 0).setOrigin(0.5, 1).setScale(2).setDepth(ty * TILE + 40);
  }

  private dressNeighborPlot(n: Neighbor) {
    for (let y = n.py; y < n.py + n.ph; y++) {
      for (let x = n.px; x < n.px + n.pw; x++) {
        const cx = x * TILE + TILE / 2;
        const cy = y * TILE + TILE / 2;
        this.add.image(cx, cy, 'tilled', this.solidTilledFrame(x, y)).setScale(2).setDepth(1);
        if (Math.random() < 0.82) {
          const plant = PLANTS[Math.floor(Math.random() * PLANTS.length)];
          const stage = Phaser.Math.Between(1, STAGES - 1);
          this.add.image(cx, cy, 'cropsheet', plant.cropRow * 5 + stage).setScale(2).setDepth(this.cropDepth(y));
        }
      }
    }
  }

  private addPlotSign(cxTile: number, topTile: number, label: string, mine: boolean) {
    this.add
      .text(cxTile * TILE, (topTile - 1) * TILE + 8, label, {
        fontFamily: 'Pixelify Sans, monospace',
        fontSize: mine ? '16px' : '13px',
        color: mine ? '#fff0a8' : '#ffffff',
        stroke: '#39271a',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(60000);
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
    if (!isInMyPlot(x, y)) return false; // can only farm your own plot
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
      .setTint(plant.cropTint ?? 0xffffff)
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
    const value = Math.round(cropValue(PLANT_BY_ID[plantId], MUTATION_BY_ID[mutId], wet === '1') * count * marketBonus(this.upgrades.market));
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
    total = Math.round(total * marketBonus(this.upgrades.market));
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

  private producerArea(def: AnimalDef) {
    return def.category === 'tree' ? ORCHARD : PEN;
  }

  // Pick a palette swap: the rare colour shows up ~1 in 9, the rest are even.
  private pickColor(def: AnimalDef): string {
    const ways = def.colorways ?? [def.sheet];
    if (def.rareColor && Math.random() < 0.11) return def.rareColor;
    const common = ways.filter((c) => c !== def.rareColor);
    return Phaser.Utils.Array.GetRandom(common.length ? common : ways);
  }

  private spawnAnimal(def: AnimalDef, x: number, y: number) {
    const color = this.pickColor(def);
    const s = this.add
      .sprite(x, y, color, def.idleFrames[0])
      .setOrigin(0.5, def.originY)
      .setScale(def.scale)
      .setDepth(y + 14);
    s.play(`${color}-idle`);
    if (def.stationary) {
      // Fruit trees sway gently like the decorative trees.
      this.tweens.add({
        targets: s, angle: { from: -1, to: 1 },
        duration: 2400 + Math.random() * 800, delay: Math.random() * 1500,
        yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });
    }
    this.animals.push({
      sprite: s,
      type: def.id,
      color,
      layAt: this.time.now + def.layMs / this.growthMult,
      nextWander: this.time.now + 1500 + Math.random() * 3000,
      breedAt: def.breeding ? this.time.now + (def.breeding.ms * (0.6 + Math.random() * 0.8)) / this.growthMult : undefined,
    });
  }

  // A baby wanders the pen and grows into an adult after a while.
  private spawnBaby(def: AnimalDef, x: number, y: number) {
    if (!def.breeding) return;
    const color = Phaser.Utils.Array.GetRandom(def.breeding.babySheets);
    const s = this.add
      .sprite(x, y, color, def.breeding.babyIdle[0])
      .setOrigin(0.5, def.originY)
      .setScale(def.breeding.babyScale)
      .setDepth(y + 14);
    s.play(`${color}-idle`);
    this.animals.push({
      sprite: s,
      type: def.id,
      color,
      baby: true,
      growUpAt: this.time.now + def.breeding.growMs / this.growthMult,
      layAt: Infinity,
      nextWander: this.time.now + 1000 + Math.random() * 2500,
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
    const area = this.producerArea(def);
    this.spawnAnimal(
      def,
      Phaser.Math.Between(area.x0 + 24, area.x1 - 24),
      Phaser.Math.Between(area.y0 + 24, area.y1 - 24),
    );
    sfx.play('buy');
    const where = def.category === 'tree' ? 'grows in the orchard' : 'roams the pen';
    this.toast(`Bought a ${def.name}! It ${where} and makes ${def.productName.toLowerCase()}.`);
    this.emitState();
  }

  // Collect a ready product if the click landed on an animal. Returns true if so.
  private tryCollectAnimal(wx: number, wy: number): boolean {
    for (const a of this.animals) {
      if (a.product && Phaser.Math.Distance.Between(wx, wy, a.product.x, a.product.y) < 30) {
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
    const grown: Animal[] = [];
    const breeders: Animal[] = [];
    for (const a of this.animals) {
      const def = ANIMAL_BY_ID[a.type];
      if (!def.stationary && time > a.nextWander && !this.tweens.isTweening(a.sprite)) {
        a.nextWander = time + 2500 + Math.random() * 3500;
        const nx = Phaser.Math.Clamp(a.sprite.x + (Math.random() * 2 - 1) * 48, PEN.x0 + 12, PEN.x1 - 12);
        const ny = Phaser.Math.Clamp(a.sprite.y + (Math.random() * 2 - 1) * 48, PEN.y0 + 12, PEN.y1 - 12);
        a.sprite.setFlipX(nx < a.sprite.x);
        a.sprite.play(`${a.color}-walk`, true);
        this.tweens.add({
          targets: a.sprite, x: nx, y: ny, duration: 1100, ease: 'Sine.inOut',
          onComplete: () => a.sprite.play(`${a.color}-idle`, true),
        });
      }
      if (a.baby) {
        if (a.growUpAt !== undefined && time >= a.growUpAt) grown.push(a);
      } else {
        if (!a.product && time >= a.layAt) {
          a.product = this.add
            .image(a.sprite.x, a.sprite.y + def.productOffsetY, def.productSheet, def.productFrame)
            .setScale(def.productScale ?? 2)
            .setDepth(99990);
        }
        if (a.product) a.product.setPosition(a.sprite.x, a.sprite.y + def.productOffsetY);
        if (def.breeding && a.breedAt !== undefined && time >= a.breedAt) {
          a.breedAt = time + (def.breeding.ms * (0.7 + Math.random() * 0.6)) / this.growthMult;
          breeders.push(a);
        }
      }
      a.sprite.setDepth(a.sprite.y + 14);
    }
    // Defer list mutations until after iteration.
    for (const a of breeders) this.tryBreed(a);
    for (const a of grown) this.growUp(a);
  }

  // An adult tries to produce a baby, if it has a mate and the herd isn't full.
  private tryBreed(a: Animal) {
    const def = ANIMAL_BY_ID[a.type];
    if (!def.breeding) return;
    if ((this.animalCounts[a.type] ?? 0) < 2) return; // needs a pair
    const herd = this.animals.filter((x) => x.type === a.type).length; // adults + babies
    if (herd >= def.breeding.cap) return;
    this.spawnBaby(def, a.sprite.x + (Math.random() * 2 - 1) * 16, a.sprite.y + 10);
    this.burst(a.sprite.x, a.sprite.y - 8, 'p_star', { speed: { min: 20, max: 50 }, lifespan: 600, scale: { start: 0.8, end: 0 }, tint: 0xffc6e0 }, 5);
    this.toast(`🐣 A baby ${def.name.toLowerCase()} was born!`);
  }

  private growUp(a: Animal) {
    const def = ANIMAL_BY_ID[a.type];
    const i = this.animals.indexOf(a);
    if (i >= 0) this.animals.splice(i, 1);
    const { x, y } = a.sprite;
    a.sprite.destroy();
    this.animalCounts[a.type] = (this.animalCounts[a.type] ?? 0) + 1;
    this.spawnAnimal(def, x, y);
    this.burst(x, y - 10, 'p_star', { speed: { min: 30, max: 70 }, lifespan: 700, scale: { start: 1, end: 0 }, tint: 0xfff3a0 }, 7);
    this.toast(`✨ A baby ${def.name.toLowerCase()} grew into an adult!`);
    this.emitState();
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
      const area = this.producerArea(adef);
      for (let i = 0; i < count; i++) {
        this.spawnAnimal(
          adef,
          Phaser.Math.Between(area.x0 + 24, area.x1 - 24),
          Phaser.Math.Between(area.y0 + 24, area.y1 - 24),
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
        .setTint(plant.cropTint ?? 0xffffff)
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

  // Occasional rain: a passing shower that waters every tilled tile for free.
  private updateWeather(time: number) {
    if (this.weatherUntil === 0) {
      if (this.startRaining) {
        this.raining = true;
        this.rain.emitting = true;
        this.storm.setAlpha(0.2);
        this.weatherUntil = time + 30_000;
      } else {
        this.weatherUntil = time + 30_000 + Math.random() * 40_000; // first dry spell
      }
    }
    if (time >= this.weatherUntil) {
      this.raining = !this.raining;
      this.rain.emitting = this.raining;
      this.tweens.add({ targets: this.storm, alpha: this.raining ? 0.2 : 0, duration: 1500 });
      if (this.raining) {
        this.weatherUntil = time + 22_000 + Math.random() * 22_000; // shower length
        this.toast('🌧️ A gentle rain rolls in — your crops are watered.');
      } else {
        this.weatherUntil = time + 55_000 + Math.random() * 70_000; // dry spell
        this.toast('🌤️ The rain clears up.');
      }
    }
    if (this.raining && time - this.lastRainWater > 1500) {
      this.lastRainWater = time;
      this.rainWater();
    }
  }

  // Wet every tilled tile (rain falls everywhere).
  private rainWater() {
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (!this.tiles[y][x].tilled) continue;
        this.tiles[y][x].wetUntil = this.time.now + WET_MS;
        this.wetTiles.add(this.key(x, y));
        this.setGroundTexture(x, y);
      }
    }
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
      this.player.anims.play(`idle-${this.facing}`, true);
    }
    this.player.setDepth(this.player.y + 18);

    // Swing the orchard gate open when the farmer is near.
    if (this.gate) {
      const near = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.gate.x, this.gate.y) < 56;
      if (near && !this.gateOpen) {
        this.gateOpen = true;
        this.gate.play('gate-open');
      } else if (!near && this.gateOpen) {
        this.gateOpen = false;
        this.gate.play('gate-close');
      }
    }

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
    this.fireflies.emitting = (frac < 0.3 || frac >= 0.82) && !this.raining;
    this.updateWeather(time);

    // Sprinkler upgrade keeps tilled tiles watered on a timer.
    if (time - this.lastSprinkle > sprinklerIntervalMs(this.upgrades.sprinkler) / this.growthMult) {
      this.lastSprinkle = time;
      if (this.upgrades.sprinkler > 0) this.rainWater();
    }

    // tile cursor
    const p = this.input.activePointer;
    const tx = Math.floor(p.worldX / TILE);
    const ty = Math.floor(p.worldY / TILE);
    if (this.pointerInside && this.inBounds(tx, ty)) {
      const canFarm = this.inRange(tx, ty) && isInMyPlot(tx, ty);
      this.highlight
        .setVisible(true)
        .setPosition(tx * TILE + TILE / 2, ty * TILE + TILE / 2)
        .setTint(canFarm ? 0xffffff : 0xff5555);
    } else {
      this.highlight.setVisible(false);
    }
  }
}
