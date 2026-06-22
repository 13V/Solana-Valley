// The shared social hub island (sproutmap_3 / socialHub.json). The player
// reaches it by clicking the boat on their home island; clicking a boat here
// hops back. It renders the hand-authored hub map faithfully (each cell with
// its own tileset + frame), gives the player free movement, and is where
// multiplayer presence lives (wired separately) so players see each other.
import Phaser from 'phaser';
import { TILE, WORLD_WIDTH, WORLD_HEIGHT, PLAYER_SPEED } from '../constants';
import { hubMap, classify, isBoatKey } from '../mapLoader';
import { virtualMove, getKeyBinds, type MoveAction } from '../input';

type Dir = 'down' | 'up' | 'left' | 'right';

// Object key fragments that should be solid (block the player) and y-sorted.
const SOLID = [
  'tree', 'fences', 'animal_structures', 'chikcen_houses', 'barn_structures',
  'wooden_house_walls', 'water_well', 'work_station', 'objects_signs', 'chest',
  'objects_boats', 'stumps_and_bushes', 'door',
];
// The hub's main grass sheet — its frame 12 is the opaque interior fill, used as
// a base under partly-transparent autotile edges so the sea doesn't show through.
const HUB_GRASS = 'premium_tilesets_ground_tiles_new_tiles_grass_tile_layers';

export class HubScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private moveKeys: Partial<Record<MoveAction, Phaser.Input.Keyboard.Key>> = {};
  private facing: Dir = 'down';
  private boatTiles = new Set<string>();
  private spawn = { x: 20, y: 15 };

  private static IDLE_ROW: Record<Dir, number> = { down: 0, up: 8, left: 24, right: 16 };
  private static WALK_ROW: Record<Dir, number> = { down: 32, up: 40, left: 56, right: 48 };

  constructor() {
    super('Hub');
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.obstacles = this.physics.add.staticGroup();
    this.createAnims();
    this.buildHub();

    // Tiled-water backdrop so the hub floats in open sea (mirrors the island).
    const M = 1400;
    const sea = this.add
      .tileSprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH + 2 * M, WORLD_HEIGHT + 2 * M, 'water', 0)
      .setTileScale(2, 2)
      .setDepth(-10000);
    this.tweens.add({ targets: sea, tilePositionX: 32, duration: 5200, repeat: -1, ease: 'Linear' });
    this.tweens.add({ targets: sea, tilePositionY: 32, duration: 7400, repeat: -1, ease: 'Linear' });

    this.player = this.physics.add.sprite(this.spawn.x * TILE + TILE / 2, this.spawn.y * TILE + TILE / 2, 'pchar', 0);
    this.player.setOrigin(0.5, 0.72).setScale(1.85).setCollideWorldBounds(true);
    this.player.body!.setSize(13, 9).setOffset(17, 33);
    this.physics.add.collider(this.player, this.obstacles);
    this.player.play('idle-down', true);

    this.cameras.main.setZoom(1.65);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    const binds = getKeyBinds();
    for (const a of ['up', 'down', 'left', 'right'] as MoveAction[]) this.moveKeys[a] = kb.addKey(binds[a]);

    // Click a boat to sail back to your home island.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const tx = Math.floor(p.worldX / TILE);
      const ty = Math.floor(p.worldY / TILE);
      if (this.boatTiles.has(`${tx},${ty}`)) this.scene.start('Farm');
    });
  }

  update() {
    let vx = 0;
    let vy = 0;
    const mk = this.moveKeys;
    if (this.cursors.left.isDown || mk.left?.isDown) vx = -1;
    else if (this.cursors.right.isDown || mk.right?.isDown) vx = 1;
    if (this.cursors.up.isDown || mk.up?.isDown) vy = -1;
    else if (this.cursors.down.isDown || mk.down?.isDown) vy = 1;
    if (vx === 0 && vy === 0) {
      vx = virtualMove.x;
      vy = virtualMove.y;
    }
    const len = Math.hypot(vx, vy) || 1;
    this.player.setVelocity((vx / len) * PLAYER_SPEED, (vy / len) * PLAYER_SPEED);
    if (vx !== 0 || vy !== 0) {
      if (vx < 0) this.facing = 'left';
      else if (vx > 0) this.facing = 'right';
      else this.facing = vy < 0 ? 'up' : 'down';
      this.player.anims.play(`walk-${this.facing}`, true);
    } else {
      this.player.anims.play(`idle-${this.facing}`, true);
    }
    this.player.setDepth(this.player.y + 18);
  }

  private createAnims() {
    for (const dir of ['down', 'up', 'left', 'right'] as Dir[]) {
      const walk = `walk-${dir}`;
      if (!this.anims.exists(walk)) {
        const s = HubScene.WALK_ROW[dir];
        this.anims.create({ key: walk, frames: this.anims.generateFrameNumbers('pchar', { start: s, end: s + 7 }), frameRate: 12, repeat: -1 });
      }
      const idle = `idle-${dir}`;
      if (!this.anims.exists(idle)) {
        const s = HubScene.IDLE_ROW[dir];
        this.anims.create({ key: idle, frames: this.anims.generateFrameNumbers('pchar', { start: s, end: s + 7 }), frameRate: 6, repeat: -1 });
      }
    }
  }

  private addCollider(cx: number, cy: number, w: number, h: number) {
    const box = this.obstacles.create(cx, cy, 'pixel') as Phaser.Physics.Arcade.Sprite;
    box.setVisible(false).setDisplaySize(w, h).refreshBody();
  }

  // Render the authored hub map (faithful: each cell's own tileset + frame).
  private buildHub() {
    const hasGrass = this.textures.exists(HUB_GRASS);
    const isSolid = (key: string) => SOLID.some((s) => key.includes(s));
    const groundGrass = new Set<string>();
    const blocked = new Set<string>(); // water or solid — not walkable

    for (const layer of hubMap.layers) {
      if (layer.visible === false) continue;
      const base = layer.name === 'Ground' || layer.name === 'sea';
      for (const k in layer.cells) {
        const [key, frame] = layer.cells[k];
        if (!this.textures.exists(key)) continue;
        const [x, y] = k.split(',').map(Number);
        const cx = x * TILE + TILE / 2;
        const cy = y * TILE + TILE / 2;
        const cat = classify(key);
        const tall = isSolid(key);
        // Opaque grass under non-water ground so transparent autotile edges show
        // grass, not the sea backdrop.
        if (base && cat !== 'water' && hasGrass) this.add.image(cx, cy, HUB_GRASS, 12).setScale(2).setDepth(-1);
        const depth = base ? (layer.name === 'sea' ? -2 : 0) : tall ? cy : 1;
        this.add.image(cx, cy, key, frame).setScale(2).setDepth(depth);
        if (cat === 'water' || tall) {
          this.addCollider(cx, cy, TILE, TILE);
          blocked.add(k);
        }
        if (isBoatKey(key)) this.boatTiles.add(k);
        if (base && cat === 'grass') groundGrass.add(k);
      }
    }

    // Spawn on a walkable grass tile nearest the dock (where you'd step off the
    // boat), so the player never starts inside a tree, house or the sea.
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    const target = { x: 25, y: 20 };
    for (const k of groundGrass) {
      if (blocked.has(k) || this.boatTiles.has(k)) continue;
      const [x, y] = k.split(',').map(Number);
      const d = (x - target.x) ** 2 + (y - target.y) ** 2;
      if (d < bestD) { bestD = d; best = { x, y }; }
    }
    if (best) this.spawn = best;
  }
}
