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
  GROWTH_TIME_SCALE,
} from '../constants';
import {
  PLANTS,
  PLANT_BY_ID,
  RARITY,
  rarityRank,
  pickMutation,
  cropValue,
  stackKey,
  rollShopAt,
  rollQuality,
  QUALITY,
  MUTATION_BY_ID,
  type Plant,
  type Mutation,
  type Quality,
} from '../economy';
import {
  ACHIEVEMENTS,
  EMPTY_UPGRADES,
  EMPTY_UPGRADE_FORKS,
  UPGRADE_BY_ID,
  fortuneLuck,
  growthFactor,
  harvestXp,
  levelInfo,
  marketBonus,
  MAX_GROWTH_MULT,
  seedDiscount,
  sprinklerIntervalMs,
  toolRadius,
  upgradeUnlocked,
  upgradeForkAvailable,
  forkEffect,
  type UpgradeId,
  type Upgrades,
  type UpgradeForks,
} from '../progression';
import { collectionBonus } from '../collection';
import { GOALS, rewardLabel, type GoalStats } from '../goals';
import { fetchShopBought, buySeedRemote } from '../../chain/shopSync';
import { ANIMAL_BY_ID, ANIMALS, type AnimalDef } from '../animals';
import {
  HOME,
  HOMESTEADS,
  SHORE,
  BEACH,
  bandRect,
  PLAZA,
  homesteadPlot,
  isInPlot,
  homesteadGateTile,
  plazaCenterTile,
  MAX_PLOT_EXPANSION,
  plotExpansionCost,
  type Homestead,
  type Rect,
  type PlotRect,
} from '../plots';
import {
  EMPTY_SKILLS,
  EMPTY_PERKS,
  skillLevel,
  activeModifiers,
  PERK_LEVELS,
  MAX_SKILL_LEVEL,
  respecCost,
  type SkillId,
  type Skills,
  type ChosenPerks,
  type Modifiers,
  SKILL_BY_ID,
} from '../skills';
import { catchFish, fishXp } from '../fishing';
import { pickForage, forageXp, type Forage } from '../forage';
import { bus, type GameEvents } from '../EventBus';
import { sfx } from '../audio';
import { virtualMove, getKeyBinds, onKeyBindsChange, type MoveAction } from '../input';

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
  quality: Quality;
  matureAt: number; // this.time.now (ms) when the crop became ripe
  withered: boolean;
  // ms this cycle takes to ripen. Defaults to plant.growthSeconds*1000; after a
  // regrow harvest it becomes plant.regrow*1000 so the next cycle is shorter.
  growMs?: number;
  sprite: Phaser.GameObjects.Image;
  glow?: Phaser.GameObjects.Image;
  sparkle?: Phaser.GameObjects.Particles.ParticleEmitter;
  star?: Phaser.GameObjects.Text; // quality star marker on high-quality ripe crops
};
type Dir = 'down' | 'up' | 'left' | 'right';

// A remote player's avatar: the shared 'pchar' sprite (animated exactly like the
// local player), a floating name label, and the target pose we lerp toward each
// frame as `mp:move` updates stream in.
type RemotePlayer = {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  facing: Dir;
  name: string;
};

// A single remote crop drawn in another player's plot. Visual only — it reuses
// the same 'cropsheet' texture/frames + mutation glow/sparkle as a local crop,
// but never touches this.crops / this.tiles. `key` is its plot-relative "dx,dy".
//
// Growth is SIMULATED locally for smoothness: each snapshot carries the crop's
// authoritative grownMs/growMs, and between snapshots we advance grownMs at the
// base rate (a safe LOWER bound — real growth is ≥1×, so we never overshoot)
// and only re-render when the visual stage actually changes.
type RemoteCropSprite = {
  sprite: Phaser.GameObjects.Image;
  glow?: Phaser.GameObjects.Image;
  sparkle?: Phaser.GameObjects.Particles.ParticleEmitter;
  plant: Plant;
  tx: number; ty: number; // world tile (drives glow/sparkle placement)
  mutId: string;
  grownMs: number; // simulated growth so far (corrected on each snapshot)
  growMs: number; // total grow duration for the current cycle (0 = unknown)
  mature: boolean;
  stage: number; // last-rendered visual stage (0..STAGES-1)
};

// One remote player's whole farm: which plot they're on + their crop sprites and
// tilled-soil images, both keyed by plot-relative "dx,dy" so snapshots can be
// diffed in place. `tilled` images are pure visuals (they mirror local soil
// overlays) drawn below the crop sprites; they never touch this.tiles.
type RemoteFarm = {
  plot: number;
  sprites: Map<string, RemoteCropSprite>;
  tilled: Map<string, Phaser.GameObjects.Image>;
};

// The player's two animal pens + orchard in *pixel* coords (derived from HOME).
// These drive where bought/bred animals spawn and how far they may wander.
// Chickens roam the chicken pen, cows the cow pasture, fruit trees the orchard.
const px = (r: Rect) => ({ x0: r.x0 * TILE, y0: r.y0 * TILE, x1: (r.x1 + 1) * TILE, y1: (r.y1 + 1) * TILE });
const CHICKEN_PEN = px(HOME.chickenPen);
const COW_PEN = px(HOME.cowPen);
const ORCHARD = px(HOME.orchard);

// Translate a stored bind (a raw keyboard event.key, e.g. 'W', 'ArrowUp', ' ')
// into a name Phaser's keyboard.addKey() understands. Single letters/digits and
// Phaser-style names pass through; a few common event.key values are remapped.
const KEY_NAME_ALIASES: Record<string, string> = {
  ARROWUP: 'UP',
  ARROWDOWN: 'DOWN',
  ARROWLEFT: 'LEFT',
  ARROWRIGHT: 'RIGHT',
  ' ': 'SPACE',
  SPACEBAR: 'SPACE',
  ESC: 'ESC',
  ESCAPE: 'ESC',
};
function mapKeyName(key: string): string | null {
  if (!key) return null;
  const upper = key.toUpperCase();
  return KEY_NAME_ALIASES[upper] ?? upper;
}

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
const SAVE_VERSION = 16; // bumped: added claimedGoals (rewarded goal-ladder); defaults preserve older saves (legacy saves retro-claim satisfied goals without payout)

// Max global XP a single watering action can grant (1 per newly-wet tile), so a
// large watering/sprinkler radius can't be spammed into a big XP payout.
const WATER_XP_CAP = 5;

// Extra mutation-luck multiplier applied at maturity when the tile is wet — a
// small nudge on top of the Fortune upgrade + Farming skill luck.
const WET_MUTATION_LUCK = 1.12;

// A gatherable forage node sitting on open grass.
type ForageNode = {
  forage: Forage;
  tx: number;
  ty: number;
  sprite: Phaser.GameObjects.Image;
};

type SaveData = {
  v: number;
  // When truthy, tiles[]/crops[] coords are stored RELATIVE to the owned
  // farm-bed origin (top-left tile) rather than as absolute world tiles, so the
  // farm renders correctly on whichever plot the player is assigned (multiplayer
  // plot recycling). Absent/falsy ⇒ legacy absolute save (migrated on load).
  rel?: number;
  coins: number;
  selected: string;
  selectedSeed: string | null;
  seeds: Record<string, number>;
  harvest: Record<string, number>;
  // shopStock/restockMs removed in v16+: the shop is now a shared, deterministic
  // per-(island, wall-clock window) roll, so there's nothing per-player to save.
  timeMs: number;
  tiles: Array<[number, number, number]>; // x, y, wetRemainingMs (tilled implied)
  // q/ma/wth/rg are optional so old v11 saves (without crop-depth fields) still
  // load. rg = regrow-cycle growth duration (ms) when the crop is mid-regrow.
  crops: Array<{ x: number; y: number; p: string; g: number; m: boolean; mut: string | null; wet: boolean; q?: Quality; ma?: number; wth?: boolean; rg?: number }>;
  // progression
  xp: number;
  upgrades: Upgrades;
  upgradeForks?: UpgradeForks; // v13+: chosen maxed-upgrade forks. Optional so older saves still load.
  earned: number;
  harvested: number;
  mutationsFound: number;
  discPlants: string[];
  discMutations: string[];
  achievements: string[];
  claimedGoals?: string[]; // v16+: rewarded goal-ladder ids already paid out. Optional so older saves migrate.
  animals: Record<string, number>;
  skills: Skills;
  perks: ChosenPerks;
  respecs?: number; // v12+: perk respecs done. Optional so older saves still load.
  plotExpansion?: number; // v14+: purchased crop-bed expansion columns. Optional so older saves default to 0.
  // v15+: where the player was standing (rounded world pixels) and which homestead
  // they owned, so a refresh/reconnect restores position + plot instead of yanking
  // them to the create() spawn. Optional so older saves default cleanly.
  px?: number;
  py?: number;
  plotIndex?: number;
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
  // Remappable movement keys, rebuilt from getKeyBinds() whenever binds change.
  private moveKeys: Partial<Record<MoveAction, Phaser.Input.Keyboard.Key>> = {};
  // Gamepad face/dpad button states from the previous frame (edge detection so a
  // held button fires its action once, not every frame).
  private padPrev: Record<number, boolean> = {};
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
  // ---- shared island seed shop -------------------------------------------
  // The stock is shared by everyone on the island: a deterministic per-(island,
  // window) roll (identical for all peers) scaled by the online player count,
  // drained by everyone's purchases. `shopBought` tracks units taken this window
  // (local + peers via mp:shopBought); remaining = pool − bought.
  private island = 0;
  private onlineCount = 1;
  private shopEpoch = 0;
  private shopPool: Record<string, number> = {};
  private shopBought: Record<string, number> = {};
  private shopSyncMs = 0; // accumulator for the periodic authoritative DB reconcile
  // Plots (other players') we've tinted as cultivated, so we can un-tint them when
  // that player leaves. Our own plot is handled separately by markPlayerFarm.
  private remotePlotTints = new Set<number>();

  // progression
  private xp = 0;
  private upgrades: Upgrades = { ...EMPTY_UPGRADES };
  // Chosen maxed-upgrade specializations (upgrade id -> fork id). See progression.ts.
  private upgradeForks: UpgradeForks = { ...EMPTY_UPGRADE_FORKS };
  private earned = 0;
  private harvested = 0;
  private mutationsFound = 0;
  private discoveredPlants = new Set<string>();
  private discoveredMutations = new Set<string>();
  private achievements = new Set<string>();
  // Rewarded goal-ladder ids already paid out (see game/goals.ts). One-time.
  private claimedGoals = new Set<string>();
  private animals: Animal[] = [];
  private gate?: Phaser.GameObjects.Sprite;
  private gateOpen = false;
  private animalCounts: Record<string, number> = {};

  // skill progression (xp per skill) + chosen milestone perks
  private skills: Skills = { ...EMPTY_SKILLS };
  private perks: ChosenPerks = { ...EMPTY_PERKS };
  private respecs = 0; // number of perk respecs done (drives the escalating respec cost)
  // Purchased crop-bed expansion: how many extra columns (0..MAX_PLOT_EXPANSION)
  // have been bought. These widen the farmable area to the RIGHT of the base bed
  // into the free interior band (see plots.ts). Expressed relative to
  // myFarmRect() so it follows a multiplayer plot re-assignment.
  private plotExpansion = 0;
  // Aggregated multipliers/flags from skills + perks; recomputed on any change.
  private modCache: Modifiers = activeModifiers(this.skills, this.perks);

  // fishing
  private pond!: Rect; // pond rect in tile coords (inclusive)
  private pondTiles = new Set<string>(); // fast "is this a water tile" lookup
  private pathTiles = new Set<string>(); // cobble/dirt path tiles (kept clear of scatter)
  private casting = false; // only one cast at a time
  // foraging
  private forageNodes: ForageNode[] = [];

  private timeMs = DAY_LENGTH_MS * 0.34; // start mid-morning
  private growthMult = 1;
  private forcedMutation: Mutation | null = null;
  private persist = true;
  private unsubs: Array<() => void> = [];

  // ---- multiplayer ----------------------------------------------------------
  // Which homestead the local player owns/farms. Defaults to #0 (single-player);
  // a `mp:assigned` event re-points it to the server-assigned plot.
  private myPlotIndex = 0;
  // Our own wallet id once assigned, so the presence roster can exclude us when
  // spawning remote avatars (the roster includes ourselves).
  private myMpId: string | null = null;
  // id -> remote avatar. Visual only (no collision); spawned from the presence
  // roster and updated on `mp:move`.
  private remotePlayers = new Map<string, RemotePlayer>();
  // id -> remote player's farm (their crops, drawn in their own plot). Visual
  // only; upserted on `mp:remoteFarm`, diffed in place, cleaned up on leave.
  private remoteFarms = new Map<string, RemoteFarm>();
  // True once the server has assigned us a plot (we're in a live session). Gates
  // the local-crop snapshot broadcast so single-player never emits.
  private mpConnected = false;
  // Throttle for the periodic local-crop snapshot heartbeat (see update()).
  private lastFarmEmit = 0;
  // Set when a change (plant/harvest) wants the next heartbeat to fire ASAP, so
  // edits feel responsive without rebuilding the snapshot every frame.
  private farmDirty = false;
  // Last pose we broadcast, so `mp:self` only fires on change + throttled.
  private lastSelfPose = { x: 0, y: 0, facing: 'down' as Dir };
  private lastSelfEmit = 0;
  // The Roblox-style "go to your plot" guide: dashed ground markers + a bouncing
  // arrow over the player. Null when not connected / already arrived.
  private guide: {
    markers: Phaser.GameObjects.Image[];
    arrow: Phaser.GameObjects.Text;
    gx: number; // gate pixel target
    gy: number;
  } | null = null;

  constructor() {
    super('Farm');
  }

  create() {
    this.applyDevParams();

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.obstacles = this.physics.add.staticGroup();
    this.createAnims();
    this.buildWorld();
    this.buildTerraces(); // raise the two plot bands into plateaus (cliffs + stairs)
    this.buildPlaza(); // sunken valley floor: cobble paths, pond + bridge, markets
    this.buildPlots(); // fenced homesteads; fences open toward the central plaza
    this.placeDecorations(); // scatter nature across the remaining open grass

    const spawn = this.myFarmRect();
    this.player = this.physics.add.sprite(
      (spawn.px + spawn.pw / 2) * TILE,
      (spawn.py + spawn.ph - 1) * TILE,
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
    // Build the remappable movement keys now, and rebuild them live whenever the
    // bindings change (arrow keys via this.cursors always work in addition).
    this.buildMoveKeys();
    const unsubBinds = onKeyBindsChange(() => this.buildMoveKeys());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubBinds);
    ['ONE', 'TWO', 'THREE'].forEach((key, i) => {
      kb.on(`keydown-${key}`, () => this.setTool((['hoe', 'can', 'seed'] as const)[i]));
    });

    // Browsers suspend audio until a user gesture; resume on first input.
    this.input.once('pointerdown', () => sfx.resume());
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
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

    this.rollShopWindow(this.currentEpoch());
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
      bus.on('ui:chooseUpgradeFork', ({ id, fork }) => this.chooseUpgradeFork(id, fork)),
      bus.on('ui:buyAnimal', (id) => this.buyAnimal(id)),
      bus.on('ui:buyExpansion', () => this.buyExpansion()),
      bus.on('ui:choosePerk', ({ skill, level, perk }) => this.choosePerk(skill, level, perk)),
      bus.on('ui:respecPerks', () => this.respecPerks()),
      // ---- multiplayer (no-ops in single-player: these never fire) ----------
      bus.on('mp:assigned', ({ id, island, plot }) => { this.myMpId = id; this.island = island; this.onAssigned(plot); this.rollShopWindow(this.currentEpoch()); }),
      bus.on('mp:roster', (players) => this.onRoster(players)),
      bus.on('mp:move', (m) => this.onRemoteMove(m)),
      bus.on('mp:leave', ({ id }) => this.removeRemote(id)),
      bus.on('mp:remoteFarm', (f) => this.onRemoteFarm(f)),
      bus.on('mp:shopBought', ({ plantId }) => this.onRemoteShopBuy(plantId)),
    );
    // Tear down every remote avatar + remote farm + the ground guide on shutdown.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.remotePlayers.forEach((rp) => { rp.sprite.destroy(); rp.label.destroy(); });
      this.remotePlayers.clear();
      this.remoteFarms.forEach((_, id) => this.removeRemoteFarm(id));
      this.remoteFarms.clear();
      this.clearGuide();
    });
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

  // Aggregated skill/perk modifiers. Cheap to read (returns the cached bag);
  // recomputed whenever skills or perks change (see recomputeMods).
  private mods(): Modifiers {
    return this.modCache;
  }

  private recomputeMods() {
    this.modCache = activeModifiers(this.skills, this.perks);
  }

  // Active fork-effect bag for a maxed upgrade (neutral defaults if unchosen/no
  // fork). Effect sites read named fields off this (see progression.forkEffect).
  private fork(id: UpgradeId) {
    return forkEffect(id, this.upgradeForks);
  }

  // ---- owned-plot geometry (driven by myPlotIndex) ------------------------
  // The player's current crop-bed rect (origin + size in tiles). Everything that
  // used the old MY_PLOT constant reads this so it follows a multiplayer
  // assignment. Defaults to homestead #0 in single-player.
  private myFarmRect(): PlotRect {
    return homesteadPlot(this.myPlotIndex);
  }

  // The full farmable crop-bed rect: the base bed widened by however many
  // expansion columns have been purchased. Expansion grows to the RIGHT (into
  // the free interior band between the bed and the pens), so only `pw` changes.
  // Everything farm-related (tilling, overlays, persistence) reads THIS so the
  // expansion is automatically relative to whichever plot we own (multiplayer).
  private expandedFarmRect(): PlotRect {
    const f = this.myFarmRect();
    const extra = Math.max(0, Math.min(MAX_PLOT_EXPANSION, this.plotExpansion));
    return { px: f.px, py: f.py, pw: f.pw + extra, ph: f.ph };
  }

  // True for any farmable tile (base bed OR a purchased expansion column).
  private isInMyFarm(tx: number, ty: number): boolean {
    return isInPlot(this.expandedFarmRect(), tx, ty);
  }

  // The walkable gate tile of the player's current homestead.
  private myGateTile(): { tx: number; ty: number } {
    return homesteadGateTile(this.myPlotIndex);
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
  // ordered down/up/RIGHT/LEFT in the sheet (same order as the tool rows below).
  // First frame of each idle row doubles as the standing pose.
  private static IDLE_ROW: Record<Dir, number> = { down: 0, up: 8, left: 24, right: 16 };
  private static WALK_ROW: Record<Dir, number> = { down: 32, up: 40, left: 56, right: 48 };
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

  // Smooth low-frequency field (≈0..1) carving organic grass zones across the map.
  private grassZone(x: number, y: number): number {
    const n =
      Math.sin(x * 0.16 + y * 0.06) * 0.5 +
      Math.sin(x * 0.05 - y * 0.12) * 0.3 +
      Math.sin((x + y) * 0.1 + 1.7) * 0.2;
    return (n + 1) / 2;
  }

  // Pick the ground tile for an open grass cell: cooler sage patches in the
  // "low" zones (shaded areas), lush tuft-heavy meadow in the "high" zones, and
  // mostly-plain grass with the odd v2 detail tile everywhere else.
  private grassTileAt(x: number, y: number, cx: number, cy: number): Phaser.GameObjects.Image {
    const h = (x * 73856 + y * 19349) >>> 0;
    const v = this.grassZone(x, y);
    let key = 'grass';
    let frame: number = this.grassFrame(x, y);
    if (v < 0.32 || (v < 0.37 && h % 2 === 0)) {
      key = 'grassdark'; // sage shaded patch (dithered edge)
      frame = FarmScene.GRASS_DETAIL[h % FarmScene.GRASS_DETAIL.length];
    } else if (v > 0.7 && h % 100 < 50) {
      key = 'grasslayer'; // lush meadow tuft patch
      frame = FarmScene.GRASS_TUFTS[h % FarmScene.GRASS_TUFTS.length];
    } else if (h % 100 < 12) {
      key = 'grassv2'; // odd detail tile in plain grass
      frame = FarmScene.GRASS_DETAIL[h % FarmScene.GRASS_DETAIL.length];
    }
    return this.add.image(cx, cy, key, frame).setScale(2).setDepth(0);
  }

  // Solid tilled-dirt tiles (premium Tilled_Dirt_v2 sheet, 11 cols) that tile
  // seamlessly into a filled plot; a few variants add subtle texture.
  private static TILLED_FRAMES = [55, 56, 57];
  // stonepath.png frames that carry a nice pebble cluster (scattered on paths).
  private static PEBBLES = [0, 4, 5, 8, 9, 12, 13, 14, 15];
  // grassv2 flat detail tiles (tufts/moss/flowers) — weighted to subtle tufts &
  // moss over flowers; their green matches the base grass exactly.
  private static GRASS_DETAIL = [55, 56, 57, 58, 59, 66, 67, 68, 69, 70, 60, 71];
  // Just the leafy tuft frames (for lush "meadow" patches).
  private static GRASS_TUFTS = [55, 56, 57, 66, 67, 68];

  // Island layout: a tile is ocean near the very edge, then a sand beach, then
  // the playable grassy land where the homesteads sit.
  private tileZone(x: number, y: number): 'ocean' | 'beach' | 'land' {
    const d = Math.min(x, y, GRID_W - 1 - x, GRID_H - 1 - y);
    if (d < SHORE) return 'ocean';
    if (d < SHORE + BEACH) return 'beach';
    return 'land';
  }

  private buildWorld() {
    for (let y = 0; y < GRID_H; y++) {
      this.tiles[y] = [];
      this.ground[y] = [];
      this.overlay[y] = [];
      for (let x = 0; x < GRID_W; x++) {
        this.tiles[y][x] = { tilled: false, wetUntil: 0, obstacle: false };
        const cx = x * TILE + TILE / 2;
        const cy = y * TILE + TILE / 2;
        const d = Math.min(x, y, GRID_W - 1 - x, GRID_H - 1 - y);
        if (d < SHORE) {
          // Surrounding sea: draw nothing here so the animated water backdrop
          // shows through (one big living ocean). A wall along the inner shore
          // keeps the player on the island. (Invisible slot keeps the array dense.)
          this.ground[y][x] = this.add.image(cx, cy, 'pixel').setVisible(false);
          this.tiles[y][x].obstacle = true;
          if (d === SHORE - 1) this.addCollider(cx, cy, TILE, TILE);
        } else if (d < SHORE + BEACH) {
          this.ground[y][x] = this.add.image(cx, cy, 'sand').setScale(2).setDepth(0);
        } else {
          this.ground[y][x] = this.grassTileAt(x, y, cx, cy);
        }
        // Tilled-soil overlay only where the player can till (their own farm) —
      // avoids tens of thousands of invisible objects on the big valley map.
      if (this.isInMyFarm(x, y)) {
        this.overlay[y][x] = this.ensureOverlay(x, y);
      }
      }
    }
  }

  private solidTilledFrame(x: number, y: number): number {
    return FarmScene.TILLED_FRAMES[(x * 7 + y * 13) % 3];
  }

  // Raise each plot band into a grassy plateau using the premium "New tiles"
  // Grass_Hill_Tiles_v2 autotile (key 'hillv2', 11×7). We only draw the BORDER
  // ring — the raised grass exactly matches the base grass, so the interior stays
  // as-is. 9-slice: TL0 T1 TR2 / L11 C12 R13 / BL22 B23 BR24. The tall front cliff
  // lives on the band's BOTTOM edge; for the bottom band we mirror it (setFlipY)
  // so the cliff faces UP toward the sunken central plaza.
  private buildTerraces() {
    const PAD = 1; // plateau reaches one tile past the fences
    for (let row = 0; row < 2; row++) {
      const b = bandRect(row);
      const x0 = b.x0 - PAD, x1 = b.x1 + PAD, y0 = b.y0 - PAD, y1 = b.y1 + PAD;
      const fy = row === 1; // bottom band: mirror so the cliff faces UP
      const put = (tx: number, ty: number, frame: number) => {
        if (!this.inBounds(tx, ty)) return;
        this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'hillv2', frame)
          .setScale(2).setDepth(0.4).setFlipY(fy);
      };
      // When mirrored, the cliff edge (frames 22/23/24) belongs on the TOP row and
      // the soft back rim (0/1/2) on the bottom row.
      const topL = fy ? 22 : 0, topM = fy ? 23 : 1, topR = fy ? 24 : 2;
      const botL = fy ? 0 : 22, botM = fy ? 1 : 23, botR = fy ? 2 : 24;
      put(x0, y0, topL); put(x1, y0, topR);
      put(x0, y1, botL); put(x1, y1, botR);
      for (let x = x0 + 1; x <= x1 - 1; x++) { put(x, y0, topM); put(x, y1, botM); }
      for (let y = y0 + 1; y <= y1 - 1; y++) { put(x0, y, 11); put(x1, y, 13); }
      // a soft drop shadow on the plaza floor just past the plaza-facing cliff.
      const shY = fy ? y0 - 1 : y1 + 1;
      for (let x = x0; x <= x1; x++) {
        if (this.inBounds(x, shY)) {
          this.add.rectangle(x * TILE + TILE / 2, shY * TILE + TILE / 2, TILE, 8, 0x123018, 0.13).setDepth(0.42);
        }
      }
    }
  }

  private layPath(x: number, y: number) {
    if (!this.inBounds(x, y) || this.tiles[y][x].obstacle) return;
    const k = this.key(x, y);
    if (this.pondTiles.has(k) || this.pathTiles.has(k)) return;
    const cx = x * TILE + TILE / 2, cy = y * TILE + TILE / 2;
    // Keep the grass and just scatter the pack's loose pebbles on top, so the
    // route reads as a natural pebble trail rather than a hard dirt road.
    const n = (Math.random() < 0.8 ? 1 : 0) + (Math.random() < 0.45 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const f = FarmScene.PEBBLES[Math.floor(Math.random() * FarmScene.PEBBLES.length)];
      const ox = Phaser.Math.Between(-7, 7), oy = Phaser.Math.Between(-7, 7);
      this.add.image(cx + ox, cy + oy, 'stonepath', f).setScale(2).setDepth(0.55).setFlipX(Math.random() < 0.5);
    }
    this.pathTiles.add(k);
  }

  // The sunken valley floor: a cobble avenue with lanes up to every gate, a pond
  // crossed by a bridge, and a row of market stalls + cosy props.
  private buildPlaza() {
    const pz = PLAZA;
    const avY = Math.floor((pz.y0 + pz.y1) / 2) - 1; // avenue spans avY..avY+1
    const cx = Math.floor((pz.x0 + pz.x1) / 2);

    // An organic pond tucked into the valley floor (built first so paths avoid it).
    this.buildPond();

    // Pebble avenue across the whole valley.
    for (let y = avY; y <= avY + 1; y++)
      for (let x = pz.x0; x <= pz.x1; x++) this.layPath(x, y);
    // A lane from the player's gate to the avenue (neighbours open onto grass).
    for (const h of HOMESTEADS) {
      if (!h.mine) continue;
      const gx = Math.floor((h.interior.x0 + h.interior.x1) / 2);
      const a = h.openSide === 'S' ? h.interior.y1 + 1 : h.interior.y0 - 1;
      const lo = Math.min(a, avY), hi = Math.max(a, avY + 1);
      for (let y = lo; y <= hi; y++) { this.layPath(gx, y); this.layPath(gx - 1, y); }
    }

    this.buildMarkets(avY, cx);
  }

  private buildMarkets(avY: number, cx: number) {
    const prop = (tx: number, ty: number, key: string, frame?: number, scale = 2) => {
      if (!this.inBounds(tx, ty)) return;
      const px = tx * TILE + TILE / 2, py = ty * TILE + TILE;
      const img = frame === undefined ? this.add.image(px, py, key) : this.add.image(px, py, key, frame);
      img.setOrigin(0.5, 1).setScale(scale).setDepth(py);
      this.addCollider(px, py - 10, TILE, 14);
      return img;
    };
    // Well as a centrepiece beside the avenue.
    prop(cx + 4, avY - 1, 'well');
    // Market stalls: a counter flanked by a barrel + a crate, with a little sign.
    for (const sx of [cx - 4, cx + 12, cx + 20]) {
      prop(sx, avY - 1, 'furniture', 30); // table / counter
      prop(sx - 1, avY - 1, 'furniture', 24); // barrel
      prop(sx + 1, avY - 1, 'furniture', 25); // crate
      this.add.image(sx * TILE + TILE / 2, (avY - 1) * TILE + TILE, 'signs', 0).setOrigin(0.5, 1).setScale(2).setDepth((avY - 1) * TILE + 40);
    }
    // Cosy props below the avenue.
    prop(cx - 16, avY + 4, 'workstation');
    prop(cx + 16, avY + 5, 'chest', 0);
    // A picnic blanket (flat on the ground) with a basket.
    this.add.image((cx + 8) * TILE, (avY + 5) * TILE, 'picnic').setScale(2).setDepth((avY + 5) * TILE - 20);
    this.add.image((cx + 8) * TILE, (avY + 5) * TILE, 'basket').setOrigin(0.5, 1).setScale(2).setDepth((avY + 5) * TILE + 10);
  }

  // Refresh a tile and its 4 neighbours (their autotile edges depend on it).
  private refreshTile(x: number, y: number) {
    const around: Array<[number, number]> = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of around) if (this.inBounds(x + dx, y + dy)) this.setGroundTexture(x + dx, y + dy);
  }

  private placeDecorations() {
    // Scatter nature across the open grass — never on beach/ocean, inside a
    // homestead, on a path, or on water.
    const free = (tx: number, ty: number) =>
      this.inBounds(tx, ty) && !this.tiles[ty][tx].obstacle &&
      this.tileZone(tx, ty) === 'land' && !this.inAnyHomestead(tx, ty) &&
      !this.pathTiles.has(this.key(tx, ty)) && !this.pondTiles.has(this.key(tx, ty));

    const scatter = (n: number, tries: number, fn: (tx: number, ty: number) => void) => {
      let placed = 0, guard = 0;
      while (placed < n && guard++ < tries) {
        const tx = Phaser.Math.Between(1, GRID_W - 2), ty = Phaser.Math.Between(1, GRID_H - 2);
        if (!free(tx, ty)) continue;
        fn(tx, ty);
        placed++;
      }
    };

    // Flowers, bushes, sprouts & stumps from the biome sheet.
    const decoFrames = ['flower_y', 'flower_p', 'flower_p2', 'bush', 'bush2', 'sprout', 'stump'];
    let di = 0;
    scatter(150, 3000, (tx, ty) =>
      this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'biome', decoFrames[di++ % decoFrames.length]).setScale(2).setDepth(2));

    // Mushrooms, flowers & stones — a wide variety for a lush valley floor.
    const mfsFrames = [0, 1, 2, 3, 4, 5, 6, 12, 13, 15, 24, 25, 36, 37, 38, 39, 40, 48, 49, 52];
    let mi = 0;
    scatter(90, 2400, (tx, ty) =>
      this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'mfs', mfsFrames[mi++ % mfsFrames.length]).setScale(2).setDepth(3));

    // Berry bushes & shrubs (per-row depth so the player passes behind them).
    const bushFrames = [36, 37, 38, 39, 40, 48, 49, 50, 51];
    let bi = 0;
    scatter(56, 1600, (tx, ty) =>
      this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'nature', bushFrames[bi++ % bushFrames.length]).setScale(2).setDepth(ty * TILE + TILE));

    // Tree stumps & fallen logs for a foresty, lived-in feel.
    const logFrames = [72, 73, 74, 75, 76, 77];
    let li = 0;
    scatter(22, 900, (tx, ty) =>
      this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'nature', logFrames[li++ % logFrames.length]).setScale(2).setDepth(ty * TILE + TILE));

    // Swaying shade trees dotted across the open grass.
    const treeFrames = ['tree', 'tree_apple'];
    let ti = 0;
    scatter(30, 1600, (tx, ty) => {
      const cx = tx * TILE + TILE / 2;
      const baseY = ty * TILE + TILE;
      const tree = this.add
        .image(cx, baseY + 4, 'biome', treeFrames[ti++ % treeFrames.length])
        .setOrigin(0.5, 1).setScale(2).setDepth(baseY);
      this.tiles[ty][tx].obstacle = true;
      this.addCollider(cx, baseY - 4, 16, 12);
      this.tweens.add({
        targets: tree, angle: { from: -1.3, to: 1.3 },
        duration: 2200 + Math.random() * 800, delay: Math.random() * 1500,
        yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });
    });
  }

  // True if a tile sits inside any homestead's fenced footprint (fence ring incl.).
  private inAnyHomestead(tx: number, ty: number): boolean {
    for (const h of HOMESTEADS) {
      if (tx >= h.interior.x0 - 1 && tx <= h.interior.x1 + 1 && ty >= h.interior.y0 - 1 && ty <= h.interior.y1 + 1) return true;
    }
    return false;
  }

  private addCollider(cx: number, cy: number, w: number, h: number) {
    const box = this.obstacles.create(cx, cy, 'pixel') as Phaser.Physics.Arcade.Sprite;
    box.setVisible(false).setDisplaySize(w, h).refreshBody();
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
      // Make the fence solid (gaps were excluded above, so gates stay walkable).
      this.tiles[y][x].obstacle = true;
      this.addCollider(cx, cy, TILE, TILE);
    }
  }

  // ---- homesteads ---------------------------------------------------------

  // Build all 10 fenced homesteads. Each has a house, a crop farm and an animal
  // pen. #0 is the player's (farmable, real animals); the rest are decorative
  // neighbours so the neighbourhood reads as alive.
  private buildPlots() {
    for (const h of HOMESTEADS) this.buildHomestead(h);
  }

  // One self-contained homestead: an outer fence (with a front gate gap), a 7×7
  // crop farm on the left, and two separate animal areas on the right — a chicken
  // pen (with coop) and a cow pasture — plus an orchard.
  private buildHomestead(h: Homestead) {
    const it = h.interior;
    const gateCx = Math.floor((it.x0 + it.x1) / 2);
    const south = h.openSide === 'S';
    const gateY = south ? it.y1 + 1 : it.y0 - 1; // fence row that opens to the plaza
    const backY = south ? it.y0 - 1 : it.y1 + 1; // opposite fence row (name sign)
    const fence = () => this.encloseRegion(it.x0 - 1, it.y0 - 1, it.x1 + 1, it.y1 + 1, {
      top: true, bottom: true, left: true, right: true, gap: [gateCx, gateY],
    });

    // Every plot uses the same "Cozy Homestead" design: a chicken house + run
    // and a cow pen (no cottage). Fence first so the pens autotile against it.
    fence();
    this.buildChickenPen(h);
    this.buildCowPen(h);
    this.addSignpost(gateCx, gateY);
    this.addGateStairs(gateCx, gateY, south);

    if (!h.mine) {
      // A furnished but unclaimed plot — same design, empty crop bed, "Available".
      this.addPlotSign(h.signCx, backY, 'Available', false);
      return;
    }

    // The player's interactive farm: an untinted crop bed (blends with the
    // surrounding grass) that unlocks row-by-row as you level up.
    this.markPlayerFarm();
    this.addPlotSign(h.signCx, backY, '★ Your Homestead', true);

    // Working front gate that swings open on approach.
    const gx = gateCx * TILE + TILE / 2;
    const gy = gateY * TILE + TILE / 2;
    if (!this.anims.exists('gate-open')) {
      this.anims.create({ key: 'gate-open', frames: this.anims.generateFrameNumbers('gate', { start: 0, end: 9 }), frameRate: 24, repeat: 0 });
      this.anims.create({ key: 'gate-close', frames: this.anims.generateFrameNumbers('gate', { start: 9, end: 0 }), frameRate: 24, repeat: 0 });
    }
    this.gate = this.add.sprite(gx, gy, 'gate', 0).setScale(2).setDepth(gy + 6);
  }

  // A little staircase bridging the plateau cliff just outside a gate, so each
  // homestead reads as stepping down into the plaza. hills stairs: 28/29 (top),
  // 34/35 (bottom); flipped for the bottom band (stairs face up).
  private addGateStairs(gateCx: number, gateY: number, south: boolean) {
    const flip = !south;
    const topY = south ? gateY + 1 : gateY - 2;
    const put = (tx: number, ty: number, frame: number) => {
      if (!this.inBounds(tx, ty)) return;
      this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'hills', frame).setScale(2).setDepth(0.6).setFlipY(flip);
    };
    put(gateCx - 1, topY, flip ? 34 : 28);
    put(gateCx, topY, flip ? 35 : 29);
    put(gateCx - 1, topY + 1, flip ? 28 : 34);
    put(gateCx, topY + 1, flip ? 29 : 35);
  }

  // The chicken pen: a small orange-roof coop crowning the top edge, a U-shaped
  // fence (left/right/bottom) framing it, and a little hay dressing.
  private buildChickenPen(h: Homestead) {
    const p = h.chickenPen;
    // Coop (flag its footprint obstacle) before the fence so it autotiles cleanly.
    const coopX = Math.round((p.x0 + p.x1) / 2) * TILE + TILE / 2;
    const coopBase = (p.y0 + 1) * TILE;
    this.add.image(coopX, coopBase, 'coop', 'coop').setOrigin(0.5, 1).setScale(1.7).setDepth(coopBase);
    for (let oy = p.y0; oy <= p.y0 + 1; oy++) {
      for (let ox = p.x0 + 1; ox <= p.x1 - 1; ox++) if (this.inBounds(ox, oy)) this.tiles[oy][ox].obstacle = true;
    }
    this.addCollider(coopX, coopBase - 14, 92, 22);
    // U-shaped fence; the coop crowns the open top.
    this.encloseRegion(p.x0, p.y0, p.x1, p.y1, { left: true, right: true, bottom: true });
    this.add.image((p.x0 + 1) * TILE + 16, (p.y1 - 1) * TILE, 'hay', 6).setScale(2).setDepth((p.y1 - 1) * TILE);
    this.add.image((p.x1 - 1) * TILE, (p.y1 - 1) * TILE, 'hay', 7).setScale(2).setDepth((p.y1 - 1) * TILE);
  }

  // The cow pasture: an open fenced field (gate gap at the bottom-centre) with a
  // few hay bales. No building — cows graze in the open, distinct from the coop.
  private buildCowPen(h: Homestead) {
    const p = h.cowPen;
    const gap = Math.round((p.x0 + p.x1) / 2);
    this.encloseRegion(p.x0, p.y0, p.x1, p.y1, {
      top: true, left: true, right: true, bottom: true, gap: [gap, p.y1],
    });
    this.add.image((p.x0 + 1) * TILE + 16, (p.y0 + 2) * TILE, 'hay', 6).setScale(2).setDepth((p.y0 + 2) * TILE);
    this.add.image((p.x0 + 2) * TILE + 16, (p.y0 + 2) * TILE, 'hay', 7).setScale(2).setDepth((p.y0 + 2) * TILE);
    this.add.image((p.x1 - 1) * TILE, (p.y1 - 2) * TILE, 'hay', 0).setScale(2).setDepth((p.y1 - 2) * TILE);
  }

  // Drop a few idle, static animals into a neighbour's pens for life: chickens in
  // the chicken pen, cows in the cow pasture.
  // How many of the crop bed's rows are unlocked — one more per player level,
  // growing from the front (gate side) back toward the top. (Base bed is 10 rows
  // tall; this free level-unlock is unchanged.)
  private unlockedFarmRows(): number {
    // New players get more tillable rows up front (3 + level) so the early
    // farming loop has enough throughput; fully opens by level 7.
    return Math.min(this.myFarmRect().ph, 3 + levelInfo(this.xp).level);
  }

  // A tile is tillable when it sits inside the farmable bed (base + purchased
  // expansion columns) AND within the level-unlocked rows. Expansion columns use
  // the SAME row gate as the base bed, so buying width never grants extra rows.
  private isUnlockedFarm(tx: number, ty: number): boolean {
    const f = this.expandedFarmRect();
    if (!isInPlot(f, tx, ty)) return false;
    return ty >= f.py + f.ph - this.unlockedFarmRows();
  }

  // Player's crop bed: tint the grass so the cultivated plot reads clearly against
  // the wild grass. Tillable (level-unlocked) rows get a warm "ready soil" tint;
  // still-locked rows are dimmer so you can see the whole plot and what's left to
  // unlock. The tint only shows on untilled tiles (the dirt overlay covers tilled
  // ones). Re-run whenever the plot, expansion, or level changes.
  private markPlayerFarm() {
    const f = this.expandedFarmRect();
    const unlockedFromY = f.py + f.ph - this.unlockedFarmRows();
    const x0 = f.px, x1 = f.px + f.pw - 1;
    const y0 = f.py, y1 = f.py + f.ph - 1;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const tile = this.ground[y]?.[x];
        if (!tile) continue;
        tile.setTint(y >= unlockedFromY ? 0xd8e6a8 : 0xb3c2a0);
      }
    }
  }

  private addSignpost(tx: number, ty: number) {
    this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE, 'signs', 0).setOrigin(0.5, 1).setScale(2).setDepth(ty * TILE + 40);
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

  // Lazily create (or reuse) the tilled-dirt overlay image for a farm tile.
  // Overlays only exist on the player's own crop bed; when the owned plot is
  // re-pointed (multiplayer) we create the new plot's overlays on demand.
  private ensureOverlay(x: number, y: number): Phaser.GameObjects.Image {
    const existing = this.overlay[y]?.[x];
    if (existing) return existing;
    const cx = x * TILE + TILE / 2;
    const cy = y * TILE + TILE / 2;
    const ov = this.add.image(cx, cy, 'tilled', 42).setScale(2).setDepth(1).setVisible(false);
    this.overlay[y][x] = ov;
    return ov;
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
        bus.emit('action', 'till');
      }
    } else if (this.selected === 'can') {
      let watered = 0;
      this.forArea(tx, ty, toolRadius(this.upgrades.water), (x, y) => {
        if (this.waterTile(x, y)) watered++;
      });
      if (watered > 0) {
        this.playAction('water');
        sfx.play('water'); // once per click, not per watered tile
        bus.emit('action', 'water');
        // A tiny global-XP trickle for tending crops: +1 per newly-watered tile,
        // capped per action so a big sprinkler radius can't be cheesed for XP.
        this.gainXp(Math.min(watered, WATER_XP_CAP));
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
    if (!this.isUnlockedFarm(x, y)) return false; // only unlocked rows of your plot
    const t = this.tiles[y][x];
    if (t.tilled || this.crops.has(this.key(x, y))) return false;
    t.tilled = true;
    this.refreshTile(x, y);
    return true;
  }

  // Returns true only when a *dry* tilled tile becomes wet — re-watering an
  // already-wet tile re-applies the timer but doesn't count (so it can't be
  // spammed for the watering XP trickle).
  private waterTile(x: number, y: number): boolean {
    if (!this.tiles[y][x].tilled) return false;
    const wasDry = !this.isWet(x, y);
    this.water(x, y);
    return wasDry;
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
      plant, tx, ty, grownMs: 0, stage: 0, mature: false, mutation: null, wetAtMature: false,
      quality: 'none', matureAt: 0, withered: false, sprite,
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
    bus.emit('action', 'plant');
    this.farmDirty = true; // push an updated crop snapshot to peers ASAP
    this.emitState();
  }

  private matureCrop(crop: Crop) {
    crop.mature = true;
    crop.stage = STAGES - 1;
    // Mutation luck = Fortune upgrade × Farming-skill luck, with a small extra
    // nudge if the tile is wet at maturity (watering pays off beyond growth/sale).
    const wet = this.isWet(crop.tx, crop.ty);
    // Fortune "Lucky Clover" fork adds flat mutation luck; Sprinkler "Misting"
    // fork adds extra luck only on wet tiles. "Jackpot" fork biases the top
    // mutations (Gold/Rainbow) via topLuck instead of lifting every tier.
    const fortuneFork = this.fork('fortune');
    const mistBonus = wet ? this.fork('sprinkler').mutationLuckMult ?? 0 : 0;
    const luck =
      fortuneLuck(this.upgrades.fortune) *
      this.mods().mutationLuckMult *
      (1 + (fortuneFork.mutationLuckMult ?? 0) + mistBonus) *
      (wet ? WET_MUTATION_LUCK : 1);
    // topMutationLuckMult is an additive bonus to the top-mutation multiplier
    // (1 ⇒ ×2 jackpot odds, 0 ⇒ none) to match the rest of the additive bag.
    const topLuck = 1 + (fortuneFork.topMutationLuckMult ?? 0);
    crop.mutation = this.forcedMutation ?? pickMutation(luck, topLuck);
    crop.wetAtMature = wet;
    crop.quality = rollQuality(this.qualityLuck());
    crop.matureAt = this.time.now;
    crop.withered = false;
    this.applyMatureVisuals(crop, true);
  }

  // Quality-roll luck from the Fertilizer upgrade (`growth`) + the Farming skill.
  // mods().cropValueMult is 1 at base and climbs with farming level/perks, so its
  // excess over 1 is a clean "how good am I at farming" bonus.
  private qualityLuck(): number {
    const farmingBonus = Math.max(0, this.mods().cropValueMult - 1);
    return 1 + this.upgrades.growth * 0.5 + farmingBonus;
  }

  // Withering is ON unless the toggle (owned by the UI) is explicitly set to '0'.
  private witherEnabled(): boolean {
    try {
      return localStorage.getItem('solana-valley:crop-wither') !== '0';
    } catch {
      return true;
    }
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

    }

    // Tasteful quality marker: a small coloured ★ above silver+ crops.
    this.applyQualityStar(crop);

    if (announce) {
      const mutLabel = m.id !== 'normal' ? `${m.name} ` : '';
      const q = QUALITY[crop.quality];
      const qLabel = q.stars ? `${q.label} ${'★'.repeat(q.stars)} ` : '';
      const special = m.id !== 'normal' || rank >= 3 || crop.quality !== 'none';
      if (special) this.toast(`✨ ${qLabel}${mutLabel}${crop.plant.name} is ready!`);
    }
  }

  // Small star above a ripe crop indicating its quality tier (none = no star).
  // Rebuilt fresh; cleared on harvest/regrow/wither via removeCrop / clearStar.
  private applyQualityStar(crop: Crop) {
    crop.star?.destroy();
    crop.star = undefined;
    const q = QUALITY[crop.quality];
    if (q.stars <= 0) return;
    const cx = crop.tx * TILE + TILE / 2;
    const cy = crop.ty * TILE + TILE / 2;
    crop.star = this.add
      .text(cx, cy - 24, '★'.repeat(q.stars), {
        fontFamily: 'Pixelify Sans, monospace', fontSize: '12px', color: q.css,
        stroke: '#2a1f12', strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(this.cropDepth(crop.ty) + 2);
  }

  // A ripe crop left too long wilts: brown desaturated tint, glow/sparkle/star
  // removed. Gentle — it stays harvestable, just worth 40%.
  private applyWitherVisuals(crop: Crop) {
    crop.glow?.destroy(); crop.glow = undefined;
    crop.sparkle?.destroy(); crop.sparkle = undefined;
    crop.star?.destroy(); crop.star = undefined;
    this.rainbowCrops.delete(crop);
    crop.sprite.setFrame(crop.plant.cropRow * 5 + (STAGES - 1));
    crop.sprite.setTint(0x8a6b4a); // wilted brown
  }

  // Growth duration (ms) for the crop's current cycle: full the first time, then
  // the shorter `regrow` window after a multi-harvest reset.
  private cropGrowMs(crop: Crop): number {
    return (crop.growMs ?? crop.plant.growthSeconds * 1000) * GROWTH_TIME_SCALE;
  }

  private harvest(tx: number, ty: number) {
    const k = this.key(tx, ty);
    const crop = this.crops.get(k);
    if (!crop || !crop.mature) return;
    sfx.play('harvest');
    bus.emit('action', 'harvest');
    const mods = this.mods();
    const m = crop.mutation ?? MUTATION_BY_ID.normal;
    const value = cropValue(crop.plant, m, crop.wetAtMature, crop.quality, crop.withered);
    const sk = stackKey(crop.plant.id, m.id, crop.wetAtMature, crop.quality, crop.withered);
    // Bountiful / Master Farmer (skill) + Fertilizer "Bountiful" fork: a chance
    // this harvest yields two of the crop.
    const doubleChance = mods.cropDoubleChance + (this.fork('growth').cropDoubleChance ?? 0);
    const doubled = Math.random() < doubleChance;
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
    const wasWithered = crop.withered;
    const harvestedQuality = crop.quality;
    // Multi-harvest: a regrow crop that hasn't wilted is reset for another cycle
    // rather than removed; a wilted one (or a non-regrow crop) is taken out.
    const regrew = plant.regrow != null && !wasWithered;
    if (regrew) {
      this.regrowCrop(crop);
    } else {
      this.removeCrop(crop);
      this.crops.delete(k);
    }

    this.harvested += 1;
    this.discoveredPlants.add(plant.id);
    if (m.id !== 'normal') {
      this.mutationsFound += 1;
      this.discoveredMutations.add(m.id);
    }
    this.gainXp(harvestXp(plant.baseValue));
    this.addSkillXp('farming', harvestXp(value)); // Farming skill grows per harvest
    this.checkAchievements();

    const mutLabel = m.id !== 'normal' ? `${m.name} ` : '';
    const q = QUALITY[harvestedQuality];
    const qLabel = q.stars ? `${q.label} ${'★'.repeat(q.stars)} ` : '';
    const witherTag = wasWithered ? ' (wilted)' : '';
    this.toast(`Harvested ${qLabel}${mutLabel}${plant.name}${doubled ? ' ×2' : ''}${witherTag} (worth ${value}🪙)`);
    // Master Farmer capstone: a chance to instantly re-till + re-plant for free.
    // Skip for regrow crops — they're already replanting themselves.
    if (!regrew && mods.autoReplant && Math.random() < 0.15 && this.isInMyFarm(tx, ty)) {
      this.autoReplant(tx, ty, plant);
    }
    this.farmDirty = true; // a crop changed -> peers should see it ASAP
    this.emitState();
  }

  // Multi-harvest reset: keep the crop + its tile, but send it back to a growing
  // state. Its next cycle uses the (shorter) `regrow` duration, so it ripens
  // again in ~regrow seconds rather than the full growthSeconds.
  private regrowCrop(crop: Crop) {
    crop.glow?.destroy(); crop.glow = undefined;
    crop.sparkle?.destroy(); crop.sparkle = undefined;
    crop.star?.destroy(); crop.star = undefined;
    this.rainbowCrops.delete(crop);
    crop.mature = false;
    crop.mutation = null;
    crop.quality = 'none';
    crop.withered = false;
    crop.matureAt = 0;
    crop.grownMs = 0;
    crop.stage = 0;
    crop.growMs = (crop.plant.regrow ?? crop.plant.growthSeconds) * 1000;
    crop.sprite.clearTint();
    crop.sprite.setTint(crop.plant.cropTint ?? 0xffffff);
    crop.sprite.setFrame(crop.plant.cropRow * 5); // back to first growing frame
    const cx = crop.tx * TILE + TILE / 2;
    const cy = crop.ty * TILE + TILE / 2;
    this.floatText(cx, cy - 16, '🌱 regrow', '#bff58a');
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
      plant, tx, ty, grownMs: 0, stage: 0, mature: false, mutation: null, wetAtMature: false,
      quality: 'none', matureAt: 0, withered: false, sprite,
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
    crop.star?.destroy();
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
    // No level gate: any seed in stock is buyable if you can afford it (price is
    // the gate now). Rare seeds simply rarely appear and cost a lot. Stock is the
    // shared island pool — buying drains it for everyone on the island.
    if (this.remainingStock(plantId) <= 0) {
      this.toast('Out of stock');
      return;
    }
    // Shop Supply upgrade + its fork give a modest personal seed discount.
    const supplyFork = this.fork('supply');
    let discount = seedDiscount(this.upgrades.supply ?? 0) + (supplyFork.seedDiscount ?? 0);
    if (rarityRank(plant.rarity) >= 3) discount += supplyFork.rareSeedDiscount ?? 0; // Legendary+
    const cost = Math.max(1, Math.round(plant.seedCost * (1 - Math.min(0.6, discount))));
    if (this.coins < cost) {
      this.toast('Not enough coins');
      return;
    }

    // Optimistically grant the seed + drain the shared pool, then confirm against
    // the authoritative DB when on a real island. This keeps buying instant while
    // staying correct: if we lost a race for the last unit, we roll back.
    const cap = this.shopPool[plantId] ?? 0;
    this.coins -= cost;
    this.shopBought[plantId] = (this.shopBought[plantId] ?? 0) + 1;
    this.seeds[plantId] = (this.seeds[plantId] ?? 0) + 1;
    this.selectedSeed = plantId;
    this.selected = 'seed';
    sfx.play('buy');
    this.toast(`Bought ${plant.name} seed`);
    bus.emit('mp:shopBuy', { plantId }); // live nudge to island peers
    this.emitState();

    if (this.shopShared) {
      void buySeedRemote(this.island, this.shopEpoch, plantId, cap).then((result) => {
        if (result === null) return; // DB unavailable -> keep optimistic result
        if (result === -1) {
          // Sold out — we lost the race. Refund and undo.
          this.coins += cost;
          this.seeds[plantId] = Math.max(0, (this.seeds[plantId] ?? 0) - 1);
          this.shopBought[plantId] = cap; // it's truly empty this window
          this.toast(`${plant.name} just sold out!`);
          this.emitState();
          return;
        }
        // Adopt the authoritative count (includes our buy + any concurrent ones).
        this.shopBought[plantId] = Math.max(this.shopBought[plantId] ?? 0, result);
        this.emitState();
      });
    }
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

  // Per-crop sale value for one stack item, before count/global multipliers but
  // INCLUDING the Market Stall forks: "Connoisseur" lifts Legendary+ crops, then
  // "Wholesale" adds a flat coin bonus per crop. Shared by sellStack/sellAll.
  private cropSaleUnit(plant: Plant, mutation: Mutation, wet: boolean, quality: Quality, withered: boolean): number {
    const fork = this.fork('market');
    let v = cropValue(plant, mutation, wet, quality, withered);
    if ((fork.rareSaleMult ?? 0) > 0 && rarityRank(plant.rarity) >= 3) v *= 1 + (fork.rareSaleMult ?? 0);
    return v + (fork.saleFlatBonus ?? 0);
  }

  private sellStack(key: string) {
    const count = this.harvestInv[key] ?? 0;
    if (count <= 0) return;
    // Tolerant parse: legacy 3-/4-part keys default quality 'none', withered '0'.
    const [plantId, mutId, wet, q = 'none', wth = '0'] = key.split('|');
    const quality: Quality = q in QUALITY ? (q as Quality) : 'none';
    const value = Math.round(
      this.cropSaleUnit(PLANT_BY_ID[plantId], MUTATION_BY_ID[mutId], wet === '1', quality, wth === '1') *
        count *
        marketBonus(this.upgrades.market) *
        this.mods().cropValueMult *
        this.collectionMult(),
    );
    delete this.harvestInv[key];
    this.coins += value;
    this.earned += value;
    sfx.play('sell');
    bus.emit('action', 'sell');
    this.checkAchievements();
    this.toast(`Sold ${count}× ${PLANT_BY_ID[plantId].name} (+${value}🪙)${this.marketBonusTag()}`);
    this.emitState();
  }

  // Permanent Collection Bonus multiplier, derived live from cumulative
  // discoveries (distinct plants + mutations + completed tiers). Keeps Commons
  // relevant since every new find lifts ALL crop sale value forever.
  private collectionMult(): number {
    return collectionBonus(this.discoveredPlants, this.discoveredMutations).mult;
  }

  // Suffix for sell toasts that surfaces the Market Stall + Collection bonuses
  // when active, so players actually feel these (otherwise invisible) sale-price
  // boosts pay off.
  private marketBonusTag(): string {
    const market = Math.round((marketBonus(this.upgrades.market) - 1) * 100);
    const coll = collectionBonus(this.discoveredPlants, this.discoveredMutations).pct;
    let tag = '';
    if (market > 0) tag += ` · +${market}% Market Stall`;
    if (coll > 0) tag += ` · +${coll}% Collection`;
    return tag;
  }

  private sellAll() {
    let total = 0;
    for (const [key, count] of Object.entries(this.harvestInv)) {
      const [plantId, mutId, wet, q = 'none', wth = '0'] = key.split('|');
      const quality: Quality = q in QUALITY ? (q as Quality) : 'none';
      total += this.cropSaleUnit(PLANT_BY_ID[plantId], MUTATION_BY_ID[mutId], wet === '1', quality, wth === '1') * count;
    }
    total = Math.round(total * marketBonus(this.upgrades.market) * this.mods().cropValueMult * this.collectionMult());
    if (total <= 0) {
      this.toast('Nothing to sell');
      return;
    }
    this.harvestInv = {};
    this.coins += total;
    this.earned += total;
    sfx.play('sell');
    bus.emit('action', 'sell');
    this.checkAchievements();
    this.toast(`Sold everything (+${total}🪙)${this.marketBonusTag()}`);
    this.emitState();
  }

  // (Re)create the Phaser Key objects for the remappable movement binds. Old
  // keys are removed first so rebinding never leaves duplicate listeners.
  private buildMoveKeys() {
    const kb = this.input.keyboard;
    if (!kb) return;
    for (const a of Object.keys(this.moveKeys) as MoveAction[]) {
      const k = this.moveKeys[a];
      if (k) kb.removeKey(k, true);
    }
    this.moveKeys = {};
    const binds = getKeyBinds();
    (Object.keys(binds) as MoveAction[]).forEach((a) => {
      const name = mapKeyName(binds[a]);
      if (name) this.moveKeys[a] = kb.addKey(name);
    });
  }

  // Poll the first connected gamepad for movement (left stick + dpad) and, when
  // low-risk, tool select / act. Returns a movement vector or null. Everything is
  // guarded so missing gamepad APIs never throw.
  private pollGamepad(): { x: number; y: number } | null {
    let gp: Gamepad | null = null;
    try {
      const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : null;
      if (pads) {
        for (const p of pads) {
          if (p) {
            gp = p;
            break;
          }
        }
      }
    } catch {
      return null;
    }
    if (!gp) return null;

    const DEAD = 0.25;
    const axisX = gp.axes[0] ?? 0;
    const axisY = gp.axes[1] ?? 0;
    let x = Math.abs(axisX) > DEAD ? axisX : 0;
    let y = Math.abs(axisY) > DEAD ? axisY : 0;

    const pressed = (i: number): boolean => {
      const b = gp!.buttons[i];
      return !!b && (typeof b === 'object' ? b.pressed : (b as number) > 0.5);
    };
    // Dpad (12=up, 13=down, 14=left, 15=right) overrides/augments the stick.
    if (pressed(12)) y = -1;
    else if (pressed(13)) y = 1;
    if (pressed(14)) x = -1;
    else if (pressed(15)) x = 1;

    // Edge-triggered actions: face buttons select tools, A acts on the tile.
    const edge = (i: number): boolean => {
      const now = pressed(i);
      const was = this.padPrev[i] ?? false;
      this.padPrev[i] = now;
      return now && !was;
    };
    if (edge(2)) this.setTool('hoe'); // X / square
    if (edge(1)) this.setTool('can'); // B / circle
    if (edge(3)) this.setTool('seed'); // Y / triangle
    if (edge(0)) {
      // A / cross → use the held tool on the player's current tile.
      const tx = Math.floor(this.player.x / TILE);
      const ty = Math.floor(this.player.y / TILE);
      this.useToolAt(tx, ty);
    }

    if (x === 0 && y === 0) return null;
    return { x, y };
  }

  private setTool(id: string) {
    if (id === 'seed' && !this.selectedSeed) {
      const owned = PLANTS.find((p) => (this.seeds[p.id] ?? 0) > 0);
      this.selectedSeed = owned?.id ?? null;
    }
    this.selected = id;
    this.emitState();
  }

  // ---- shared island seed shop -------------------------------------------
  // The current restock window: a wall-clock epoch so every island peer flips
  // windows at the same instant (shared pool needs a shared boundary).
  private currentEpoch(): number {
    return Math.floor(Date.now() / RESTOCK_MS);
  }

  // Units of a seed still buyable this window: shared pool minus what's been
  // bought (by anyone on the island), floored at 0.
  private remainingStock(id: string): number {
    return Math.max(0, (this.shopPool[id] ?? 0) - (this.shopBought[id] ?? 0));
  }

  // (Re)roll the shared pool for the current island/window/online-count, keeping
  // this window's purchases. Called on join, on roster change (count changes the
  // ×players multiplier), and at the start of each window.
  private refreshShopPool() {
    this.shopPool = rollShopAt(this.island, this.shopEpoch, this.onlineCount);
  }

  // Start a fresh restock window: reset purchases and re-roll the shared pool.
  // When on a real island, pull the authoritative bought-counts for the new
  // window from the DB (so the pool is exact, not just broadcast-derived).
  private rollShopWindow(epoch: number) {
    this.shopEpoch = epoch;
    this.shopBought = {};
    this.refreshShopPool();
    if (this.shopShared) this.syncShopFromDb();
  }

  // True once we're seated on a real multiplayer island (vs. offline solo play).
  private get shopShared(): boolean {
    return !!this.myMpId;
  }

  // Pull the authoritative bought-counts for the current window from Supabase and
  // adopt them, so late joiners / missed broadcasts can't desync the shared pool.
  // Best-effort: a null result (DB not configured / offline) leaves local state.
  private syncShopFromDb() {
    if (!this.shopShared) return;
    const island = this.island;
    const epoch = this.shopEpoch;
    void fetchShopBought(island, epoch).then((bought) => {
      if (!bought) return; // DB unavailable -> keep local/broadcast state
      if (this.shopEpoch !== epoch || this.island !== island) return; // stale
      this.shopBought = bought;
      this.emitState();
    });
  }

  // A peer on the island bought a seed — drain the shared pool locally too.
  private onRemoteShopBuy(plantId: string) {
    if (!PLANT_BY_ID[plantId]) return;
    this.shopBought[plantId] = (this.shopBought[plantId] ?? 0) + 1;
    this.emitState();
  }

  private gainXp(amount: number) {
    const before = levelInfo(this.xp).level;
    this.xp += amount;
    const after = levelInfo(this.xp).level;
    if (after > before) {
      sfx.play('levelup');
      this.toast(`⭐ Level ${after}!`);
      if (this.unlockedFarmRows() > Math.min(this.myFarmRect().ph, 3 + before)) {
        this.markPlayerFarm(); // reveal the newly-unlocked crop row
        this.toast('🌱 New farm row unlocked!');
      }
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
      this.toast(`⭐ ${def.name} reached Lv ${after}!`);
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
    this.toast(`✨ ${chosen.name} — ${chosen.desc}`);
    this.emitState();
    this.saveState();
  }

  // Wipe all chosen milestone perks AND maxed-upgrade forks for an escalating
  // coin cost (first is free), so every unlocked milestone/fork becomes a pending
  // choice again. Skill XP/levels and upgrade levels are untouched — only the
  // picks reset. A plain coin sink, no dark pattern.
  private respecPerks() {
    const cost = respecCost(this.respecs);
    if (this.coins < cost) {
      this.toast(`Need ${cost.toLocaleString()}🪙 to respec perks`);
      return;
    }
    this.coins -= cost;
    this.respecs += 1;
    this.perks = { ...EMPTY_PERKS };
    this.upgradeForks = { ...EMPTY_UPGRADE_FORKS }; // forks reset alongside perks
    this.recomputeMods(); // dropping perks changes the modifier bag immediately
    sfx.play('upgrade');
    this.toast('Perks & upgrade forks reset — choose again!');
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
        this.gainXp(a.xp); // achievements feed the global level too
        sfx.play('achievement');
        this.toast(`🏆 ${a.name}!  +${a.reward}🪙 · +${a.xp} XP`);
      }
    }
    this.checkGoals(); // the rewarded goal ladder rides the same action hooks
  }

  // Snapshot the few stats the goal ladder predicates read (see game/goals.ts).
  private goalStats(): GoalStats {
    return {
      seedsOwned: Object.values(this.seeds).reduce((a, b) => a + b, 0),
      harvested: this.harvested,
      earned: this.earned,
      level: levelInfo(this.xp).level,
      upgradesBought: Object.values(this.upgrades).filter((lvl) => lvl > 0).length,
      animalsOwned: Object.values(this.animalCounts).reduce((a, b) => a + b, 0),
      plantsDiscovered: this.discoveredPlants.size,
      mutationsFound: this.mutationsFound,
    };
  }

  // Auto-claim any newly-satisfied goals exactly once, paying out coins/XP/seeds.
  // Coins are added directly (NOT via `earned`, so payouts can't snowball the
  // coin-earned goals). Loops until stable so a reward that pushes the player
  // over the next rung (e.g. XP triggers a level-up) is caught in the same tick.
  private checkGoals() {
    let progressed = true;
    while (progressed) {
      progressed = false;
      const stats = this.goalStats();
      for (const g of GOALS) {
        if (this.claimedGoals.has(g.id) || !g.test(stats)) continue;
        this.claimedGoals.add(g.id);
        this.coins += g.reward.coins;
        if (g.reward.seed && PLANTS.some((p) => p.id === g.reward.seed!.id)) {
          this.seeds[g.reward.seed.id] = (this.seeds[g.reward.seed.id] ?? 0) + g.reward.seed.count;
        }
        sfx.play('achievement');
        this.toast(`🎯 Goal complete: ${g.label}!  ${rewardLabel(g.reward)}`);
        if (g.reward.xp) this.gainXp(g.reward.xp); // may level up → loop re-checks
        progressed = true;
      }
    }
  }

  private buyUpgrade(id: string) {
    const def = UPGRADE_BY_ID[id as UpgradeId];
    if (!def) return;
    const playerLevel = levelInfo(this.xp).level;
    if (!upgradeUnlocked(def, playerLevel)) {
      this.toast(`Reach level ${def.req} to unlock the ${def.name}`);
      return;
    }
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
    let msg = `⬆️ ${def.name} upgraded to Lv ${lvl + 1}!`;
    // Reaching MAX on a fork-able upgrade unlocks its 1-of-2 specialization.
    if (def.fork && this.upgrades[def.id] >= def.max) {
      msg += ' MAX — choose a specialization in Upgrades!';
    }
    this.toast(msg);
    this.emitState();
  }

  // Buy the next crop-bed expansion column. A plain, escalating coin sink: each
  // purchase widens the farmable bed by one column into the free interior band
  // (right of the bed), capped at MAX_PLOT_EXPANSION. The new tiles become
  // tillable immediately (they share the level-based row unlock) and get their
  // tilled-dirt overlays so they render like the rest of the bed.
  private buyExpansion() {
    if (this.plotExpansion >= MAX_PLOT_EXPANSION) {
      this.toast('Garden fully expanded');
      return;
    }
    const cost = plotExpansionCost(this.plotExpansion);
    if (this.coins < cost) {
      this.toast('Not enough coins');
      return;
    }
    this.coins -= cost;
    this.plotExpansion += 1;
    this.ensureFarmOverlays(); // create the new column's tilled overlays
    this.markPlayerFarm();     // keep the wider bed's grass natural
    sfx.play('upgrade');
    this.toast(`🌱 Garden expanded! +1 column (${this.plotExpansion}/${MAX_PLOT_EXPANSION})`);
    this.emitState();
    this.saveState();
  }

  // Lock in a maxed upgrade's 1-of-2 specialization (mirrors choosePerk). Only
  // valid once the upgrade is at MAX level and the fork id is one of the two on
  // offer; once chosen it's locked (a perk respec clears it — see respecPerks).
  private chooseUpgradeFork(id: UpgradeId, fork: string) {
    const def = UPGRADE_BY_ID[id];
    if (!def?.fork) return;
    if (!upgradeForkAvailable(def, this.upgrades[id] ?? 0)) return; // not maxed yet
    if (fork !== def.fork.a.id && fork !== def.fork.b.id) return; // unknown fork id
    if (this.upgradeForks[id]) return; // already chosen (respec to change)
    this.upgradeForks[id] = fork;
    const chosen = fork === def.fork.a.id ? def.fork.a : def.fork.b;
    sfx.play('upgrade');
    this.toast(`✨ ${chosen.name} — ${chosen.desc}`);
    this.emitState();
    this.saveState();
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

  // An organic oval pond on the valley floor. No bridge, no sand ring — the
  // hard waterline is hidden the natural way, by fringing the bank with reeds,
  // cattails, lily pads and a soft ground shadow. Water tiles are obstacles so
  // the player fishes from the bank.
  private buildPond() {
    const pz = PLAZA;
    const cx = Math.floor((pz.x0 + pz.x1) / 2) - 2; // a touch left of centre
    const cyc = Math.floor((pz.y0 + pz.y1) / 2) + 4; // sits below the avenue
    const rx = 6, ry = 3;
    this.pond = { x0: cx - rx, y0: cyc - ry, x1: cx + rx, y1: cyc + ry };
    const inPond = (x: number, y: number, s = 1) => {
      const dx = (x - cx) / (rx * s), dy = (y - cyc) / (ry * s);
      return dx * dx + dy * dy <= 1;
    };

    // Soft shadow on the grass to ground the pond.
    this.add
      .ellipse(cx * TILE + TILE / 2, cyc * TILE + TILE / 2, (2 * rx + 2.4) * TILE, (2 * ry + 1.6) * TILE, 0x244a30, 0.16)
      .setDepth(0.2);

    // Water tiles inside the ellipse (organic shape).
    for (let y = cyc - ry; y <= cyc + ry; y++) {
      for (let x = cx - rx; x <= cx + rx; x++) {
        if (!this.inBounds(x, y) || !inPond(x, y)) continue;
        const px = x * TILE + TILE / 2, py = y * TILE + TILE / 2;
        if (this.anims.exists('water-anim')) this.add.sprite(px, py, 'water', 0).setScale(2).setDepth(3.8).play('water-anim');
        else this.add.image(px, py, 'water', 0).setScale(2).setDepth(3.8);
        this.tiles[y][x].obstacle = true;
        this.tiles[y][x].tilled = false;
        this.pondTiles.add(this.key(x, y));
        // One tile-sized collider per water tile. (Was TILE*2 — a 64px box on a
        // 32px tile, which overhung ~16px onto the grass and made an invisible
        // wall ringing the pond.)
        this.addCollider(px, py, TILE, TILE);
      }
    }

    // Faint surface ripples (waterobj 12–17).
    for (const [tx, ty] of [[cx - 2, cyc - 1], [cx + 2, cyc + 1], [cx, cyc]] as Array<[number, number]>) {
      if (this.pondTiles.has(this.key(tx, ty))) {
        this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'waterobj', 12 + ((tx + ty) % 6)).setScale(2).setDepth(4).setAlpha(0.5);
      }
    }

    // Lily pads (waterobj 8–10), gently bobbing.
    const lily = (tx: number, ty: number, frame: number) => {
      if (!this.pondTiles.has(this.key(tx, ty))) return;
      const cyp = ty * TILE + TILE / 2;
      const pad = this.add.image(tx * TILE + TILE / 2, cyp, 'waterobj', frame).setScale(2).setDepth(4.4);
      this.tweens.add({ targets: pad, y: cyp + 2, duration: 1800 + Math.random() * 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    };
    lily(cx - 3, cyc, 8); lily(cx + 1, cyc - 1, 9); lily(cx + 3, cyc + 1, 10);

    // Reeds, cattails & a rock fringing the bank to hide the hard waterline
    // (per-row depth so the player passes behind them).
    const fringe: Array<[number, number, number]> = [
      [cx - rx, cyc, 6], [cx + rx, cyc, 7],
      [cx - rx + 2, cyc - ry, 7], [cx + rx - 2, cyc - ry, 6],
      [cx - rx + 2, cyc + ry, 6], [cx + rx - 2, cyc + ry, 7],
      [cx - 1, cyc - ry, 6], [cx + rx - 3, cyc + ry, 3],
    ];
    for (const [tx, ty, f] of fringe) {
      if (!this.inBounds(tx, ty)) continue;
      this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE, 'waterobj', f).setOrigin(0.5, 1).setScale(2).setDepth(ty * TILE + TILE);
    }
  }

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

  // The open sea has bigger, more valuable catches than the little pond.
  private startCast(tx: number, ty: number, ocean = false) {
    const oceanLuck = ocean ? 1.25 : 1;
    const oceanValue = ocean ? 1.3 : 1;
    this.casting = true;
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    sfx.play('water');
    // A bobber on the water + expanding ripple while we wait for a bite.
    const bobber = this.add.image(cx, cy - 2, 'p_droplet').setScale(2.4).setDepth(99980).setTint(0xff4d4d);
    this.tweens.add({ targets: bobber, y: cy + 2, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const ripple = this.add.image(cx, cy, 'glow').setScale(0.4).setAlpha(0.5).setDepth(99979).setTint(0x9fd4ff);
    this.tweens.add({ targets: ripple, scale: 1.1, alpha: 0, duration: 1200, repeat: -1 });

    this.time.delayedCall(1200, () => {
      bobber.destroy();
      ripple.destroy();
      const m = this.mods();

      // Treasure Hunter: a chance to reel a treasure chest instead of a fish.
      if (Math.random() < m.treasureChance) {
        const coins = Math.round(Phaser.Math.Between(200, 1200) * oceanValue);
        this.coins += coins;
        this.earned += coins;
        this.addSkillXp('fishing', 12); // still grants fishing XP
        this.gainXp(harvestXp(coins)); // and the global level
        sfx.play('achievement');
        const chest = this.add.image(cx, cy - 6, 'p_star').setScale(3).setDepth(99990).setTint(0xffd21a);
        this.tweens.add({
          targets: chest, y: cy - 42, scale: 3.6, duration: 700, ease: 'Back.out',
          onComplete: () => this.tweens.add({ targets: chest, alpha: 0, y: cy - 58, duration: 500, onComplete: () => chest.destroy() }),
        });
        this.burst(cx, cy - 4, 'p_star', { speed: { min: 40, max: 120 }, lifespan: 800, scale: { start: 1.4, end: 0 }, tint: [0xffe066, 0xffd21a, 0xffffff] }, 16);
        this.floatText(cx, cy - 50, '💰 Treasure!', '#ffd21a');
        this.toast(`💰 Treasure! +${coins}🪙`);
        this.casting = false;
        this.checkAchievements();
        this.emitState();
        return;
      }

      const f = catchFish(m.fishLuckMult * oceanLuck);
      // Legendary Angler capstone: ~3% of catches are a huge legendary haul.
      const legendary = m.legendaryFish && Math.random() < 0.03;
      const baseValue = legendary ? f.value * 12 : f.value;
      const coins = Math.round(baseValue * m.fishValueMult * oceanValue);
      this.coins += coins;
      this.earned += coins;
      this.addSkillXp('fishing', legendary ? fishXp(f) * 3 : fishXp(f));
      this.gainXp(harvestXp(coins)); // fishing feeds the global level (scaled to value)
      sfx.play(legendary ? 'achievement' : 'sell');
      // A brief fish popup that arcs up out of the water, tinted to the catch.
      const fish = this.add.image(cx, cy - 6, 'p_fish').setScale(legendary ? 3 : 2.4).setDepth(99990).setTint(legendary ? 0xffd21a : f.tint);
      this.tweens.add({
        targets: fish, y: cy - 40, scale: legendary ? 3.8 : 3, duration: 700, ease: 'Back.out',
        onComplete: () => this.tweens.add({ targets: fish, alpha: 0, y: cy - 56, duration: 500, onComplete: () => fish.destroy() }),
      });
      this.burst(cx, cy - 4, legendary ? 'p_star' : 'p_droplet', {
        speed: { min: 40, max: 110 }, angle: { min: 220, max: 320 }, lifespan: 600,
        scale: { start: 1.4, end: 0 }, gravityY: legendary ? 0 : 240,
        tint: legendary ? [0xffe066, 0xffd21a, 0xffffff] : undefined,
      }, legendary ? 16 : 10);
      if (legendary) {
        this.floatText(cx, cy - 50, '🌟 LEGENDARY!', '#ffd21a');
        this.toast(`🌟 LEGENDARY ${f.name}! +${coins}🪙`);
      } else {
        this.toast(`🎣 Caught a ${f.name}! +${coins}🪙`);
      }
      this.casting = false;
      this.checkAchievements();
      this.emitState();
    });
  }

  // ---- foraging -----------------------------------------------------------

  // True if a tile is open grass suitable for a forage node (or the pond): not
  // an obstacle/structure, not inside any homestead, not on the player's plot or
  // pond, and free of crops.
  private isOpenGrass(tx: number, ty: number): boolean {
    return (
      this.inBounds(tx, ty) &&
      !this.tiles[ty][tx].obstacle &&
      this.tileZone(tx, ty) === 'land' &&
      !this.inAnyHomestead(tx, ty) &&
      !this.isInMyFarm(tx, ty) &&
      !this.isPondTile(tx, ty) &&
      !this.crops.has(this.key(tx, ty))
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
      this.gainXp(harvestXp(coins)); // foraging feeds the global level (scaled to value)
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
    // Persist tilled tiles + crops RELATIVE to the owned farm-bed origin so they
    // re-render correctly on whichever plot the player is assigned on load. All
    // farmable tiles live inside this rect, so its top-left is a valid origin.
    const origin = this.myFarmRect();
    const ox = origin.px, oy = origin.py;
    const tiles: SaveData['tiles'] = [];
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const t = this.tiles[y][x];
        if (t.tilled) tiles.push([x - ox, y - oy, Math.max(0, t.wetUntil - this.time.now)]);
      }
    }
    const crops: SaveData['crops'] = [];
    for (const c of this.crops.values()) {
      crops.push({
        x: c.tx - ox, y: c.ty - oy, p: c.plant.id, g: Math.round(c.grownMs),
        m: c.mature, mut: c.mutation?.id ?? null, wet: c.wetAtMature,
        q: c.quality, ma: c.matureAt, wth: c.withered,
        // Persist the regrow cycle's growth duration only when it differs from
        // the plant's default, so the timer stays correct across reloads.
        rg: c.growMs,
      });
    }
    const data: SaveData = {
      v: SAVE_VERSION,
      rel: 1, // tiles[]/crops[] coords above are origin-relative offsets
      coins: this.coins,
      selected: this.selected,
      selectedSeed: this.selectedSeed,
      seeds: this.seeds,
      harvest: this.harvestInv,
      timeMs: this.timeMs,
      tiles,
      crops,
      xp: this.xp,
      upgrades: this.upgrades,
      upgradeForks: this.upgradeForks,
      earned: this.earned,
      harvested: this.harvested,
      mutationsFound: this.mutationsFound,
      discPlants: [...this.discoveredPlants],
      discMutations: [...this.discoveredMutations],
      achievements: [...this.achievements],
      claimedGoals: [...this.claimedGoals],
      animals: this.animalCounts,
      skills: this.skills,
      perks: this.perks,
      respecs: this.respecs,
      plotExpansion: this.plotExpansion,
      // Restore the player exactly where they were on the next load (rounded to
      // whole pixels — sub-pixel precision is meaningless here).
      px: Math.round(this.player.x),
      py: Math.round(this.player.y),
      plotIndex: this.myPlotIndex,
    };
    try {
      const json = JSON.stringify(data);
      localStorage.setItem(SAVE_KEY, json);
      bus.emit('saved', json); // notify cloud-save sync (best-effort, debounced)
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
    // Accept the current version (15) and v11–v14. Each bump only ADDED fields:
    // v11→v12 added the `respecs` counter; v12→v13 added `upgradeForks`;
    // v13→v14 added `plotExpansion`; v14→v15 added `px`/`py`/`plotIndex`. Every
    // other field is read defensively with `?? default`, so older saves migrate
    // cleanly — respecs defaults to 0, upgradeForks defaults to {}, plotExpansion
    // defaults to 0, and the v15 position/plot fields default below.
    if (!data || (data.v !== SAVE_VERSION && data.v !== 15 && data.v !== 14 && data.v !== 13 && data.v !== 12 && data.v !== 11)) return false;

    // Re-point the owned plot BEFORE any tiles/crops are placed: tile/crop coords
    // are stored relative to the owned-plot origin (myFarmRect), so the index must
    // be correct before placement or the farm renders on the wrong homestead.
    // Absent (older saves / single-player) ⇒ plot 0, the create() default.
    this.myPlotIndex =
      Number.isInteger(data.plotIndex) && data.plotIndex! >= 0 && data.plotIndex! < HOMESTEADS.length
        ? data.plotIndex!
        : 0;

    this.coins = data.coins ?? this.coins;
    this.seeds = data.seeds ?? this.seeds;
    this.harvestInv = data.harvest ?? {};
    // Shop is the shared deterministic pool now — no per-player stock to restore;
    // it was already rolled for the current window in create().
    this.timeMs = data.timeMs ?? this.timeMs;
    this.selected = data.selected ?? 'hoe';
    this.selectedSeed = data.selectedSeed ?? null;

    this.xp = data.xp ?? 0;
    this.upgrades = { ...EMPTY_UPGRADES, ...(data.upgrades ?? {}) };
    this.upgradeForks = { ...EMPTY_UPGRADE_FORKS, ...(data.upgradeForks ?? {}) }; // v13 field; older saves default to {}
    this.earned = data.earned ?? 0;
    this.harvested = data.harvested ?? 0;
    this.mutationsFound = data.mutationsFound ?? 0;
    this.discoveredPlants = new Set(data.discPlants ?? []);
    this.discoveredMutations = new Set(data.discMutations ?? []);
    this.achievements = new Set(data.achievements ?? []);
    this.skills = { ...EMPTY_SKILLS, ...(data.skills ?? {}) };
    this.perks = { ...EMPTY_PERKS, ...(data.perks ?? {}) };
    this.respecs = data.respecs ?? 0; // additive v12 field; v11 saves default to 0
    // Purchased crop-bed expansion (additive v14 field; older saves default to 0).
    // Clamp to the cap so a corrupt/forward save can't widen past the free band.
    this.plotExpansion = Math.max(0, Math.min(MAX_PLOT_EXPANSION, data.plotExpansion ?? 0));
    // Now that the expansion width is known, create the extra columns' tilled
    // overlays (buildWorld only made base-bed overlays, before this load ran) and
    // re-mark the bed so the wider area renders/tills correctly.
    this.ensureFarmOverlays();
    this.markPlayerFarm();
    this.recomputeMods(); // restored skills/perks change the modifier bag
    this.animalCounts = data.animals ?? {};
    // Rewarded goal ladder (v16+). For legacy saves (no claimedGoals field),
    // retro-mark every goal the player ALREADY satisfies as claimed WITHOUT
    // paying out — so existing players don't get a flood of back-rewards; only
    // brand-new completions earn from here on. (Runs after every stat the
    // predicates read, incl. animalCounts above, is loaded.)
    this.claimedGoals = data.claimedGoals
      ? new Set(data.claimedGoals)
      : new Set(GOALS.filter((g) => g.test(this.goalStats())).map((g) => g.id));
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

    // Translate saved tile/crop coords into CURRENT world tiles. Stored coords are
    // either origin-relative offsets (rel saves) or absolute world tiles anchored
    // to plot 0's farm origin (legacy). Either way the result is `stored + (dx,dy)`:
    //   rel:    absolute = currentOrigin + storedOffset           → (dx,dy)=currentOrigin
    //   legacy: absolute = currentOrigin + (stored - plot0Origin) → (dx,dy)=currentOrigin-plot0Origin
    // In single-player (plot 0) the legacy delta is (0,0), so coords round-trip
    // identically (save rel = A - O0; load at O0 + (A - O0) = A).
    const origin = this.myFarmRect();
    const plot0 = homesteadPlot(0);
    const dx = data.rel ? origin.px : origin.px - plot0.px;
    const dy = data.rel ? origin.py : origin.py - plot0.py;

    for (const [sx, sy, wetRemaining] of data.tiles ?? []) {
      const x = sx + dx, y = sy + dy;
      // Drop tilled tiles that fall outside the world or off the (possibly
      // recycled) farm so a bad offset can't crash and no stray dirt is left.
      if (!this.inBounds(x, y) || this.tiles[y][x].obstacle || !this.isInMyFarm(x, y)) continue;
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
      const cx = c.x + dx, cy = c.y + dy; // stored offset → current world tile
      // Likewise ignore crops that land outside the world or off the current farm.
      if (!plant || !this.inBounds(cx, cy) || !this.isInMyFarm(cx, cy)) continue;
      const sprite = this.add
        .image(cx * TILE + TILE / 2, cy * TILE + TILE / 2, 'cropsheet', plant.cropRow * 5)
        .setScale(2)
        .setTint(plant.cropTint ?? 0xffffff)
        .setDepth(this.cropDepth(cy) - 1);
      const crop: Crop = {
        plant, tx: cx, ty: cy, grownMs: c.g, stage: 0,
        mature: false, mutation: null, wetAtMature: false,
        // Default crop-depth fields so old v11 saves (without them) still load.
        quality: (c.q && c.q in QUALITY ? c.q : 'none') as Quality,
        matureAt: c.ma ?? this.time.now,
        withered: c.wth ?? false,
        growMs: c.rg, // undefined on legacy/non-regrow crops → falls back to full duration
        sprite,
      };
      this.crops.set(this.key(cx, cy), crop);
      if (c.m) {
        crop.mature = true;
        crop.stage = STAGES - 1;
        crop.mutation = MUTATION_BY_ID[c.mut ?? 'normal'] ?? MUTATION_BY_ID.normal;
        crop.wetAtMature = c.wet;
        if (crop.withered) this.applyWitherVisuals(crop);
        else this.applyMatureVisuals(crop, false);
      } else {
        const ns = Math.min(STAGES - 1, Math.floor((c.g / this.cropGrowMs(crop)) * (STAGES - 1)));
        crop.stage = ns;
        crop.sprite.setFrame(plant.cropRow * 5 + ns);
      }
    }

    // create() set up the owned-plot visuals for the DEFAULT plot 0 before this
    // load ran; re-run them now so a restored non-0 plot gets its overlays/gate.
    // Idempotent and safe for plot 0 too.
    this.setupOwnedPlot();

    // Restore the player exactly where they were (v15+). Absent ⇒ leave the
    // create() spawn (centre of the owned farm).
    if (typeof data.px === 'number' && typeof data.py === 'number') {
      this.player.setPosition(data.px, data.py);
    }
    return true;
  }

  // (Re)apply the visuals for the currently-owned homestead: tilled overlays,
  // the crop-bed tint/unlock rows, and the swinging gate. Used after a save load
  // restores a non-0 plot and on a multiplayer plot change. Idempotent — safe to
  // run for plot 0 or repeatedly.
  private setupOwnedPlot() {
    this.ensureFarmOverlays();
    this.markPlayerFarm();
    this.moveGateTo(this.myPlotIndex);
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
      shop: PLANTS.map((p) => ({ plantId: p.id, stock: this.remainingStock(p.id) })),
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
        plotExpansion: this.plotExpansion,
        plotExpansionMax: MAX_PLOT_EXPANSION,
        // 0 once fully expanded so the UI can show "MAX" without recomputing.
        plotExpansionCost: this.plotExpansion >= MAX_PLOT_EXPANSION ? 0 : plotExpansionCost(this.plotExpansion),
      },
      skills: { ...this.skills },
      perks: { ...this.perks },
      respecs: this.respecs,
      upgradeForks: { ...this.upgradeForks },
      goalsClaimed: [...this.claimedGoals],
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
      // Time to the next shared restock window (wall-clock aligned for everyone).
      restockIn: Math.ceil((RESTOCK_MS - (Date.now() % RESTOCK_MS)) / 1000),
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

  // ---- multiplayer: remote avatars ----------------------------------------

  // Deterministic hue per player id so remote avatars are visually distinct.
  // Returns a soft pastel tint (kept light so the sheet stays readable).
  private tintForId(id: string): number {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const hue = (h >>> 0) % 360;
    return Phaser.Display.Color.HSVToRGB(hue / 360, 0.45, 1).color;
  }

  // Create a brand-new remote avatar (shared 'pchar' sheet + name label),
  // distinguished by an id-hashed tint. Visual only — no physics body.
  private createRemote(id: string, name: string, x: number, y: number, facing: Dir): RemotePlayer {
    const sprite = this.add.sprite(x, y, 'pchar', FarmScene.IDLE_ROW[facing]);
    sprite.setOrigin(0.5, 0.72).setScale(1.85).setTint(this.tintForId(id));
    sprite.play(`idle-${facing}`, true);
    const label = this.add
      .text(x, y, name, {
        fontFamily: 'Pixelify Sans, monospace', fontSize: '12px', color: '#ffffff',
        stroke: '#2a1f12', strokeThickness: 4,
      })
      .setOrigin(0.5, 1);
    const rp: RemotePlayer = { sprite, label, targetX: x, targetY: y, facing, name };
    this.remotePlayers.set(id, rp);
    this.depthSortRemote(rp);
    return rp;
  }

  // Narrow the bus's loose `facing: string` into our strict Dir union, defaulting
  // to 'down' on anything unexpected (the bus contract is a plain string).
  private toDir(facing: string): Dir {
    return facing === 'up' || facing === 'left' || facing === 'right' ? facing : 'down';
  }

  // A remote player moved: create their avatar if new, else update the target
  // pose we interpolate toward each frame (and their facing/name).
  private onRemoteMove({ id, x, y, facing }: { id: string; x: number; y: number; facing: string }) {
    const dir = this.toDir(facing);
    const rp = this.remotePlayers.get(id);
    if (!rp) {
      this.createRemote(id, id.slice(0, 4), x, y, dir);
      return;
    }
    rp.targetX = x;
    rp.targetY = y;
    rp.facing = dir;
  }

  private removeRemote(id: string) {
    // Drop the avatar AND any crops they were showing (a leaver vanishes whole).
    this.removeRemoteFarm(id);
    const rp = this.remotePlayers.get(id);
    if (!rp) return;
    rp.sprite.destroy();
    rp.label.destroy();
    this.remotePlayers.delete(id);
  }

  // Presence sync: the roster is the full list of who's on the island. SPAWN an
  // avatar for every online peer right away (at their plot's gate as a placeholder
  // until a real position streams in via mp:move) so idle or just-joined players
  // are visible immediately — not only once they move. Also drop avatars for
  // anyone no longer present, and refresh names.
  private onRoster(players: Array<{ id: string; name: string; plot: number }>) {
    const present = new Set(players.map((p) => p.id));
    for (const id of [...this.remotePlayers.keys()]) {
      if (!present.has(id)) this.removeRemote(id);
    }
    for (const p of players) {
      if (p.id === this.myMpId) continue; // never spawn an avatar for ourselves
      let rp = this.remotePlayers.get(p.id);
      if (!rp) {
        // A brand-new peer just appeared — rebroadcast our farm snapshot promptly
        // (next heartbeat) so they see our existing crops without waiting.
        this.farmDirty = true;
        // Place them at their own plot's gate until their first pose arrives.
        const gate = homesteadGateTile(p.plot);
        rp = this.createRemote(
          p.id,
          p.name || p.id.slice(0, 4),
          gate.tx * TILE + TILE / 2,
          gate.ty * TILE + TILE / 2,
          'down',
        );
      }
      if (p.name && rp.name !== p.name) {
        rp.name = p.name;
        rp.label.setText(p.name);
      }
    }

    // The shared shop pool scales with how many players are on the island, so
    // re-roll (keeping this window's purchases) whenever the headcount changes.
    const count = Math.max(1, players.length);
    if (count !== this.onlineCount) {
      this.onlineCount = count;
      this.refreshShopPool();
      this.emitState();
    }

    // Tint every OTHER occupied plot's crop bed too, so a friend's farmland reads
    // as cultivated grass just like ours (uniform — we don't know their unlocked
    // rows). Un-tint plots whose owner has left.
    const occupied = new Set<number>();
    for (const p of players) {
      if (p.id !== this.myMpId && Number.isInteger(p.plot)) occupied.add(p.plot);
    }
    for (const plot of occupied) {
      if (plot === this.myPlotIndex || this.remotePlotTints.has(plot)) continue;
      this.markRemotePlot(plot);
      this.remotePlotTints.add(plot);
    }
    for (const plot of [...this.remotePlotTints]) {
      if (occupied.has(plot)) continue;
      if (plot !== this.myPlotIndex) this.clearFarmTint(plot);
      this.remotePlotTints.delete(plot);
    }
  }

  // Tint another player's base crop bed (uniform "cultivated" green) so their plot
  // reads like a farm. We don't know their expansion width or unlocked rows, so we
  // mark just the base bed evenly.
  private markRemotePlot(plot: number) {
    const f = homesteadPlot(plot);
    for (let y = f.py; y < f.py + f.ph; y++) {
      for (let x = f.px; x < f.px + f.pw; x++) {
        this.ground[y]?.[x]?.setTint(0xd8e6a8);
      }
    }
  }

  // Keep a remote avatar + its label y-sorted with the world (same scheme the
  // local player uses), and float the label just above the head.
  private depthSortRemote(rp: RemotePlayer) {
    rp.sprite.setDepth(rp.sprite.y + 18);
    rp.label.setPosition(rp.sprite.x, rp.sprite.y - 26);
    rp.label.setDepth(rp.sprite.y + 19);
  }

  // Smoothly move every remote avatar toward its target each frame and play the
  // matching walk/idle anim (same keys as the local player). Called from update.
  private updateRemotes(delta: number) {
    if (!this.remotePlayers.size) return;
    // Frame-rate-independent smoothing factor.
    const t = 1 - Math.pow(0.001, delta / 1000);
    for (const rp of this.remotePlayers.values()) {
      const dx = rp.targetX - rp.sprite.x;
      const dy = rp.targetY - rp.sprite.y;
      const dist = Math.hypot(dx, dy);
      const moving = dist > 1.5;
      if (moving) {
        rp.sprite.x += dx * t;
        rp.sprite.y += dy * t;
      } else {
        rp.sprite.x = rp.targetX;
        rp.sprite.y = rp.targetY;
      }
      // Play walk while closing distance, idle once arrived — keyed exactly like
      // the local player so remote avatars animate identically. `play(..., true)`
      // ignores the call if that exact key is already running, so re-issuing each
      // frame is cheap and naturally handles a facing change mid-walk.
      rp.sprite.play(`${moving ? 'walk' : 'idle'}-${rp.facing}`, true);
      this.depthSortRemote(rp);
    }
  }

  // ---- multiplayer: remote crops ------------------------------------------

  // Build the local crop snapshot (relative to our plot origin) and ask the net
  // layer to broadcast it. Mirrors broadcastSelf: cheap, no-op in single-player
  // (nobody subscribes to 'mp:farm'). Capped to bound the payload size.
  private broadcastFarm() {
    const origin = this.myFarmRect();
    const ox = origin.px, oy = origin.py;
    const crops: GameEvents['mp:farm']['crops'] = [];
    const MAX_CROPS = 150;
    for (const c of this.crops.values()) {
      if (crops.length >= MAX_CROPS) break;
      crops.push([
        c.tx - ox,
        c.ty - oy,
        c.plant.id,
        Math.round(c.grownMs),       // growth so far (ms) — peers simulate from this
        Math.round(this.cropGrowMs(c)), // total grow duration (ms) for this cycle
        c.mature ? 1 : 0,
        c.mutation?.id ?? '',
      ]);
    }
    // Tilled-soil tiles (plot-relative), so peers see the dirt bed under the crops
    // rather than crops floating on bare grass. Visual-only, capped to bound size.
    const tilled: GameEvents['mp:farm']['tilled'] = [];
    const MAX_TILLED = 200;
    for (let y = 0; y < GRID_H && tilled.length < MAX_TILLED; y++) {
      const row = this.tiles[y];
      for (let x = 0; x < GRID_W; x++) {
        if (row[x].tilled) {
          tilled.push([x - ox, y - oy]);
          if (tilled.length >= MAX_TILLED) break;
        }
      }
    }
    bus.emit('mp:farm', { crops, tilled });
  }

  // A remote player's crop snapshot arrived. Reconcile their visual-only crop
  // sprites against the new snapshot (add/update/remove). Defensive throughout —
  // a malformed tuple is skipped, never thrown.
  private onRemoteFarm({ id, plot, crops, tilled }: GameEvents['mp:remoteFarm']) {
    if (typeof id !== 'string' || !Array.isArray(crops)) return;
    // `tilled` is optional on the wire (older clients omit it); treat anything
    // that isn't an array as "no tilled soil".
    const tilledList = Array.isArray(tilled) ? tilled : [];
    // Never draw over our own farm (our own crops are authoritative locally).
    if (plot === this.myPlotIndex) {
      this.removeRemoteFarm(id);
      return;
    }
    const next = Number.isInteger(plot) && plot >= 0 && plot < HOMESTEADS.length ? plot : -1;
    if (next < 0) return;

    let farm = this.remoteFarms.get(id);
    // If the player moved plots, wipe their old sprites and start fresh.
    if (farm && farm.plot !== next) {
      this.removeRemoteFarm(id);
      farm = undefined;
    }
    if (!farm) {
      farm = { plot: next, sprites: new Map(), tilled: new Map() };
      this.remoteFarms.set(id, farm);
    }

    const origin = homesteadPlot(next);

    // ---- tilled soil (visual-only): add new beds, drop ones no longer tilled --
    const seenTilled = new Set<string>();
    for (const t of tilledList) {
      if (!Array.isArray(t) || t.length < 2) continue;
      const [dx, dy] = t;
      if (typeof dx !== 'number' || typeof dy !== 'number') continue;
      const key = `${dx},${dy}`;
      seenTilled.add(key);
      if (!farm.tilled.has(key)) {
        const tx = origin.px + dx, ty = origin.py + dy;
        // Same 'tilled' texture/scale/depth as a local soil overlay; crops drawn
        // at cropDepth(ty)-1 sit on top. Use a fixed full-dirt frame (the local
        // solidTilledFrame keys off this.tiles, which we must not touch).
        const img = this.add
          .image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'tilled', 56)
          .setScale(2)
          .setDepth(1);
        farm.tilled.set(key, img);
      }
    }
    // DIFF: destroy soil images for tiles no longer tilled (un-tilled/replanted).
    for (const [key, img] of [...farm.tilled]) {
      if (!seenTilled.has(key)) {
        img.destroy();
        farm.tilled.delete(key);
      }
    }

    const seen = new Set<string>();
    for (const t of crops) {
      if (!Array.isArray(t) || t.length < 7) continue;
      const [dx, dy, plantId, grownMs, growMs, mature, mutId] = t;
      if (typeof dx !== 'number' || typeof dy !== 'number' || typeof plantId !== 'string') continue;
      const plant = PLANT_BY_ID[plantId];
      if (!plant) continue; // unknown crop id -> skip
      const key = `${dx},${dy}`;
      seen.add(key);
      this.upsertRemoteCrop(
        farm, key, origin.px + dx, origin.py + dy, plant,
        typeof grownMs === 'number' ? grownMs : 0,
        typeof growMs === 'number' ? growMs : 0,
        mature === 1,
        typeof mutId === 'string' ? mutId : '',
      );
    }

    // DIFF: destroy sprites for crops no longer present (harvested/removed).
    for (const [key, rc] of [...farm.sprites]) {
      if (!seen.has(key)) {
        this.destroyRemoteCrop(rc);
        farm.sprites.delete(key);
      }
    }
  }

  // The visual stage for a given growth progress — same maths the local crops
  // use (floor(progress * (STAGES-1)); ripe crops show the final stage).
  private remoteStage(grownMs: number, growMs: number, mature: boolean): number {
    if (mature) return STAGES - 1;
    if (growMs <= 0) return 0;
    return Math.max(0, Math.min(STAGES - 1, Math.floor((grownMs / growMs) * (STAGES - 1))));
  }

  // Create or update a remote crop from an authoritative snapshot: store its
  // growth state (so update() can simulate it smoothly between snapshots) and
  // render its current stage/mutation right away.
  private upsertRemoteCrop(
    farm: RemoteFarm,
    key: string,
    tx: number,
    ty: number,
    plant: Plant,
    grownMs: number,
    growMs: number,
    mature: boolean,
    mutId: string,
  ) {
    let rc = farm.sprites.get(key);
    if (!rc) {
      const sprite = this.add
        .image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'cropsheet', plant.cropRow * 5)
        .setScale(2)
        .setDepth(this.cropDepth(ty) - 1);
      rc = { sprite, plant, tx, ty, mutId, grownMs: 0, growMs: 0, mature: false, stage: -1 };
      farm.sprites.set(key, rc);
    }
    rc.plant = plant;
    rc.tx = tx; rc.ty = ty;
    rc.mutId = mutId;
    rc.grownMs = Number.isFinite(grownMs) ? Math.max(0, grownMs) : 0;
    rc.growMs = Number.isFinite(growMs) && growMs > 0 ? growMs : 0;
    rc.mature = mature;
    rc.stage = this.remoteStage(rc.grownMs, rc.growMs, rc.mature);
    // Always re-render on a snapshot: it may have changed mutation, stage, or the
    // crop may have been replanted (same tile, new plant) since last time.
    this.renderRemoteCrop(rc);
  }

  // Smoothly advance every remote crop's SIMULATED growth each frame, re-drawing
  // only when its visual stage (or maturity) actually changes. Growth runs at the
  // base 1× rate — a safe lower bound (real growth is ≥1×, boosted by wet/skills/
  // Fertilizer the peer doesn't see), so we never overshoot; each incoming
  // snapshot corrects grownMs upward to the truth.
  private updateRemoteFarms(delta: number) {
    if (!this.remoteFarms.size) return;
    for (const farm of this.remoteFarms.values()) {
      for (const rc of farm.sprites.values()) {
        if (rc.mature || rc.growMs <= 0) continue; // ripe/unknown -> nothing to advance
        rc.grownMs = Math.min(rc.growMs, rc.grownMs + delta);
        const mature = rc.grownMs >= rc.growMs;
        const stage = this.remoteStage(rc.grownMs, rc.growMs, mature);
        if (mature !== rc.mature || stage !== rc.stage) {
          rc.mature = mature;
          rc.stage = stage;
          this.renderRemoteCrop(rc);
        }
      }
    }
  }

  // Draw a remote crop at its current stage: same texture frame + tint as a local
  // crop, plus glow/sparkle for special (mutated / high-rarity) ripe crops.
  private renderRemoteCrop(rc: RemoteCropSprite) {
    const plant = rc.plant;
    const mut = rc.mutId && MUTATION_BY_ID[rc.mutId] ? MUTATION_BY_ID[rc.mutId] : null;
    const cx = rc.tx * TILE + TILE / 2;
    const cy = rc.ty * TILE + TILE / 2;

    rc.sprite.setFrame(plant.cropRow * 5 + (rc.mature ? STAGES - 1 : rc.stage));
    // Tear down any prior mutation visuals before reapplying (stage/mutation may
    // have changed between renders).
    rc.glow?.destroy(); rc.glow = undefined;
    rc.sparkle?.destroy(); rc.sparkle = undefined;

    if (mut?.rainbow) {
      rc.sprite.setTint(0xffffff);
    } else if (mut?.tint != null) {
      rc.sprite.setTint(mut.tint);
    } else {
      rc.sprite.setTint(plant.cropTint ?? 0xffffff);
    }

    // Add glow + sparkle for special (non-normal mutation OR high-rarity) ripe
    // crops, mirroring applyMatureVisuals but kept simpler for remote views.
    const rank = rarityRank(plant.rarity);
    const special = rc.mature && (!!mut && mut.id !== 'normal' || rank >= 3);
    if (special) {
      const tint = mut?.rainbow ? 0xffffff : (mut?.tint ?? RARITY[plant.rarity].glow);
      rc.glow = this.add
        .image(cx, cy - 4, 'glow')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(tint)
        .setDepth(this.cropDepth(rc.ty) - 2)
        .setScale(0.7)
        .setAlpha(0.6);
      rc.sparkle = this.add
        .particles(cx, cy - 6, 'p_star', {
          lifespan: 900,
          frequency: 260,
          scale: { start: 0.8, end: 0 },
          alpha: { start: 0.9, end: 0 },
          tint: mut?.rainbow ? 0xffffff : (mut?.tint ?? RARITY[plant.rarity].color),
          speedY: { min: -14, max: -3 },
          x: { min: -7, max: 7 },
          y: { min: -12, max: 2 },
        })
        .setDepth(this.cropDepth(rc.ty) + 1);
    }
  }

  // Destroy one remote crop sprite and its mutation visuals.
  private destroyRemoteCrop(rc: RemoteCropSprite) {
    rc.sprite.destroy();
    rc.glow?.destroy();
    rc.sparkle?.destroy();
  }

  // Remove a remote player's entire farm (all crop sprites). Safe if absent.
  private removeRemoteFarm(id: string) {
    const farm = this.remoteFarms.get(id);
    if (!farm) return;
    for (const rc of farm.sprites.values()) this.destroyRemoteCrop(rc);
    farm.sprites.clear();
    for (const img of farm.tilled.values()) img.destroy();
    farm.tilled.clear();
    this.remoteFarms.delete(id);
  }

  // ---- multiplayer: broadcast self ----------------------------------------

  // Throttle (~10/sec) and only when the pose actually changed, tell the net
  // layer where the local player is so it can broadcast. No-op cost when nobody
  // is listening (single-player: the bus has no `mp:self` subscribers).
  private broadcastSelf(time: number) {
    if (time - this.lastSelfEmit < 100) return;
    const x = Math.round(this.player.x);
    const y = Math.round(this.player.y);
    const last = this.lastSelfPose;
    if (x === last.x && y === last.y && this.facing === last.facing) return;
    this.lastSelfEmit = time;
    this.lastSelfPose = { x, y, facing: this.facing };
    bus.emit('mp:self', { x, y, facing: this.facing });
  }

  // Periodic crop-snapshot heartbeat (~3.5s) so growth-stage changes and newly
  // joined peers always converge to current state, plus an immediate push when a
  // crop just changed (farmDirty). Only fires once we've been assigned a plot, so
  // single-player never broadcasts. The net layer further throttles the send.
  private broadcastFarmHeartbeat(time: number) {
    if (!this.mpConnected) return;
    const HEARTBEAT_MS = 3500;
    if (!this.farmDirty && time - this.lastFarmEmit < HEARTBEAT_MS) return;
    this.lastFarmEmit = time;
    this.farmDirty = false;
    this.broadcastFarm();
  }

  // ---- multiplayer: dynamic owned plot + spawn + guide --------------------

  // The server assigned us a plot. Re-point ownership (clear the old farm tint,
  // set up the new crop bed + overlays + gate), drop the player at the plaza
  // centre, and draw a ground guide leading to the new plot's gate.
  private onAssigned(plot: number) {
    // We've been assigned a plot -> we're in a live multiplayer session. Gate the
    // crop-snapshot heartbeat on this so single-player never broadcasts, and push
    // an immediate snapshot so peers see our crops right away.
    this.mpConnected = true;
    this.farmDirty = true;
    const next = Number.isInteger(plot) && plot >= 0 && plot < HOMESTEADS.length ? plot : 0;
    if (next !== this.myPlotIndex) {
      this.clearFarmTint(this.myPlotIndex); // un-tint the previously-owned bed
      this.myPlotIndex = next;
      this.setupOwnedPlot();                // new bed's overlays + tint + gate
      // A genuine new/changed plot relocates the player to the plaza and guides
      // them to the gate. A refresh/reconnect that returns the SAME plot does NOT
      // teleport — the player stays exactly where they were (and at the position
      // restored from the save).
      this.spawnAtPlaza();
      this.showGuideToGate();
    }
  }

  // Reset a homestead's crop-bed ground tint back to plain (used when leaving an
  // old owned plot so it no longer reads as "yours").
  private clearFarmTint(index: number) {
    const f = homesteadPlot(index);
    const extra = Math.max(0, Math.min(MAX_PLOT_EXPANSION, this.plotExpansion));
    for (let y = f.py; y < f.py + f.ph; y++) {
      for (let x = f.px; x < f.px + f.pw + extra; x++) {
        this.ground[y]?.[x]?.clearTint();
      }
    }
  }

  // Make sure tilled-dirt overlays exist across the currently-owned crop bed
  // including any purchased expansion columns (overlays are created lazily so a
  // re-pointed plot or a freshly-bought column becomes tillable).
  private ensureFarmOverlays() {
    const f = this.expandedFarmRect();
    for (let y = f.py; y < f.py + f.ph; y++) {
      for (let x = f.px; x < f.px + f.pw; x++) {
        if (this.inBounds(x, y)) this.ensureOverlay(x, y);
      }
    }
  }

  // Relocate the swinging front gate sprite to a homestead's gate tile (or
  // create it if it doesn't exist yet — e.g. assigned before #0's gate built).
  private moveGateTo(index: number) {
    const { tx, ty } = homesteadGateTile(index);
    const gx = tx * TILE + TILE / 2;
    const gy = ty * TILE + TILE / 2;
    if (!this.anims.exists('gate-open')) {
      this.anims.create({ key: 'gate-open', frames: this.anims.generateFrameNumbers('gate', { start: 0, end: 9 }), frameRate: 24, repeat: 0 });
      this.anims.create({ key: 'gate-close', frames: this.anims.generateFrameNumbers('gate', { start: 9, end: 0 }), frameRate: 24, repeat: 0 });
    }
    if (!this.gate) {
      this.gate = this.add.sprite(gx, gy, 'gate', 0).setScale(2).setDepth(gy + 6);
    } else {
      this.gate.setPosition(gx, gy).setDepth(gy + 6).setFrame(0);
    }
    this.gateOpen = false;
  }

  // Teleport the local player to the centre of the plaza (the multiplayer spawn).
  private spawnAtPlaza() {
    const c = plazaCenterTile();
    this.player.setPosition(c.tx * TILE + TILE / 2, c.ty * TILE + TILE / 2);
    this.player.setVelocity(0, 0);
    this.facing = 'down';
    this.player.anims.play('idle-down', true);
  }

  // Roblox-style wayfinding: a glowing dashed trail of ground markers from the
  // player to the assigned plot's gate, plus a bouncing arrow over the player.
  // Cheap straight/elbow route (the plaza is open, so no pathfinding needed).
  private showGuideToGate() {
    this.clearGuide();
    const { tx, ty } = this.myGateTile();
    const gx = tx * TILE + TILE / 2;
    const gy = ty * TILE + TILE / 2;
    const sx = this.player.x;
    const sy = this.player.y;

    // Elbow route: walk horizontally to the gate column, then vertically to it.
    // Sample evenly-spaced points along the two legs and drop a marker at each.
    const markers: Phaser.GameObjects.Image[] = [];
    const STEP = TILE; // one marker per tile
    const dropMarker = (x: number, y: number) => {
      const m = this.add
        .image(x, y, 'glow')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xffe27a)
        .setScale(0.42)
        .setAlpha(0.0)
        .setDepth(0.7); // just above the ground, below props/crops
      this.tweens.add({ targets: m, alpha: 0.75, scale: 0.55, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: markers.length * 60 });
      markers.push(m);
    };
    const legSteps = (from: number, to: number) => Math.max(1, Math.round(Math.abs(to - from) / STEP));
    const hSteps = legSteps(sx, gx);
    for (let i = 1; i <= hSteps; i++) dropMarker(sx + ((gx - sx) * i) / hSteps, sy);
    const vSteps = legSteps(sy, gy);
    for (let i = 1; i <= vSteps; i++) dropMarker(gx, sy + ((gy - sy) * i) / vSteps);

    // A bouncing floating arrow above the player pointing toward the gate.
    const arrow = this.add
      .text(this.player.x, this.player.y - 56, '⬇', {
        fontFamily: 'Pixelify Sans, monospace', fontSize: '28px', color: '#ffe27a',
        stroke: '#2a1f12', strokeThickness: 5,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(120001);
    this.tweens.add({ targets: arrow, y: arrow.y - 10, duration: 480, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    this.guide = { markers, arrow, gx, gy };
  }

  // Update the floating arrow to point from the player toward the gate, fade the
  // ground markers the player has already passed, and remove the whole guide once
  // the player reaches the gate (or steps inside the plot).
  private updateGuide() {
    const g = this.guide;
    if (!g) return;
    const dx = g.gx - this.player.x;
    const dy = g.gy - this.player.y;
    const dist = Math.hypot(dx, dy);
    const ptx = Math.floor(this.player.x / TILE);
    const pty = Math.floor(this.player.y / TILE);
    if (dist < TILE * 1.2 || this.isInMyFarm(ptx, pty)) {
      this.clearGuide();
      return;
    }
    // Arrow hovers over the player's head and rotates toward the gate.
    g.arrow.setPosition(this.player.x, this.player.y - 56);
    g.arrow.setRotation(Math.atan2(dy, dx) - Math.PI / 2); // glyph points down at 0
    // Dim markers the player has already walked past so the trail "burns down".
    for (const m of g.markers) {
      if (m.active && Phaser.Math.Distance.Between(this.player.x, this.player.y, m.x, m.y) < TILE * 0.9) {
        this.tweens.killTweensOf(m);
        m.destroy();
      }
    }
    g.markers = g.markers.filter((m) => m.active);
  }

  private clearGuide() {
    if (!this.guide) return;
    for (const m of this.guide.markers) {
      this.tweens.killTweensOf(m);
      m.destroy();
    }
    this.tweens.killTweensOf(this.guide.arrow);
    this.guide.arrow.destroy();
    this.guide = null;
  }

  update(time: number, delta: number) {
    // movement: keyboard (arrows + remappable keys) wins; otherwise fall back to
    // the shared virtual joystick / gamepad vector. All three feed the same path.
    const mk = this.moveKeys;
    let vx = 0;
    let vy = 0;
    if (this.cursors.left.isDown || mk.left?.isDown) vx = -1;
    else if (this.cursors.right.isDown || mk.right?.isDown) vx = 1;
    if (this.cursors.up.isDown || mk.up?.isDown) vy = -1;
    else if (this.cursors.down.isDown || mk.down?.isDown) vy = 1;
    if (vx === 0 && vy === 0) {
      // No keyboard movement this frame — use the on-screen joystick vector.
      vx = virtualMove.x;
      vy = virtualMove.y;
    }
    // Poll the gamepad (left stick + dpad); merges into the same vx/vy.
    const pad = this.pollGamepad();
    if (pad) {
      if (vx === 0) vx = pad.x;
      if (vy === 0) vy = pad.y;
    }
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

    // Multiplayer: broadcast our pose (throttled/on-change), interpolate remote
    // avatars, and advance the spawn→gate ground guide. All no-ops when nobody
    // else is connected (no remotes, no guide, no `mp:self` subscribers).
    this.broadcastSelf(time);
    this.broadcastFarmHeartbeat(time);
    this.updateRemotes(delta);
    this.updateRemoteFarms(delta); // smoothly simulate peers' crop growth
    this.updateGuide();

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

    // crop growth + withering
    const witherOn = this.witherEnabled();
    for (const crop of this.crops.values()) {
      if (crop.mature) {
        // A ripe, un-harvested crop wilts after a generous window. Gentle: it
        // loses value but is NOT destroyed and stays harvestable.
        if (witherOn && !crop.withered) {
          const witherMs = Math.max(90_000, crop.plant.growthSeconds * 1000);
          if (time - crop.matureAt > witherMs) {
            crop.withered = true;
            this.applyWitherVisuals(crop);
          }
        }
        continue;
      }
      const wet = this.isWet(crop.tx, crop.ty);
      // Combined growth-speed multiplier: wet ×2 · Fertilizer upgrade · Farming
      // skill. Clamped at MAX_GROWTH_MULT so stacked bonuses can't trivialize
      // growth (keeps wet/Fertilizer meaningful with a sane floor on grow time).
      // growthMult is a debug/dev knob and stays outside the clamp.
      // Fertilizer "Rapid" fork adds extra growth speed, still under the clamp.
      const rapid = 1 + (this.fork('growth').growthMult ?? 0);
      const speed = Math.min(MAX_GROWTH_MULT, (wet ? 2 : 1) * growthFactor(this.upgrades.growth) * rapid * this.mods().cropGrowthMult);
      crop.grownMs += delta * this.growthMult * speed;
      const total = this.cropGrowMs(crop);
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
    // Shared shop restocks on the wall-clock window boundary, in sync for the
    // whole island.
    const epoch = this.currentEpoch();
    if (epoch !== this.shopEpoch) {
      this.rollShopWindow(epoch);
      this.toast('🛒 The seed shop restocked!');
      this.emitState();
    }
    // Periodically reconcile the shared pool against the authoritative DB so a
    // missed buy-broadcast can't leave us out of sync for long.
    if (this.shopShared) {
      this.shopSyncMs += delta;
      if (this.shopSyncMs >= 30_000) {
        this.shopSyncMs = 0;
        this.syncShopFromDb();
      }
    }
    const frac = (this.timeMs % DAY_LENGTH_MS) / DAY_LENGTH_MS;
    const { color, alpha } = this.ambientFor(frac);
    this.ambient.setFillStyle(color);
    this.ambient.setAlpha(alpha);
    this.fireflies.emitting = (frac < 0.3 || frac >= 0.82) && !this.raining;
    this.updateWeather(time);

    // Sprinkler upgrade keeps tilled tiles watered on a timer. The "Wide" fork
    // shortens that interval so soil is re-wet more often.
    const sprinklerInterval = sprinklerIntervalMs(this.upgrades.sprinkler) * (this.fork('sprinkler').sprinklerIntervalMult ?? 1);
    if (time - this.lastSprinkle > sprinklerInterval / this.growthMult) {
      this.lastSprinkle = time;
      if (this.upgrades.sprinkler > 0) this.rainWater();
    }

    // tile cursor
    const p = this.input.activePointer;
    const tx = Math.floor(p.worldX / TILE);
    const ty = Math.floor(p.worldY / TILE);
    if (this.pointerInside && this.inBounds(tx, ty)) {
      const canFarm = this.inRange(tx, ty) && this.isInMyFarm(tx, ty);
      this.highlight
        .setVisible(true)
        .setPosition(tx * TILE + TILE / 2, ty * TILE + TILE / 2)
        .setTint(canFarm ? 0xffffff : 0xff5555);
    } else {
      this.highlight.setVisible(false);
    }
  }
}
