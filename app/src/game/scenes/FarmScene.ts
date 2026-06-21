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
import { SKINS, SKIN_BY_ID, DEFAULT_SKIN, skinTextureKey } from '../skins';
import {
  SHORE,
  BEACH,
  type Rect,
} from '../plots';
import {
  EMPTY_SKILLS,
  EMPTY_PERKS,
  skillLevel,
  activeModifiers,
  PERK_LEVELS,
  MAX_SKILL_LEVEL,
  type SkillId,
  type Skills,
  type ChosenPerks,
  type Modifiers,
  SKILL_BY_ID,
} from '../skills';
import {
  catchFish,
  fishXp,
  fishColor,
  fishCss,
  FISH_SHEET,
  TREASURE_FRAMES,
  type WaterKind,
} from '../fishing';
import { FishingCast, type CastPhase } from '../fishingCast';
import {
  applyFishTree,
  fishPointsForCatch,
  spentPoints,
  prereqMet,
  FISH_NODE_BY_ID,
} from '../fishingTree';
import { pickForage, forageXp, type Forage } from '../forage';
import { bus } from '../EventBus';
import { sfx } from '../audio';
import { map as islandMap, classify, isBoatKey } from '../mapLoader';

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

// The player's two animal pens + orchard in *pixel* coords. The procedural
// homestead is gone (the world is now the hand-authored startIsland.json map),
// so producers roam default open-grass rectangles near the island centre.
// Chickens roam the chicken area, cows the cow area, fruit trees the orchard.
const px = (r: Rect) => ({ x0: r.x0 * TILE, y0: r.y0 * TILE, x1: (r.x1 + 1) * TILE, y1: (r.y1 + 1) * TILE });
const CHICKEN_PEN = px({ x0: 14, y0: 9, x1: 19, y1: 13 });
const COW_PEN = px({ x0: 27, y0: 9, x1: 33, y1: 14 });
const ORCHARD = px({ x0: 14, y0: 4, x1: 20, y1: 6 });

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
// 13: world is now the hand-authored startIsland.json map (data-driven loader);
// farm/water tiles come from the map, so older saves' tiles no longer line up
// and reset cleanly.
const SAVE_VERSION = 13;

// A gatherable forage node sitting on open grass.
type ForageNode = {
  forage: Forage;
  tx: number;
  ty: number;
  sprite: Phaser.GameObjects.Image;
};

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
  skills: Skills;
  perks: ChosenPerks;
  fishNodes?: string[]; // Angler's Tree: unlocked node ids (optional — old saves predate it)
  fishPts?: number; // lifetime fishing points earned
  skin: string; // worn outfit id
  ownedSkins: string[]; // unlocked outfit ids
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
  private skin = DEFAULT_SKIN; // active outfit skin id
  private ownedSkins = new Set<string>([DEFAULT_SKIN]); // unlocked outfits
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

  // skill progression (xp per skill) + chosen milestone perks
  private skills: Skills = { ...EMPTY_SKILLS };
  private perks: ChosenPerks = { ...EMPTY_PERKS };
  // Angler's Tree: unlocked node ids + lifetime fishing points earned.
  private fishNodes = new Set<string>();
  private fishPts = 0;
  // Aggregated multipliers/flags from skills + perks + the Angler's Tree;
  // recomputed on any change.
  private modCache: Modifiers = applyFishTree(activeModifiers(this.skills, this.perks), this.fishNodes);

  // fishing
  private pond!: Rect; // pond rect in tile coords (inclusive)
  private pondTiles = new Set<string>(); // fast "is this a (fishable) water tile" lookup
  private pathTiles = new Set<string>(); // path/bridge flat tiles (kept clear of scatter)
  private farmTiles = new Set<string>(); // tillable/plantable tiles from the map's dirt cells
  private boatTiles = new Set<string>(); // rowboat tiles (future marketplace hub portal)
  private boatToastShown = false; // one-time "coming soon" hint near the boat
  private casting = false; // only one cast at a time
  private fishingCast!: FishingCast; // rod/line/bobber cast choreography
  // foraging
  private forageNodes: ForageNode[] = [];

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
    this.buildFromMap(); // render the hand-authored start island (startIsland.json)
    this.prettifyGrass(); // scatter a few soft flowers on the plain grass

    this.player = this.physics.add.sprite(
      FarmScene.SPAWN.x * TILE + TILE / 2,
      FarmScene.SPAWN.y * TILE + TILE / 2,
      'pchar',
      0,
    );
    this.player.setCollideWorldBounds(true);
    this.player.setOrigin(0.5, 0.72).setScale(1.85);
    this.player.body!.setSize(13, 9).setOffset(17, 33);
    this.physics.add.collider(this.player, this.obstacles);

    // A tiled-water backdrop (well past the world edges) so the island floats in
    // open sea on any screen size. A slow drift keeps the ocean alive.
    const M = 1400;
    const sea = this.add
      .tileSprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH + 2 * M, WORLD_HEIGHT + 2 * M, 'water', 0)
      .setTileScale(2, 2)
      .setDepth(-10000);
    this.tweens.add({ targets: sea, tilePositionX: 32, duration: 5200, repeat: -1, ease: 'Linear' });
    this.tweens.add({ targets: sea, tilePositionY: 32, duration: 7400, repeat: -1, ease: 'Linear' });

    // Camera follows the player; zoomed in so the character reads at a cozy size.
    // (?zoom=<n> overrides for dev/overview screenshots.)
    const zoomParam = Number(new URLSearchParams(location.search).get('zoom'));
    this.cameras.main.setBounds(-M, -M, WORLD_WIDTH + 2 * M, WORLD_HEIGHT + 2 * M);
    this.cameras.main.setZoom(Number.isFinite(zoomParam) && zoomParam > 0 ? zoomParam : 1.65);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    // ?cam=tx,ty centres the camera on a tile (dev/screenshot overviews).
    const camRaw = new URLSearchParams(location.search).get('cam');
    if (camRaw) {
      const [cxt, cyt] = camRaw.split(',').map(Number);
      if (Number.isFinite(cxt) && Number.isFinite(cyt)) {
        this.cameras.main.stopFollow();
        this.cameras.main.centerOn(cxt * TILE, cyt * TILE);
      }
    }

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

    this.fishingCast = new FishingCast(this);

    // Browsers suspend audio until a user gesture; resume on first input.
    this.input.once('pointerdown', () => sfx.resume());
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      // While a cast is live, every click is a fishing input (hook the bite or
      // reel in early) — it must never fall through to a tool/plant action.
      if (this.casting) {
        this.fishingCast.onPointer();
        return;
      }
      // Gathering interactions take priority over the held tool so clicking the
      // pond fishes (never tills/plants) and clicking a node forages.
      if (this.tryCollectAnimal(p.worldX, p.worldY)) return;
      if (this.tryForage(p.worldX, p.worldY)) return;
      const tx = Math.floor(p.worldX / TILE);
      const ty = Math.floor(p.worldY / TILE);
      if (this.tryFish(tx, ty)) return;
      this.useToolAt(tx, ty);
    });
    this.input.on('pointermove', () => (this.pointerInside = true));
    this.input.on('gameout', () => (this.pointerInside = false));

    this.shopStock = rollShop(levelInfo(this.xp).level);
    if (this.persist) this.loadSave();

    // Scatter forage nodes across the open world (after any save load so they
    // never land on restored crops).
    this.spawnForageNodes(Phaser.Math.Between(8, 12));

    this.unsubs.push(
      bus.on('ui:selectTool', (id) => this.setTool(id)),
      bus.on('ui:selectSeed', (id) => this.selectSeed(id)),
      bus.on('ui:buySeed', (id) => this.buySeed(id)),
      bus.on('ui:sellStack', (key) => this.sellStack(key)),
      bus.on('ui:sellAll', () => this.sellAll()),
      bus.on('ui:buyUpgrade', (id) => this.buyUpgrade(id)),
      bus.on('ui:buyAnimal', (id) => this.buyAnimal(id)),
      bus.on('ui:choosePerk', ({ skill, level, perk }) => this.choosePerk(skill, level, perk)),
      bus.on('ui:unlockFishNode', (id) => this.unlockFishNode(id)),
      bus.on('ui:selectSkin', (id) => this.selectSkin(id)),
    );
    this.applySkin(this.skin); // wear the saved outfit (or classic) now the player exists
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubs.forEach((u) => u());
      this.unsubs = [];
      this.fishingCast.destroy();
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

    // A little welcome moment pointing the player at the tilled-dirt patches.
    this.time.delayedCall(700, () => this.toast('🌱 Welcome to your island! Hoe the dirt patches and plant your seeds.'));

    // Expose for debugging / e2e screenshots when a dev param is present.
    if (location.search.length > 1) {
      (window as unknown as { __farm?: FarmScene }).__farm = this;
    }
  }

  // Aggregated skill/perk modifiers. Cheap to read (returns the cached bag);
  // recomputed whenever skills or perks change (see recomputeMods).
  private mods(): Modifiers {
    return this.modCache;
  }

  private recomputeMods() {
    this.modCache = applyFishTree(activeModifiers(this.skills, this.perks), this.fishNodes);
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
      skills: { ...this.skills },
      pond: this.pond,
      forageNodes: this.forageNodes.map((n) => ({ id: n.forage.id, tx: n.tx, ty: n.ty })),
      casting: this.casting,
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
    this.persist = !['fast', 'give', 'mut', 'time', 'debug', 'reset', 'coins', 'xp', 'rain', 'zoom'].some((k) => params.has(k));
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
    // Player locomotion + tool swings — one namespaced set per outfit skin, so a
    // recoloured sheet animates exactly like the base (mirrors the animal swaps).
    for (const skin of SKINS) {
      const sheet = skinTextureKey(skin.id);
      if (!this.textures.exists(sheet)) continue; // skip skins whose texture failed to build
      for (const dir of ['down', 'up', 'left', 'right'] as Dir[]) {
        const walk = `${sheet}-walk-${dir}`;
        if (!this.anims.exists(walk)) {
          const start = FarmScene.WALK_ROW[dir];
          this.anims.create({
            key: walk,
            frames: this.anims.generateFrameNumbers(sheet, { start, end: start + 7 }),
            frameRate: 12,
            repeat: -1,
          });
        }
        const idle = `${sheet}-idle-${dir}`;
        if (!this.anims.exists(idle)) {
          const start = FarmScene.IDLE_ROW[dir];
          this.anims.create({
            key: idle,
            frames: this.anims.generateFrameNumbers(sheet, { start, end: start + 7 }),
            frameRate: 6,
            repeat: -1,
          });
        }
      }
      // Directional tool swings from the premium sheet (rows 12–23, 8 frames each).
      for (const tool of ['hoe', 'water'] as const) {
        for (const dir of ['down', 'up', 'left', 'right'] as Dir[]) {
          const key = `${sheet}-act-${tool}-${dir}`;
          if (this.anims.exists(key)) continue;
          const start = FarmScene.TOOL_ROW[tool][dir];
          this.anims.create({
            key,
            frames: this.anims.generateFrameNumbers(sheet, { start, end: start + 7 }),
            frameRate: 18,
            repeat: 0,
          });
        }
      }
    }

    // Fishing cast animations from the Ocean Pack character sheets (the same cat
    // as pchar). left/right share the side sheet (right = flipX). Frame rows:
    // cast 32–38, wait 64–80, reel 96–106, hook 128–135, catch (front) 160–191.
    const fishSheet: Record<Dir, string> = {
      down: 'pfish_front', up: 'pfish_back', left: 'pfish_side', right: 'pfish_side',
    };
    for (const dir of ['down', 'up', 'left', 'right'] as Dir[]) {
      const sheet = fishSheet[dir];
      if (!this.textures.exists(sheet)) continue;
      const mk = (name: string, start: number, end: number, frameRate: number, repeat: number) => {
        const key = `pfish-${name}-${dir}`;
        if (!this.anims.exists(key)) {
          this.anims.create({ key, frames: this.anims.generateFrameNumbers(sheet, { start, end }), frameRate, repeat });
        }
      };
      mk('cast', 32, 38, 16, 0);
      mk('wait', 64, 80, 8, -1);
      mk('reel', 96, 106, 14, 0);
      mk('hook', 128, 135, 14, 0);
    }
    if (this.textures.exists('pfish_front') && !this.anims.exists('pfish-catch')) {
      this.anims.create({
        key: 'pfish-catch',
        frames: this.anims.generateFrameNumbers('pfish_front', { start: 160, end: 191 }),
        frameRate: 14, repeat: 0,
      });
    }

    // Bobber + water-splash (Ocean Pack `fishing_splash`, 48px) and the underwater
    // shadow-fish tell (`fish_shadow_md`, 16px) used by the cast minigame.
    if (this.textures.exists('fishing_splash')) {
      if (!this.anims.exists('bobber_idle')) {
        this.anims.create({ key: 'bobber_idle', frames: [{ key: 'fishing_splash', frame: 0 }] });
      }
      if (!this.anims.exists('bobber_dunk')) {
        this.anims.create({
          key: 'bobber_dunk', frameRate: 18, repeat: 0,
          frames: this.anims.generateFrameNumbers('fishing_splash', { frames: [2, 4, 5, 6, 8] }),
        });
      }
      if (!this.anims.exists('splash_burst')) {
        this.anims.create({
          key: 'splash_burst', frameRate: 20, repeat: 0,
          frames: this.anims.generateFrameNumbers('fishing_splash', { frames: [16, 17, 18, 19] }),
        });
      }
    }
    if (this.textures.exists('fish_shadow_md') && !this.anims.exists('shadow_swim')) {
      this.anims.create({
        key: 'shadow_swim', frameRate: 10, repeat: -1,
        frames: this.anims.generateFrameNumbers('fish_shadow_md', { start: 0, end: 14 }),
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

  // The texture key for the player's current outfit (falls back to the base
  // sheet if the active skin's texture is somehow missing).
  private playerSheet(): string {
    const key = skinTextureKey(this.skin);
    return this.textures.exists(key) ? key : skinTextureKey(DEFAULT_SKIN);
  }

  // Wear an (already-owned) outfit: swap the sprite texture and replay the
  // current idle so the change shows instantly.
  private applySkin(id: string) {
    this.skin = SKIN_BY_ID[id] ? id : DEFAULT_SKIN;
    const sheet = this.playerSheet();
    this.player.setTexture(sheet, 0);
    this.player.anims.play(`${sheet}-idle-${this.facing}`, true);
  }

  // UI intent: buy (if needed & affordable) and wear an outfit.
  private selectSkin(id: string) {
    const skin = SKIN_BY_ID[id];
    if (!skin) return;
    if (!this.ownedSkins.has(id)) {
      if (this.coins < skin.cost) {
        bus.emit('toast', `Need ${skin.cost.toLocaleString()}🪙 for the ${skin.name} coat`);
        return;
      }
      this.coins -= skin.cost;
      this.ownedSkins.add(id);
      sfx.play('buy');
      bus.emit('toast', `Unlocked the ${skin.name} coat! 🐾`);
    }
    this.applySkin(id);
    this.saveState();
    this.emitState();
  }

  private playAction(tool: 'hoe' | 'water') {
    this.actingUntil = this.time.now + 440; // ~8 frames @ 18fps
    this.player.anims.play(`${this.playerSheet()}-act-${tool}-${this.facing}`, true);
  }

  // Solid tilled-dirt tiles (premium Tilled_Dirt_v2 sheet, 11 cols) that tile
  // seamlessly into a filled plot; a few variants add subtle texture.
  private static TILLED_FRAMES = [55, 56, 57];

  // Where the player starts: a plain grass tile near the island's centre (the
  // authored cells occupy roughly x[12..36] y[1..19]).
  private static SPAWN = { x: 24, y: 12 };

  // Island layout helper kept for the open-sea fishing fallback: tiles near the
  // grid edge (outside the authored map) are open ocean over the sea backdrop.
  // The map's own water cells are the primary fishing surface (see pondTiles).
  private tileZone(x: number, y: number): 'ocean' | 'beach' | 'land' {
    const d = Math.min(x, y, GRID_W - 1 - x, GRID_H - 1 - y);
    if (d < SHORE) return 'ocean';
    if (d < SHORE + BEACH) return 'beach';
    return 'land';
  }

  // ---- data-driven map ----------------------------------------------------

  // Build the world from the hand-authored startIsland.json map. The Ground
  // layer paints the base terrain (depth 0); Layer 2 paints flat decals
  // (path/bridge/dirt — depth 1) and tall objects (fences/trees/boats/coops —
  // per-row depth so they y-sort with the player). Cells are classified into
  // behaviour sets: water (solid + fishable), solidObj (solid), farm
  // (tillable/plantable) and walkable grass/flat.
  private buildFromMap() {
    // Dense tile grid so the rest of the scene (farming, collisions, saves) can
    // index [y][x] freely; everything off the authored map is plain walkable.
    for (let y = 0; y < GRID_H; y++) {
      this.tiles[y] = [];
      this.ground[y] = [];
      this.overlay[y] = [];
      for (let x = 0; x < GRID_W; x++) {
        this.tiles[y][x] = { tilled: false, wetUntil: 0, obstacle: false };
      }
    }

    // Blue-tint grass fill (frame 12 is fully opaque) used as a base layer.
    const GRASS_BASE_KEY = 'sorry_early_access_plant_update_2_ground_tilesets_blue_tint_grass_tile_layers';
    const GRASS_BASE_FRAME = 12;

    const ground = islandMap.layers.find((l) => l.name === 'Ground');
    const overlays = islandMap.layers.filter((l) => l.name !== 'Ground');

    // Ground layer first (depth 0) — also records the base category per cell so
    // the prettify pass can find plain-grass tiles with nothing on top.
    if (ground?.visible !== false && ground) {
      for (const k in ground.cells) {
        const [key, frame] = ground.cells[k];
        const [gx, gy] = k.split(',').map(Number);
        if (!this.inBounds(gx, gy)) continue;
        const cx = gx * TILE + TILE / 2;
        const cy = gy * TILE + TILE / 2;
        const cat = classify(key);
        // Opaque grass base under non-water cells: the blue-tint grass autotile's
        // edge/corner frames are 12–28% transparent, so without a base the teal sea
        // backdrop shows through and the land edges look like water.
        if (cat !== 'water') this.add.image(cx, cy, GRASS_BASE_KEY, GRASS_BASE_FRAME).setScale(2).setDepth(-1);
        const img = this.add.image(cx, cy, key, frame).setScale(2).setDepth(0);
        this.ground[gy][gx] = img;
        if (cat === 'water') {
          this.tiles[gy][gx].obstacle = true;
          this.pondTiles.add(k); // fishable water
          this.addCollider(cx, cy, TILE, TILE);
        } else if (cat === 'farm') {
          this.farmTiles.add(k); // tillable/plantable
        }
      }
    }

    // Overlay layers (Layer 2, Layer 3, …) in array order: flat decals keep depth
    // 1; tall objects get per-row depth (cy) so the player can pass behind them.
    for (const layer of overlays) {
      if (layer.visible === false) continue;
      for (const k in layer.cells) {
        const [key, frame] = layer.cells[k];
        const [lx, ly] = k.split(',').map(Number);
        if (!this.inBounds(lx, ly)) continue;
        const cx = lx * TILE + TILE / 2;
        const cy = ly * TILE + TILE / 2;
        const cat = classify(key);
        if (cat === 'solidObj') {
          this.add.image(cx, cy, key, frame).setScale(2).setDepth(cy);
          this.tiles[ly][lx].obstacle = true;
          this.addCollider(cx, cy, TILE, TILE);
          if (isBoatKey(key)) this.boatTiles.add(k);
        } else if (cat === 'farm') {
          // Wide tilled-dirt laid as a top decal — tillable/plantable, not solid.
          this.add.image(cx, cy, key, frame).setScale(2).setDepth(1);
          this.farmTiles.add(k);
        } else {
          // flat (path/bridge) or stray grass decal — walkable, sits above ground.
          this.add.image(cx, cy, key, frame).setScale(2).setDepth(1);
          if (cat === 'flat') this.pathTiles.add(k);
        }
      }
    }

    // A tilled-soil overlay sprite for every farm tile (hidden until hoed). The
    // existing autotile/wet logic in setGroundTexture drives these.
    for (const k of this.farmTiles) {
      const [fx, fy] = k.split(',').map(Number);
      this.overlay[fy][fx] = this.add
        .image(fx * TILE + TILE / 2, fy * TILE + TILE / 2, 'tilled', 42)
        .setScale(2)
        .setDepth(1)
        .setVisible(false);
    }

    // The fishing code reads a `pond` rect for its debug dump; derive a bounding
    // box over the authored water cells (purely informational).
    this.pond = this.waterBounds();
  }

  // Bounding rect (inclusive tile coords) over all fishable water cells.
  private waterBounds(): Rect {
    let x0 = GRID_W, y0 = GRID_H, x1 = 0, y1 = 0;
    for (const k of this.pondTiles) {
      const [x, y] = k.split(',').map(Number);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    if (this.pondTiles.size === 0) return { x0: 0, y0: 0, x1: 0, y1: 0 };
    return { x0, y0, x1, y1 };
  }

  // Scatter a few soft, color-matched flowers/decorations on PLAIN grass only:
  // a grass-category Ground cell with no Layer-2 object, not farm/water/path,
  // and clear of the player's immediate spawn. Light density; taller bushes get
  // per-row depth so the player passes behind them.
  private prettifyGrass() {
    // Plain-grass candidates: Ground grass cell with nothing layered on top.
    const ground = islandMap.layers.find((l) => l.name === 'Ground');
    if (!ground) return;
    const candidates: Array<[number, number]> = [];
    for (const k in ground.cells) {
      if (classify(ground.cells[k][0]) !== 'grass') continue;
      const [gx, gy] = k.split(',').map(Number);
      if (!this.inBounds(gx, gy)) continue;
      if (this.tiles[gy][gx].obstacle) continue;
      if (this.farmTiles.has(k) || this.pondTiles.has(k) || this.pathTiles.has(k)) continue;
      // Keep the spawn tile and its ring clear so the player never starts buried.
      if (Math.abs(gx - FarmScene.SPAWN.x) <= 1 && Math.abs(gy - FarmScene.SPAWN.y) <= 1) continue;
      candidates.push([gx, gy]);
    }
    Phaser.Utils.Array.Shuffle(candidates);

    // Small ground flowers (flat, depth 2) — soft blooms matched to the grass.
    const flowerFrames = ['flower_y', 'flower_p', 'flower_p2'];
    // Low bushes/sprouts that read as taller — per-row depth so they y-sort.
    const bushFrames = ['bush', 'bush2', 'sprout'];
    const count = Math.min(40, candidates.length);
    for (let i = 0; i < count; i++) {
      const [tx, ty] = candidates[i];
      const cx = tx * TILE + TILE / 2;
      const cy = ty * TILE + TILE / 2;
      // ~75% small flat flowers, ~25% slightly taller bushes/sprouts.
      if (i % 4 === 3) {
        this.add
          .image(cx, ty * TILE + TILE, 'biome', bushFrames[i % bushFrames.length])
          .setOrigin(0.5, 1)
          .setScale(2)
          .setDepth(ty * TILE + TILE);
      } else {
        this.add.image(cx, cy, 'biome', flowerFrames[i % flowerFrames.length]).setScale(2).setDepth(2);
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
    if (!ov) return; // overlays exist only on the player's farm
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

  // A tile is farmable if the authored map flagged it as tilled-dirt (farmTiles).
  private isFarmable(tx: number, ty: number): boolean {
    return this.farmTiles.has(this.key(tx, ty));
  }

  private till(x: number, y: number): boolean {
    if (!this.isFarmable(x, y)) return false; // can only farm the map's dirt cells
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
    // Thrifty: a chance the seed isn't consumed when planting.
    if (Math.random() < this.mods().seedSaveChance) {
      this.floatText(tx * TILE + TILE / 2, ty * TILE - 14, '🌰 seed kept', '#ffe27a');
    } else {
      this.seeds[seed] -= 1;
    }
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
    crop.mutation = this.forcedMutation ?? pickMutation(fortuneLuck(this.upgrades.fortune) * this.mods().mutationLuckMult);
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
    const mods = this.mods();
    const m = crop.mutation ?? MUTATION_BY_ID.normal;
    const value = cropValue(crop.plant, m, crop.wetAtMature);
    const sk = stackKey(crop.plant.id, m.id, crop.wetAtMature);
    // Bountiful / Master Farmer: a chance this harvest yields two of the crop.
    const doubled = Math.random() < mods.cropDoubleChance;
    this.harvestInv[sk] = (this.harvestInv[sk] ?? 0) + (doubled ? 2 : 1);

    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    if (doubled) {
      this.floatText(cx, cy - 18, '×2!', '#7bff8a');
      this.burst(cx, cy, 'p_star', { speed: { min: 30, max: 90 }, lifespan: 650, scale: { start: 1, end: 0 }, tint: 0x7bff8a }, 8);
    }
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

    const plant = crop.plant;
    this.removeCrop(crop);
    this.crops.delete(k);

    this.harvested += 1;
    this.discoveredPlants.add(plant.id);
    if (m.id !== 'normal') {
      this.mutationsFound += 1;
      this.discoveredMutations.add(m.id);
    }
    this.gainXp(harvestXp(plant.baseValue));
    this.addSkillXp('farming', harvestXp(value)); // Farming skill grows per harvest
    this.checkAchievements();

    const label = m.id !== 'normal' ? `${m.name} ` : '';
    this.toast(`Harvested ${label}${plant.name}${doubled ? ' ×2' : ''} (worth ${value}🪙)`);
    // Master Farmer capstone: a chance to instantly re-till + re-plant for free.
    if (mods.autoReplant && Math.random() < 0.15 && this.isFarmable(tx, ty)) {
      this.autoReplant(tx, ty, plant);
    }
    this.emitState();
  }

  // Free re-till + re-plant of the same crop on a just-harvested tile (Master
  // Farmer capstone). No seed is consumed.
  private autoReplant(tx: number, ty: number, plant: Plant) {
    const t = this.tiles[ty][tx];
    if (t.obstacle || this.crops.has(this.key(tx, ty))) return;
    t.tilled = true;
    this.refreshTile(tx, ty);
    const sprite = this.add
      .image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'cropsheet', plant.cropRow * 5)
      .setScale(2)
      .setTint(plant.cropTint ?? 0xffffff)
      .setDepth(this.cropDepth(ty) - 1);
    this.crops.set(this.key(tx, ty), {
      plant, tx, ty, grownMs: 0, stage: 0, mature: false, mutation: null, wetAtMature: false, sprite,
    });
    this.floatText(tx * TILE + TILE / 2, ty * TILE - 16, '🌱 replant', '#bff58a');
  }

  // A small floating text that rises and fades (toasts/×2/golden cues).
  private floatText(x: number, y: number, msg: string, color: string) {
    const t = this.add
      .text(x, y, msg, {
        fontFamily: 'Pixelify Sans, monospace', fontSize: '16px', color,
        stroke: '#2a1f12', strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(120000);
    this.tweens.add({
      targets: t, y: y - 26, alpha: { from: 1, to: 0 }, duration: 900, ease: 'Sine.out',
      onComplete: () => t.destroy(),
    });
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
    const value = Math.round(
      cropValue(PLANT_BY_ID[plantId], MUTATION_BY_ID[mutId], wet === '1') *
        count *
        marketBonus(this.upgrades.market) *
        this.mods().cropValueMult,
    );
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
    total = Math.round(total * marketBonus(this.upgrades.market) * this.mods().cropValueMult);
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

  // Award XP to one of the five skills. Detects a level-up (compares the skill
  // level before/after), celebrating it with a toast, a particle burst over the
  // player and a chime. Recomputes modifiers (passives scale per level) and
  // re-emits state so the Skills panel stays current.
  private addSkillXp(id: SkillId, xp: number) {
    if (xp <= 0) return;
    const def = SKILL_BY_ID[id];
    const before = skillLevel(this.skills[id]);
    this.skills[id] = (this.skills[id] ?? 0) + xp;
    const after = skillLevel(this.skills[id]);
    if (after > before) {
      sfx.play('levelup');
      this.toast(`${def.icon} ${def.name} reached Lv ${after}!`);
      this.burst(this.player.x, this.player.y - 16, 'p_star', {
        speed: { min: 40, max: 110 },
        lifespan: 850,
        scale: { start: 1.2, end: 0 },
        tint: [0xfff3a0, 0xffe066, 0xffffff],
      }, 14);
      this.recomputeMods(); // per-level passives changed
      // Crossing a perk milestone (5/10/15) or hitting the Lv20 capstone prompts
      // the player to make a choice / unlocks the capstone.
      for (const lvl of PERK_LEVELS) {
        if (before < lvl && after >= lvl) {
          this.toast(`🎯 ${def.name} reached Lv ${lvl} — choose a perk in Skills!`);
        }
      }
      if (before < MAX_SKILL_LEVEL && after >= MAX_SKILL_LEVEL) {
        this.toast(`🌟 ${def.name} mastered! Capstone unlocked: ${def.capstone.name}.`);
      }
    }
    this.emitState();
  }

  // Lock in a milestone perk choice for a skill. Recomputes modifiers so the
  // benefit applies immediately, persists, and refreshes the UI.
  private choosePerk(skill: SkillId, level: number, perk: string) {
    const def = SKILL_BY_ID[skill];
    if (!def) return;
    const ms = def.milestones.find((m) => m.level === level);
    if (!ms) return;
    if (perk !== ms.a.id && perk !== ms.b.id) return; // ignore unknown perk ids
    if (skillLevel(this.skills[skill]) < level) return; // not unlocked yet
    if (this.perks[`${skill}:${level}`]) return; // already chosen (no re-rolls)
    this.perks[`${skill}:${level}`] = perk;
    this.recomputeMods();
    const chosen = perk === ms.a.id ? ms.a : ms.b;
    sfx.play('upgrade');
    this.toast(`${def.icon} ${chosen.name} — ${chosen.desc}`);
    this.emitState();
    this.saveState();
  }

  // Spend fishing points to unlock an Angler's Tree node. Validates the node
  // exists, isn't already owned, has its prerequisites met, and is affordable;
  // then applies its bonus to the modifier bag immediately.
  private unlockFishNode(id: string) {
    const node = FISH_NODE_BY_ID[id];
    if (!node) return;
    if (this.fishNodes.has(id)) return; // already unlocked
    if (!prereqMet(node, this.fishNodes)) {
      this.toast('🎣 Unlock the earlier nodes first.');
      return;
    }
    const available = this.fishPts - spentPoints(this.fishNodes);
    if (available < node.cost) {
      this.toast(`🎣 Need ${node.cost - available} more fishing point${node.cost - available > 1 ? 's' : ''} — catch more fish!`);
      return;
    }
    this.fishNodes.add(id);
    this.recomputeMods(); // node bonus applies right away
    sfx.play('upgrade');
    this.toast(`🎣 ${node.name} unlocked — ${node.desc}`);
    this.burst(this.player.x, this.player.y - 16, 'p_star', {
      speed: { min: 40, max: 110 }, lifespan: 800, scale: { start: 1.1, end: 0 },
      tint: [0x7bd0ff, 0xbff5ff, 0xffffff],
    }, 12);
    this.emitState();
    this.saveState();
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

  // Where a producer lives: fruit trees in the orchard, cows in the cow pasture,
  // chickens (and any other small animal) in the chicken pen. Used both to spawn
  // a new producer and to clamp its wandering.
  private producerArea(def: AnimalDef) {
    if (def.category === 'tree') return ORCHARD;
    return def.id === 'cow' ? COW_PEN : CHICKEN_PEN;
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
    const m = this.mods();
    this.animals.push({
      sprite: s,
      type: def.id,
      color,
      layAt: this.time.now + def.layMs / this.growthMult / m.prodSpeedMult,
      nextWander: this.time.now + 1500 + Math.random() * 3000,
      breedAt: def.breeding
        ? this.time.now + (def.breeding.ms * (0.6 + Math.random() * 0.8)) / this.growthMult / m.breedSpeedMult
        : undefined,
    });
  }

  // A baby wanders the pen and grows into an adult after a while. `rare` forces
  // the rare-colour baby sheet (Rare Bloodline / Master Breeder).
  private spawnBaby(def: AnimalDef, x: number, y: number, rare: boolean) {
    if (!def.breeding) return;
    const rareSheet = def.rareColor ? `baby_${def.rareColor}` : undefined;
    const color = rare && rareSheet && def.breeding.babySheets.includes(rareSheet)
      ? rareSheet
      : Phaser.Utils.Array.GetRandom(def.breeding.babySheets);
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
      growUpAt: this.time.now + def.breeding.growMs / this.growthMult / this.mods().breedSpeedMult,
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
    const where = def.category === 'tree'
      ? 'grows in the orchard'
      : def.id === 'cow' ? 'grazes the cow pasture' : 'roams the chicken pen';
    this.toast(`Bought a ${def.name}! It ${where} and makes ${def.productName.toLowerCase()}.`);
    this.emitState();
  }

  // Collect a ready product if the click landed on an animal. Returns true if so.
  private tryCollectAnimal(wx: number, wy: number): boolean {
    for (const a of this.animals) {
      if (a.product && Phaser.Math.Distance.Between(wx, wy, a.product.x, a.product.y) < 30) {
        const def = ANIMAL_BY_ID[a.type];
        const m = this.mods();
        a.product.destroy();
        a.product = undefined;
        // Production speed shortens the time to the next product.
        a.layAt = this.time.now + def.layMs / this.growthMult / m.prodSpeedMult;
        let value = Math.round(def.productValue * m.productValueMult);
        const cx = a.sprite.x;
        const cy = a.sprite.y;
        // Golden Touch: a rare golden product worth ×5 (takes priority over double).
        const golden = Math.random() < m.goldenProductChance;
        const doubled = !golden && Math.random() < m.productDoubleChance;
        if (golden) {
          value *= 5;
          this.floatText(cx, cy - 18, `✨ Golden ${def.productName}! ×5`, '#ffd21a');
          this.burst(cx, cy - 8, 'p_star', { speed: { min: 40, max: 110 }, lifespan: 800, scale: { start: 1.3, end: 0 }, tint: [0xffe066, 0xffd21a, 0xffffff] }, 14);
        } else if (doubled) {
          value *= 2;
          this.floatText(cx, cy - 18, '×2!', '#7bff8a');
        }
        this.coins += value;
        this.earned += value;
        this.gainXp(def.xp);
        this.addSkillXp('ranching', Math.max(3, Math.round(def.xp))); // Ranching skill
        this.checkAchievements();
        sfx.play('sell');
        this.burst(cx, cy - 10, 'p_star', {
          speed: { min: 30, max: 80 }, lifespan: 600, scale: { start: 1, end: 0 }, tint: golden ? 0xffd21a : 0xfff3a0,
        }, 6);
        this.toast(`Collected ${golden ? 'a golden ' : ''}${def.productName} (+${value}🪙)`);
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
        const pen = this.producerArea(def); // clamp each animal to its own pen
        const nx = Phaser.Math.Clamp(a.sprite.x + (Math.random() * 2 - 1) * 48, pen.x0 + 30, pen.x1 - 30);
        const ny = Phaser.Math.Clamp(a.sprite.y + (Math.random() * 2 - 1) * 48, pen.y0 + 38, pen.y1 - 28);
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
          a.breedAt = time + (def.breeding.ms * (0.7 + Math.random() * 0.6)) / this.growthMult / this.mods().breedSpeedMult;
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
    const m = this.mods();
    const herd = this.animals.filter((x) => x.type === a.type).length; // adults + babies
    // Breeding skill + perks raise the herd cap.
    if (herd >= def.breeding.cap + m.breedCapBonus) return;
    // Rare Bloodline: a chance the baby is forced to the rare colourway.
    const rare = Math.random() < m.rareBabyChance;
    this.spawnBaby(def, a.sprite.x + (Math.random() * 2 - 1) * 16, a.sprite.y + 10, rare);
    this.burst(a.sprite.x, a.sprite.y - 8, 'p_star', { speed: { min: 20, max: 50 }, lifespan: 600, scale: { start: 0.8, end: 0 }, tint: rare ? 0xffe066 : 0xffc6e0 }, rare ? 9 : 5);
    this.addSkillXp('breeding', 8); // Breeding skill: a baby was born
    this.toast(rare ? `🌟 A rare ${def.name.toLowerCase()} was born!` : `🐣 A baby ${def.name.toLowerCase()} was born!`);
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
    this.addSkillXp('breeding', 12); // Breeding skill: a baby matured
    this.toast(`✨ A baby ${def.name.toLowerCase()} grew into an adult!`);
    this.emitState();
  }

  // ---- fishing ------------------------------------------------------------

  // Water (and where to fish) now comes from the authored map: every
  // `ground_tiles_water` cell is solid + in `pondTiles`. See buildFromMap.

  private isPondTile(tx: number, ty: number): boolean {
    return this.pondTiles.has(this.key(tx, ty));
  }

  // Click a water tile within reach → cast. Works on the inland pond and on the
  // surrounding ocean (cast from the beach). Returns true if the click was a
  // fishing attempt (so it doesn't fall through to the tool logic).
  private tryFish(tx: number, ty: number): boolean {
    const ocean = this.tileZone(tx, ty) === 'ocean';
    if (!this.isPondTile(tx, ty) && !ocean) return false;
    if (this.casting) return true; // a cast is already in progress; swallow the click
    if (!this.inRange(tx, ty)) {
      this.toast('🎣 Move closer to the water to cast.');
      return true;
    }
    this.startCast(tx, ty, ocean);
    return true;
  }

  // Kick off a cast: the FishingCast controller runs the rod/line/bobber
  // choreography (cast → bubbles → the bob you click); we resolve the catch
  // when it reports a successful hook. The open sea pulls a richer pool.
  private startCast(tx: number, ty: number, ocean = false) {
    if (this.casting) return;
    this.casting = true;
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    // Face the water for the cast.
    this.facing =
      Math.abs(cx - this.player.x) > Math.abs(cy - this.player.y)
        ? cx < this.player.x ? 'left' : 'right'
        : cy < this.player.y ? 'up' : 'down';

    // Rod-tip offset per facing — the player visibly holds the rod, so the line
    // emanates from roughly the rod tip rather than dead-centre. Tunable.
    const tip: Record<Dir, { x: number; y: number }> = {
      down: { x: 6, y: -2 }, up: { x: -6, y: -18 }, left: { x: -14, y: -10 }, right: { x: 14, y: -10 },
    };
    const m = this.mods();
    this.fishingCast.begin({
      origin: () => ({ x: this.player.x + tip[this.facing].x, y: this.player.y + tip[this.facing].y }),
      target: { x: cx, y: cy },
      biteDelayMult: 1 / Math.max(0.2, m.fishBiteSpeedMult), // Quick Bite shortens the wait
      hookWindowMult: m.fishHookWindowMult, // Steady Hands widens the click window
      onPhase: (phase) => this.playCastAnim(phase),
      onResolve: (o) => {
        if (o.hooked) {
          this.landCatch(o.at.x, o.at.y, ocean);
        } else if (o.reason === 'early') {
          this.toast('🎣 Reeled in early — nothing was biting yet.');
        } else {
          this.toast('🎣 It got away! Click the moment it bites.');
        }
        this.casting = false;
        // Return the player from the cast pose to the normal idle on their skin.
        this.player.setFlipX(false);
        this.player.setTexture(this.playerSheet(), 0);
        this.player.anims.play(`${this.playerSheet()}-idle-${this.facing}`, true);
        this.emitState();
      },
    });
  }

  // Map a FishingCast phase to the player's casting animation. The cast sheets
  // are a separate (non-recoloured) base cat; on a non-default coat the cast
  // briefly shows the cream coat — acceptable for the scaffold. left/right share
  // the side sheet via flipX.
  private playCastAnim(phase: CastPhase) {
    const dir = this.facing;
    const flip = dir === 'right';
    const play = (key: string) => {
      if (this.anims.exists(key)) {
        this.player.setFlipX(flip);
        this.player.anims.play(key, true);
      }
    };
    switch (phase) {
      case 'casting': play(`pfish-cast-${dir}`); break;
      case 'waiting':
      case 'ready': play(`pfish-wait-${dir}`); break;
      case 'reeling': play(`pfish-reel-${dir}`); break;
      // 'bite' keeps the waiting hold — the bobber dunk + "!" is the cue.
    }
  }

  // Roll what's actually on the line and present it. Treasure Hunter can swap
  // the fish for a treasure; the Legendary Angler capstone can land a huge haul.
  private landCatch(cx: number, cy: number, ocean: boolean) {
    const m = this.mods();
    const oceanValue = ocean ? 1.3 : 1;
    const oceanLuck = ocean ? 1.25 : 1;

    if (Math.random() < m.treasureChance) {
      const coins = Math.round(Phaser.Math.Between(200, 1200) * oceanValue);
      this.coins += coins;
      this.earned += coins;
      this.fishPts += Math.max(1, Math.round(3 * m.fishPtMult)); // treasure funds the Angler's Tree
      this.addSkillXp('fishing', 12);
      sfx.play('achievement');
      const frame = TREASURE_FRAMES[Math.floor(Math.random() * TREASURE_FRAMES.length)];
      this.popCatch(cx, cy, frame, 0xffd21a, true);
      this.floatText(cx, cy - 50, '💰 Treasure!', '#ffd21a');
      this.toast(`💰 Treasure! +${coins}🪙`);
      this.checkAchievements();
      return;
    }

    const water: WaterKind = ocean ? 'salt' : 'fresh';
    const f = catchFish(m.fishLuckMult * oceanLuck, water);
    // Legendary Angler capstone: ~3% of catches are a huge legendary haul.
    const legendary = m.legendaryFish && Math.random() < 0.03;
    // Double Catch (Angler's Tree): land two at once.
    const doubled = Math.random() < m.fishDoubleCatchChance;
    const baseValue = legendary ? f.value * 12 : f.value;
    const coins = Math.round(baseValue * m.fishValueMult * oceanValue) * (doubled ? 2 : 1);
    this.coins += coins;
    this.earned += coins;
    // Fishing points fund the Angler's Tree — rarer fish (and doubles) pay more.
    let pts = fishPointsForCatch(f.rarity) + (legendary ? 5 : 0);
    if (doubled) pts *= 2;
    this.fishPts += Math.max(1, Math.round(pts * m.fishPtMult));
    this.addSkillXp('fishing', legendary ? fishXp(f) * 3 : fishXp(f));
    sfx.play(legendary ? 'achievement' : 'sell');
    this.popCatch(cx, cy, f.frame, fishColor(f), legendary);
    if (doubled) this.floatText(cx + 14, cy - 30, '×2!', '#7bd0ff');
    if (legendary) {
      this.floatText(cx, cy - 50, '🌟 LEGENDARY!', '#ffd21a');
      this.toast(`🌟 LEGENDARY ${f.name}!${doubled ? ' ×2!' : ''} +${coins}🪙`);
    } else if (doubled) {
      this.floatText(cx, cy - 46, f.rarity, fishCss(f));
      this.toast(`🎣 Double catch — ${f.name} ×2 (${f.rarity})! +${coins}🪙`);
    } else {
      this.floatText(cx, cy - 46, f.rarity, fishCss(f));
      this.toast(`🎣 Caught a ${f.name} (${f.rarity})! +${coins}🪙`);
    }
    this.checkAchievements();
  }

  // The catch popup: the real Fish-Sheet sprite arcs up out of the water with a
  // rarity-tinted sparkle.
  private popCatch(cx: number, cy: number, frame: number, glow: number, special: boolean) {
    const sprite = this.add
      .image(cx, cy - 6, FISH_SHEET, frame)
      .setDepth(99990)
      .setScale(special ? 2.2 : 1.8);
    this.tweens.add({
      targets: sprite, y: cy - 40, scale: special ? 2.8 : 2.2, duration: 700, ease: 'Back.out',
      onComplete: () =>
        this.tweens.add({ targets: sprite, alpha: 0, y: cy - 56, duration: 500, onComplete: () => sprite.destroy() }),
    });
    this.burst(cx, cy - 4, special ? 'p_star' : 'p_droplet', {
      speed: { min: 40, max: 110 }, angle: { min: 220, max: 320 }, lifespan: 600,
      scale: { start: 1.4, end: 0 }, gravityY: special ? 0 : 240,
      tint: special ? [0xffe066, 0xffd21a, 0xffffff] : [glow, 0xffffff],
    }, special ? 16 : 10);
  }

  // ---- foraging -----------------------------------------------------------

  // True if a tile is open grass suitable for a forage node: an authored grass
  // Ground cell that isn't an obstacle/structure, water, a farm/dirt tile or a
  // path, and is free of crops. (Keeps nodes on the playable island, not the
  // surrounding open sea.)
  private isOpenGrass(tx: number, ty: number): boolean {
    const k = this.key(tx, ty);
    return (
      this.inBounds(tx, ty) &&
      !!this.ground[ty]?.[tx] && // there is an authored ground tile here
      !this.tiles[ty][tx].obstacle &&
      !this.isPondTile(tx, ty) &&
      !this.farmTiles.has(k) &&
      !this.pathTiles.has(k) &&
      !this.crops.has(k)
    );
  }

  // Find a random open-grass tile not already holding a forage node.
  private randomForageSpot(): { tx: number; ty: number } | null {
    for (let guard = 0; guard < 400; guard++) {
      const tx = Phaser.Math.Between(1, GRID_W - 2);
      const ty = Phaser.Math.Between(1, GRID_H - 2);
      if (!this.isOpenGrass(tx, ty)) continue;
      if (this.forageNodes.some((n) => n.tx === tx && n.ty === ty)) continue;
      return { tx, ty };
    }
    return null;
  }

  // Scatter the initial forage nodes around the open world.
  private spawnForageNodes(count: number) {
    for (let i = 0; i < count; i++) this.spawnForageNode();
  }

  private spawnForageNode() {
    const spot = this.randomForageSpot();
    if (!spot) return;
    const forage = pickForage(this.mods().forageLuckMult);
    const cx = spot.tx * TILE + TILE / 2;
    const cy = spot.ty * TILE + TILE / 2;
    const sprite = this.add
      .image(cx, cy, forage.sheet, forage.frame)
      .setScale(2)
      .setDepth(this.cropDepth(spot.ty));
    // A soft glow halo so the node reads as collectible, plus a gentle sway.
    const glow = this.add
      .image(cx, cy - 2, 'glow')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(Phaser.Display.Color.HexStringToColor(forage.css).color)
      .setScale(0.5)
      .setAlpha(0.4)
      .setDepth(this.cropDepth(spot.ty) - 1);
    this.tweens.add({ targets: glow, alpha: 0.7, scale: 0.62, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.tweens.add({ targets: sprite, angle: { from: -4, to: 4 }, duration: 1600 + Math.random() * 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    // Stash the glow on the sprite so we can tear both down together.
    (sprite as Phaser.GameObjects.Image & { _glow?: Phaser.GameObjects.Image })._glow = glow;
    this.forageNodes.push({ forage, tx: spot.tx, ty: spot.ty, sprite });
  }

  // Click a forage node within reach → gather it. Returns true if a node was
  // clicked (so the tool logic is skipped). The node respawns elsewhere later.
  private tryForage(wx: number, wy: number): boolean {
    for (let i = 0; i < this.forageNodes.length; i++) {
      const n = this.forageNodes[i];
      if (Phaser.Math.Distance.Between(wx, wy, n.sprite.x, n.sprite.y) >= 26) continue;
      if (!this.inRange(n.tx, n.ty)) {
        this.toast('🍄 Move closer to gather that.');
        return true;
      }
      const m = this.mods();
      const cx = n.sprite.x;
      const cy = n.sprite.y;
      let coins = Math.round(n.forage.value * m.forageValueMult);
      // Forest Spirit: a chance the find is a valuable gem instead.
      const gem = Math.random() < m.gemChance;
      if (gem) {
        coins += Phaser.Math.Between(400, 1500);
        this.floatText(cx, cy - 20, '💎 Gem!', '#7be6ff');
        this.burst(cx, cy - 6, 'p_star', { speed: { min: 40, max: 110 }, lifespan: 800, scale: { start: 1.3, end: 0 }, tint: [0x7be6ff, 0xb56bff, 0xffffff] }, 14);
      }
      this.coins += coins;
      this.earned += coins;
      this.addSkillXp('foraging', forageXp(n.forage));
      sfx.play(gem ? 'achievement' : 'sell');
      this.burst(cx, cy - 6, 'p_star', {
        speed: { min: 30, max: 90 }, lifespan: 700, scale: { start: 1, end: 0 },
        tint: Phaser.Display.Color.HexStringToColor(n.forage.css).color,
      }, 9);
      this.toast(gem ? `💎 Found a gem while foraging! +${coins}🪙` : `🍄 Foraged ${n.forage.name}! +${coins}🪙`);
      const glow = (n.sprite as Phaser.GameObjects.Image & { _glow?: Phaser.GameObjects.Image })._glow;
      glow?.destroy();
      n.sprite.destroy();
      this.forageNodes.splice(i, 1);
      this.checkAchievements();
      this.emitState();
      // Respawn a fresh node somewhere open after a short delay (Botanist/Quick
      // Hands shorten this).
      const respawn = m.forageRespawnMult > 0 ? 1 / m.forageRespawnMult : 1;
      this.time.delayedCall(Math.round(Phaser.Math.Between(45_000, 90_000) * respawn), () => this.spawnForageNode());
      return true;
    }
    return false;
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
      skills: this.skills,
      perks: this.perks,
      fishNodes: [...this.fishNodes],
      fishPts: this.fishPts,
      skin: this.skin,
      ownedSkins: [...this.ownedSkins],
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
    this.skills = { ...EMPTY_SKILLS, ...(data.skills ?? {}) };
    this.perks = { ...EMPTY_PERKS, ...(data.perks ?? {}) };
    this.fishNodes = new Set(data.fishNodes ?? []);
    this.fishPts = data.fishPts ?? 0;
    this.ownedSkins = new Set([DEFAULT_SKIN, ...(data.ownedSkins ?? [])]);
    this.skin = this.ownedSkins.has(data.skin) ? data.skin : DEFAULT_SKIN;
    this.recomputeMods(); // restored skills/perks change the modifier bag
    this.animalCounts = data.animals ?? {};
    for (const [type, count] of Object.entries(this.animalCounts)) {
      const adef = ANIMAL_BY_ID[type];
      if (!adef) continue;
      const area = this.producerArea(adef);
      for (let i = 0; i < count; i++) {
        this.spawnAnimal(
          adef,
          Phaser.Math.Between(area.x0 + 34, area.x1 - 34),
          Phaser.Math.Between(area.y0 + 40, area.y1 - 30),
        );
      }
    }

    for (const [x, y, wetRemaining] of data.tiles ?? []) {
      // Drop tilled tiles saved outside the map's farmable cells so a save never
      // leaves stray dirt patches off the authored farm.
      if (!this.inBounds(x, y) || this.tiles[y][x].obstacle || !this.isFarmable(x, y)) continue;
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
      // Likewise ignore crops saved outside the map's farmable cells.
      if (!plant || !this.inBounds(c.x, c.y) || !this.isFarmable(c.x, c.y)) continue;
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
      skills: { ...this.skills },
      perks: { ...this.perks },
      fishTree: { unlocked: [...this.fishNodes], pts: this.fishPts },
      skin: this.skin,
      ownedSkins: [...this.ownedSkins],
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
    // Keep the rod + line tracking the player and the bobber (no-op when idle).
    this.fishingCast.update();

    // movement — locked while a cast is in progress so the line stays anchored.
    let vx = 0;
    let vy = 0;
    if (!this.casting) {
      if (this.cursors.left.isDown || this.wasd.left.isDown) vx = -1;
      else if (this.cursors.right.isDown || this.wasd.right.isDown) vx = 1;
      if (this.cursors.up.isDown || this.wasd.up.isDown) vy = -1;
      else if (this.cursors.down.isDown || this.wasd.down.isDown) vy = 1;
    }
    const len = Math.hypot(vx, vy) || 1;
    this.player.setVelocity((vx / len) * PLAYER_SPEED, (vy / len) * PLAYER_SPEED);
    if (this.casting) {
      // The cast animation is driven by the FishingCast phase callback; don't
      // let walk/idle override it while a cast is in progress.
    } else if (vx !== 0 || vy !== 0) {
      this.actingUntil = 0; // moving cancels the tool pose
      if (vx < 0) this.facing = 'left';
      else if (vx > 0) this.facing = 'right';
      else this.facing = vy < 0 ? 'up' : 'down';
      this.player.anims.play(`${this.playerSheet()}-walk-${this.facing}`, true);
    } else if (time < this.actingUntil) {
      // let the tool-use animation play out
    } else {
      this.player.anims.play(`${this.playerSheet()}-idle-${this.facing}`, true);
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

    // Boat = future marketplace hub. No scene change yet — just a one-time hint
    // the first time the player stands next to the rowboat.
    if (!this.boatToastShown && this.boatTiles.size) {
      const ptx = Math.floor(this.player.x / TILE);
      const pty = Math.floor(this.player.y / TILE);
      let adjacent = false;
      for (let dy = -1; dy <= 1 && !adjacent; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (this.boatTiles.has(this.key(ptx + dx, pty + dy))) { adjacent = true; break; }
        }
      }
      if (adjacent) {
        this.boatToastShown = true;
        this.toast('⛵ Marketplace — coming soon!');
      }
    }

    this.updateAnimals(time);

    // crop growth
    for (const crop of this.crops.values()) {
      if (crop.mature) continue;
      const wet = this.isWet(crop.tx, crop.ty);
      crop.grownMs += delta * (wet ? 2 : 1) * this.growthMult * growthFactor(this.upgrades.growth) * this.mods().cropGrowthMult;
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
      const canFarm = this.inRange(tx, ty) && this.isFarmable(tx, ty);
      this.highlight
        .setVisible(true)
        .setPosition(tx * TILE + TILE / 2, ty * TILE + TILE / 2)
        .setTint(canFarm ? 0xffffff : 0xff5555);
    } else {
      this.highlight.setVisible(false);
    }
  }
}
