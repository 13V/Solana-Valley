import Phaser from 'phaser';
import { TILE, PLAYER_SPEED } from '../constants';

/**
 * MapScene — a standalone, walkable "Explore" mode that renders a map built in
 * the Sprout Valley Map Editor (a `sprout-valley-map` JSON document) and lets
 * the player walk around it. It is fully additive: it shares the boot-loaded
 * `pchar` sprite and the same movement/animation feel as the farm, but touches
 * none of FarmScene's state, world geometry, save format, or multiplayer.
 *
 * Tiles are 16px in the editor and the game world is 32px/tile, so every editor
 * cell is drawn at 2× — one editor cell maps 1:1 to one game tile.
 *
 * Enter with the `M` key in the farm (or `?map=<name>`); press Esc to return.
 * Drop a `sprout-map.json` file onto the window to play your own export.
 */

type Dir = 'down' | 'up' | 'left' | 'right';

interface SheetMeta {
  id: string; file: string; cols: number; rows: number;
  group: string; name: string; cells: number[];
}
interface Manifest { tile: number; sheets: SheetMeta[] }
interface MapLayer { name: string; visible?: boolean; cells: Record<string, [string, number]> }
interface MapDoc {
  format: string; version: number; tile: number;
  w: number; h: number; bg?: boolean; active?: number; layers: MapLayer[];
}

const TILES_BASE = 'sprout-tiles/';
const MANIFEST_URL = TILES_BASE + 'tiles-manifest.json';
const DEFAULT_MAP_URL = 'maps/sample-map.json';
// Tiles whose sheet clearly represents an obstacle are treated as solid even on
// the base layer, so single-layer maps still get sensible collision. (Cliffs/
// hills are intentionally excluded — their plateau tops are walkable.)
const SOLID_KEYWORDS = /(fence|water|tree|bush|stump|rock|boulder|well|house|hut|barn|coop|chicken_house|pond|chest)/i;

export class MapScene extends Phaser.Scene {
  private static IDLE_ROW: Record<Dir, number> = { down: 0, up: 8, left: 24, right: 16 };
  private static WALK_ROW: Record<Dir, number> = { down: 32, up: 40, left: 56, right: 48 };

  private mapDoc!: MapDoc;
  private manifest!: Manifest;
  private byId: Record<string, SheetMeta> = {};

  private player!: Phaser.Physics.Arcade.Sprite;
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private facing: Dir = 'down';

  private srcUrl: string | null = null;
  private pendingDoc: MapDoc | null = null;
  private dropOver?: (e: DragEvent) => void;
  private dropHandler?: (e: DragEvent) => void;

  constructor() { super('Map'); }

  init(data: { url?: string; mapData?: MapDoc } | undefined) {
    this.srcUrl = data?.url ?? null;
    this.pendingDoc = data?.mapData ?? null;
    // Reset transient refs so a scene.restart() starts clean.
    this.facing = 'down';
  }

  preload() {
    if (!this.cache.json.exists('sprout-manifest')) {
      this.load.json('sprout-manifest', MANIFEST_URL);
    }
    if (!this.pendingDoc) {
      this.load.json('sprout-map', this.srcUrl || DEFAULT_MAP_URL);
    }
  }

  create() {
    this.manifest = this.cache.json.get('sprout-manifest') as Manifest;
    if (!this.manifest || !Array.isArray(this.manifest.sheets)) {
      this.fail('Could not load the tile manifest (sprout-tiles/tiles-manifest.json).');
      return;
    }
    this.byId = {};
    for (const s of this.manifest.sheets) this.byId[s.id] = s;

    const doc = this.pendingDoc || (this.cache.json.get('sprout-map') as MapDoc | undefined);
    if (!doc || doc.format !== 'sprout-valley-map' || !Array.isArray(doc.layers)) {
      this.fail('No valid map to load. Drop a sprout-map.json onto the window, or open ?map=sample.');
      return;
    }
    this.mapDoc = doc;

    // Phase two: queue every tile sheet this map references, then build.
    const used = new Set<string>();
    for (const layer of doc.layers) {
      for (const k in layer.cells) {
        const ref = layer.cells[k];
        if (Array.isArray(ref) && typeof ref[0] === 'string') used.add(ref[0]);
      }
    }
    let toLoad = 0;
    used.forEach((id) => {
      const s = this.byId[id];
      if (!s || this.textures.exists(this.texKey(id))) return;
      this.load.spritesheet(this.texKey(id), TILES_BASE + s.file.replace(/^tiles\//, ''), {
        frameWidth: 16, frameHeight: 16,
      });
      toLoad++;
    });

    if (toLoad > 0) {
      this.load.once(Phaser.Loader.Events.COMPLETE, () => this.build());
      this.load.start();
    } else {
      this.build();
    }
  }

  private texKey(sheetId: string) { return 'st:' + sheetId; }

  private build() {
    const doc = this.mapDoc;
    const W = doc.w | 0, H = doc.h | 0;
    const worldW = W * TILE, worldH = H * TILE;

    this.cameras.main.setBackgroundColor('#14180f');
    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.solids = this.physics.add.staticGroup();
    this.ensurePixel();

    const solid: boolean[][] = Array.from({ length: H }, () => new Array(W).fill(false));

    // Render layers bottom→top; depth = layer index keeps stacking order.
    doc.layers.forEach((layer, li) => {
      if (layer.visible === false) return;
      for (const key in layer.cells) {
        const ref = layer.cells[key];
        if (!Array.isArray(ref)) continue;
        const sid = ref[0];
        const idx = ref[1] | 0;
        const s = this.byId[sid];
        if (!s) continue;
        const comma = key.indexOf(',');
        const cx = parseInt(key.slice(0, comma), 10);
        const cy = parseInt(key.slice(comma + 1), 10);
        if (isNaN(cx) || isNaN(cy) || cx < 0 || cy < 0 || cx >= W || cy >= H) continue;

        if (this.textures.exists(this.texKey(sid))) {
          this.add.image(cx * TILE + TILE / 2, cy * TILE + TILE / 2, this.texKey(sid), idx)
            .setScale(2).setDepth(li);
        }
        // Collision: anything above the base layer, or an obstacle-keyword sheet.
        if (li >= 1 || SOLID_KEYWORDS.test(s.group + ' ' + s.name)) solid[cy][cx] = true;
      }
    });

    // Merge horizontal runs of solid cells into fewer static bodies.
    for (let y = 0; y < H; y++) {
      let x = 0;
      while (x < W) {
        if (!solid[y][x]) { x++; continue; }
        let x2 = x;
        while (x2 < W && solid[y][x2]) x2++;
        const w = (x2 - x) * TILE;
        const body = this.solids.create(x * TILE + w / 2, y * TILE + TILE / 2, '__px') as Phaser.Physics.Arcade.Sprite;
        body.setVisible(false).setDisplaySize(w, TILE).refreshBody();
        x = x2;
      }
    }

    // Player — same sprite + animation feel as the farm.
    this.createAnims();
    const spawn = this.findSpawn(solid, W, H);
    this.player = this.physics.add.sprite(spawn.x, spawn.y, 'pchar', 0);
    this.player.setOrigin(0.5, 0.72).setScale(1.85);
    this.player.body!.setSize(13, 9).setOffset(17, 33);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.solids);
    this.player.play('idle-down');

    const M = 240;
    this.cameras.main.setBounds(-M, -M, worldW + 2 * M, worldH + 2 * M);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(1.6);

    // Input.
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-ESC', this.exitToFarm, this);
    kb.on('keydown-M', this.exitToFarm, this);

    this.addHud(W, H);
    this.installDropToLoad();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown, this);
  }

  update() {
    if (!this.player || !this.player.body) return;
    let vx = 0, vy = 0;
    const c = this.cursors, w = this.wasd;
    if (c.left.isDown || w.A.isDown) vx = -1; else if (c.right.isDown || w.D.isDown) vx = 1;
    if (c.up.isDown || w.W.isDown) vy = -1; else if (c.down.isDown || w.S.isDown) vy = 1;

    const len = Math.hypot(vx, vy) || 1;
    this.player.setVelocity((vx / len) * PLAYER_SPEED, (vy / len) * PLAYER_SPEED);

    if (vx !== 0 || vy !== 0) {
      this.facing = vx < 0 ? 'left' : vx > 0 ? 'right' : (vy < 0 ? 'up' : 'down');
      this.player.anims.play(`walk-${this.facing}`, true);
    } else {
      this.player.anims.play(`idle-${this.facing}`, true);
    }
    this.player.setDepth(this.player.y); // always above the layer-indexed tiles
  }

  // ---- helpers -------------------------------------------------------------

  private createAnims() {
    (['down', 'up', 'left', 'right'] as Dir[]).forEach((dir) => {
      const walk = `walk-${dir}`;
      if (!this.anims.exists(walk)) {
        const start = MapScene.WALK_ROW[dir];
        this.anims.create({ key: walk, frames: this.anims.generateFrameNumbers('pchar', { start, end: start + 7 }), frameRate: 12, repeat: -1 });
      }
      const idle = `idle-${dir}`;
      if (!this.anims.exists(idle)) {
        const start = MapScene.IDLE_ROW[dir];
        this.anims.create({ key: idle, frames: this.anims.generateFrameNumbers('pchar', { start, end: start + 7 }), frameRate: 6, repeat: -1 });
      }
    });
  }

  private ensurePixel() {
    if (this.textures.exists('__px')) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 1, 1);
    g.generateTexture('__px', 1, 1);
    g.destroy();
  }

  /** Nearest walkable cell to the map centre, in world pixels (tile centre). */
  private findSpawn(solid: boolean[][], W: number, H: number) {
    const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (solid[y][x]) continue;
        const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d < bestD) { bestD = d; best = { x, y }; }
      }
    }
    const cell = best ?? { x: cx, y: cy };
    return { x: cell.x * TILE + TILE / 2, y: cell.y * TILE + TILE / 2 };
  }

  private addHud(W: number, H: number) {
    const text = `Explore  ·  ${W}×${H}\n` +
      'Move: arrows / WASD   ·   Esc or M: back to farm   ·   drop a sprout-map.json to load it';
    this.add.text(12, 10, text, {
      fontFamily: 'monospace', fontSize: '12px', color: '#e7efe3',
      backgroundColor: 'rgba(0,0,0,0.45)', padding: { x: 8, y: 6 }, lineSpacing: 3,
    }).setScrollFactor(0).setDepth(100000);
  }

  private installDropToLoad() {
    this.dropOver = (e: DragEvent) => { e.preventDefault(); };
    this.dropHandler = (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      file.text().then((txt) => {
        try {
          const doc = JSON.parse(txt);
          if (doc && doc.format === 'sprout-valley-map') {
            this.scene.restart({ mapData: doc });
          } else {
            this.toast('That file is not a sprout-valley-map JSON.');
          }
        } catch {
          this.toast('Could not parse that file as JSON.');
        }
      });
    };
    window.addEventListener('dragover', this.dropOver);
    window.addEventListener('drop', this.dropHandler);
  }

  private teardown() {
    if (this.dropOver) window.removeEventListener('dragover', this.dropOver);
    if (this.dropHandler) window.removeEventListener('drop', this.dropHandler);
    this.dropOver = undefined;
    this.dropHandler = undefined;
    this.input.keyboard?.off('keydown-ESC', this.exitToFarm, this);
    this.input.keyboard?.off('keydown-M', this.exitToFarm, this);
  }

  private exitToFarm() { this.scene.start('Farm'); }

  private toast(msg: string) {
    const t = this.add.text(this.scale.width / 2, 44, msg, {
      fontFamily: 'monospace', fontSize: '13px', color: '#fff',
      backgroundColor: 'rgba(0,0,0,0.7)', padding: { x: 10, y: 6 },
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100001);
    this.time.delayedCall(1800, () => t.destroy());
  }

  private fail(msg: string) {
    this.cameras.main.setBackgroundColor('#14180f');
    this.add.text(20, 20, msg + '\n\nPress Esc to return to the farm.', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffd2cc', lineSpacing: 4,
    }).setScrollFactor(0).setDepth(100000);
    this.input.keyboard?.once('keydown-ESC', this.exitToFarm, this);
  }
}
