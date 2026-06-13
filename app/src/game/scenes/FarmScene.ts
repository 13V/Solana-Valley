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
  rarityRank,
  pickMutation,
  cropValue,
  stackKey,
  rollShop,
  MUTATION_BY_ID,
  type Plant,
  type Mutation,
} from '../economy';
import { bus } from '../EventBus';

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
type Dir = 'down' | 'up' | 'side';

const TREES: Array<[number, number]> = [
  [8, 3], [12, 6], [21, 4], [26, 7], [6, 13], [23, 15], [18, 2], [3, 12],
];
const ROCKS: Array<[number, number]> = [
  [10, 9], [24, 11], [15, 3], [19, 13], [5, 6],
];
const POND = { x0: 25, y0: 14, w: 3, h: 2 };
const CABIN = { cx: 3, baseY: 3 };

export class FarmScene extends Phaser.Scene {
  private tiles: Tile[][] = [];
  private ground: Phaser.GameObjects.Image[][] = [];
  private crops = new Map<string, Crop>();
  private wetTiles = new Set<string>();
  private rainbowCrops = new Set<Crop>();
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
  private waterTiles: Phaser.GameObjects.Image[] = [];
  private waterFrame = 0;

  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private highlight!: Phaser.GameObjects.Image;
  private ambient!: Phaser.GameObjects.Rectangle;
  private facing: Dir = 'down';
  private faceLeft = false;
  private pointerInside = false;

  private coins = STARTING_COINS;
  private selected = 'hoe';
  private selectedSeed: string | null = 'carrot';
  private seeds: Record<string, number> = { carrot: 5 };
  private harvestInv: Record<string, number> = {};
  private shopStock: Record<string, number> = {};

  private timeMs = DAY_LENGTH_MS * 0.34; // start mid-morning
  private restockMs = RESTOCK_MS;
  private growthMult = 1;
  private forcedMutation: Mutation | null = null;
  private unsubs: Array<() => void> = [];

  constructor() {
    super('Farm');
  }

  create() {
    this.applyDevParams();

    this.physics.world.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.obstacles = this.physics.add.staticGroup();
    this.buildWorld();
    this.placeDecorations();

    this.player = this.physics.add.sprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'player_down_0');
    this.player.setCollideWorldBounds(true);
    this.player.body!.setSize(10, 8).setOffset(7, 19);
    this.physics.add.collider(this.player, this.obstacles);
    this.createAnims();

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

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.useToolAt(Math.floor(p.worldX / TILE), Math.floor(p.worldY / TILE));
    });
    this.input.on('pointermove', () => (this.pointerInside = true));
    this.input.on('gameout', () => (this.pointerInside = false));

    this.shopStock = rollShop();

    this.unsubs.push(
      bus.on('ui:selectTool', (id) => this.setTool(id)),
      bus.on('ui:selectSeed', (id) => this.selectSeed(id)),
      bus.on('ui:buySeed', (id) => this.buySeed(id)),
      bus.on('ui:sellStack', (key) => this.sellStack(key)),
      bus.on('ui:sellAll', () => this.sellAll()),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubs.forEach((u) => u());
      this.unsubs = [];
    });

    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.emitClock() });
    this.time.addEvent({
      delay: 550,
      loop: true,
      callback: () => {
        this.waterFrame ^= 1;
        this.waterTiles.forEach((im) => im.setTexture(`water${this.waterFrame}`));
      },
    });

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
        this.tiles[y][x] = { tilled: false, wetUntil: 0, obstacle: false };
        this.ground[y][x] = this.add
          .image(x * TILE + TILE / 2, y * TILE + TILE / 2, `grass${(x * 7 + y * 13) % 3}`)
          .setDepth(0);
      }
    }
  }

  private placeDecorations() {
    // Pond.
    for (let dy = 0; dy < POND.h; dy++) {
      for (let dx = 0; dx < POND.w; dx++) {
        const tx = POND.x0 + dx;
        const ty = POND.y0 + dy;
        const cx = tx * TILE + TILE / 2;
        const cy = ty * TILE + TILE / 2;
        this.waterTiles.push(this.add.image(cx, cy, 'water0').setDepth(1));
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

    // Trees, with a gentle sway.
    for (const [tx, ty] of TREES) {
      const cx = tx * TILE + TILE / 2;
      const baseY = ty * TILE + TILE;
      const tree = this.add.image(cx, baseY, 'tree').setOrigin(0.5, 1).setDepth(baseY);
      this.tiles[ty][tx].obstacle = true;
      this.addCollider(cx, baseY - 6, 14, 10);
      this.tweens.add({
        targets: tree,
        angle: { from: -1.5, to: 1.5 },
        duration: 2200 + Math.random() * 800,
        delay: Math.random() * 1500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    }

    // Scatter wildflowers on open grass.
    let placed = 0;
    let guard = 0;
    while (placed < 16 && guard++ < 200) {
      const tx = Phaser.Math.Between(1, GRID_W - 2);
      const ty = Phaser.Math.Between(1, GRID_H - 2);
      if (this.tiles[ty][tx].obstacle) continue;
      this.add
        .image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, `flower${placed % 4}`)
        .setDepth(2);
      placed++;
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
    const t = this.tiles[y][x];
    if (this.isWet(x, y)) this.ground[y][x].setTexture('soil_wet');
    else if (t.tilled) this.ground[y][x].setTexture('soil');
    else this.ground[y][x].setTexture(`grass${(x * 7 + y * 13) % 3}`);
  }

  // ---- tools --------------------------------------------------------------

  private useToolAt(tx: number, ty: number) {
    if (!this.inBounds(tx, ty) || !this.inRange(tx, ty)) return;
    const tile = this.tiles[ty][tx];
    if (tile.obstacle) return;
    const crop = this.crops.get(this.key(tx, ty));

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
      if (tile.tilled) this.water(tx, ty);
    } else if (this.selected === 'seed') {
      this.plant(tx, ty);
    }
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
      .image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, `crop_${plant.id}_0`)
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
    this.emitState();
  }

  private matureCrop(crop: Crop) {
    crop.mature = true;
    crop.stage = STAGES - 1;
    crop.mutation = this.forcedMutation ?? pickMutation();
    crop.wetAtMature = this.isWet(crop.tx, crop.ty);
    crop.sprite.setTexture(`crop_${crop.plant.id}_${STAGES - 1}`);

    const cx = crop.tx * TILE + TILE / 2;
    const cy = crop.ty * TILE + TILE / 2;
    const m = crop.mutation;
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

      const label = m.id !== 'normal' ? `${m.name} ` : '';
      this.toast(`✨ ${label}${crop.plant.name} is ready!`);
    }
  }

  private harvest(tx: number, ty: number) {
    const k = this.key(tx, ty);
    const crop = this.crops.get(k);
    if (!crop || !crop.mature) return;
    const m = crop.mutation ?? MUTATION_BY_ID.normal;
    const value = cropValue(crop.plant, m, crop.wetAtMature);
    this.harvestInv[stackKey(crop.plant.id, m.id, crop.wetAtMature)] =
      (this.harvestInv[stackKey(crop.plant.id, m.id, crop.wetAtMature)] ?? 0) + 1;

    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    this.burst(cx, cy, 'p_bit', {
      tint: crop.plant.fruit,
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
    this.shopStock = rollShop();
    this.restockMs = RESTOCK_MS;
    this.toast('🛒 The seed shop restocked!');
    this.emitState();
  }

  private toast(msg: string) {
    bus.emit('toast', msg);
  }

  private emitState() {
    bus.emit('state', {
      coins: this.coins,
      selected: this.selected,
      selectedSeed: this.selectedSeed,
      seeds: { ...this.seeds },
      harvest: { ...this.harvestInv },
      shop: PLANTS.map((p) => ({ plantId: p.id, stock: this.shopStock[p.id] ?? 0 })),
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
    this.player.setDepth(this.player.y + 14);

    // crop growth
    for (const crop of this.crops.values()) {
      if (crop.mature) continue;
      const wet = this.isWet(crop.tx, crop.ty);
      crop.grownMs += delta * (wet ? 2 : 1) * this.growthMult;
      const total = crop.plant.growthSeconds * 1000;
      const ns = Math.min(STAGES - 1, Math.floor((crop.grownMs / total) * (STAGES - 1)));
      if (ns !== crop.stage && ns < STAGES - 1) {
        crop.stage = ns;
        crop.sprite.setTexture(`crop_${crop.plant.id}_${ns}`);
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
    const { color, alpha } = this.ambientFor((this.timeMs % DAY_LENGTH_MS) / DAY_LENGTH_MS);
    this.ambient.setFillStyle(color);
    this.ambient.setAlpha(alpha);

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
