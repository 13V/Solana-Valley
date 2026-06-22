// The shared social hub island (sproutmap_3 / socialHub.json). The player
// reaches it by clicking the boat on their home island; clicking a boat here
// hops back. It renders the hand-authored hub map faithfully (each cell with
// its own tileset + frame), gives the player free movement, and — unlike the
// PRIVATE home island — is multiplayer: everyone who sails here lands on the
// same `hub:shared` realtime channel, so they see each other walking around.
import Phaser from 'phaser';
import { TILE, WORLD_WIDTH, WORLD_HEIGHT, PLAYER_SPEED } from '../constants';
import { hubMap, classify, isBoatKey } from '../mapLoader';
import { virtualMove, getKeyBinds, type MoveAction } from '../input';
import { bus } from '../EventBus';
import { currentSelfId } from '../../chain/multiplayer';
import { FishingCast } from '../fishingCast';
import { catchFish, fishCss } from '../fishing';
import { pushHubCatch } from '../hubCatches';

type Dir = 'down' | 'up' | 'left' | 'right';

// A remote player's avatar on the hub: the shared 'pchar' sprite (animated like
// the local player), a floating name label, and the target pose we lerp toward
// each frame as `mp:move` updates stream in. Mirrors FarmScene's RemotePlayer,
// minus the tool/fishing pose flags (the hub is walk-around only).
type RemotePlayer = {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  facing: Dir;
  name: string;
};

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
  private waterTiles = new Set<string>(); // fishable water cells on the hub map
  private spawn = { x: 20, y: 15 };
  private fishingCast!: FishingCast;
  private casting = false;

  // ---- multiplayer (no-ops until joinHub connects the shared channel) -------
  private remotePlayers = new Map<string, RemotePlayer>();
  private unsubs: Array<() => void> = [];
  // Last pose we broadcast, so `mp:self` only fires on change + throttled.
  private lastSelfPose = { x: 0, y: 0, facing: 'down' as Dir };
  private lastSelfEmit = 0;

  private static IDLE_ROW: Record<Dir, number> = { down: 0, up: 8, left: 24, right: 16 };
  private static WALK_ROW: Record<Dir, number> = { down: 32, up: 40, left: 56, right: 48 };

  constructor() {
    super('Hub');
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.obstacles = this.physics.add.staticGroup();
    this.remotePlayers.clear();
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

    // Fishing works at the hub too: click nearby water to cast (same minigame as
    // the island). Catches buffer to localStorage and land in your island bag.
    this.fishingCast = new FishingCast(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.fishingCast.destroy());

    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    const binds = getKeyBinds();
    for (const a of ['up', 'down', 'left', 'right'] as MoveAction[]) this.moveKeys[a] = kb.addKey(binds[a]);

    // Click a boat to sail home; click nearby water to fish.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      // A click during the bite window hooks the fish.
      if (this.fishingCast.active) { this.fishingCast.onPointer(); return; }
      const tx = Math.floor(p.worldX / TILE);
      const ty = Math.floor(p.worldY / TILE);
      if (this.boatTiles.has(`${tx},${ty}`)) { this.scene.start('Farm'); return; }
      if (this.waterTiles.has(`${tx},${ty}`)) this.tryFish(tx, ty);
    });

    // Join the shared hub channel (MultiplayerSync listens for this and connects
    // the wallet to `hub:shared`) and start listening for peers. All of this is a
    // no-op when no wallet is connected — the hub just stays single-player.
    bus.emit('mp:enterHub', undefined);
    this.unsubs.push(
      bus.on('mp:roster', (players) => this.onRoster(players)),
      bus.on('mp:move', (m) => this.onRemoteMove(m)),
      bus.on('mp:leave', ({ id }) => this.removeRemote(id)),
    );

    // Leave the channel and tear down every avatar + listener when we sail away.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      bus.emit('mp:exitHub', undefined);
      this.unsubs.forEach((u) => u());
      this.unsubs = [];
      this.remotePlayers.forEach((rp) => { rp.sprite.destroy(); rp.label.destroy(); });
      this.remotePlayers.clear();
    });

    this.toast('🏝️ Welcome to the social hub! Other players appear here.');
  }

  update(time: number, delta: number) {
    // While a cast is in flight the player is rooted to the spot (mirrors the
    // island): freeze movement, hold the idle pose, and let the cast animate.
    if (this.casting) {
      this.player.setVelocity(0, 0);
      this.player.anims.play(`idle-${this.facing}`, true);
      this.fishingCast.update();
      this.broadcastSelf(time);
      this.updateRemotes(delta);
      return;
    }

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

    // Broadcast our pose so peers see us, then interpolate their avatars. Both are
    // no-ops when nobody else is connected (the bus has no `mp:self` subscriber).
    this.broadcastSelf(time);
    this.updateRemotes(delta);
  }

  // Small floating status line (the hub has no HUD of its own).
  private toast(text: string) {
    bus.emit('toast', text);
  }

  // Cast a line at a nearby hub-water tile. Same minigame as the island; on a
  // hooked catch the fish is buffered (hubCatches) and lands in the player's bag
  // when they next sail home and FarmScene drains it.
  private tryFish(tx: number, ty: number) {
    if (this.casting) return;
    const ptx = Math.floor(this.player.x / TILE);
    const pty = Math.floor(this.player.y / TILE);
    if (Math.abs(tx - ptx) > 5 || Math.abs(ty - pty) > 5) {
      this.toast('Too far to cast — step closer to the water.');
      return;
    }
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    this.facing =
      Math.abs(cx - this.player.x) > Math.abs(cy - this.player.y)
        ? cx < this.player.x ? 'left' : 'right'
        : cy < this.player.y ? 'up' : 'down';
    this.casting = true;
    this.fishingCast.begin({
      origin: () => ({ x: this.player.x, y: this.player.y - 12 }),
      target: { x: cx, y: cy },
      onResolve: (o) => {
        this.casting = false;
        if (o.hooked) {
          const f = catchFish(1, 'any');
          pushHubCatch(f.id);
          this.floatText(cx, cy - 38, `🎣 ${f.rarity}`, fishCss(f));
          this.toast(`🎣 Caught a ${f.name} (${f.rarity})! It's waiting in your island bag.`);
        } else if (o.reason === 'early') {
          this.toast('🎣 Reeled in early — nothing was biting yet.');
        } else {
          this.toast('🎣 It got away! Click the moment it bites.');
        }
      },
    });
  }

  // A brief floating label that drifts up and fades (catch rarity / status).
  private floatText(x: number, y: number, text: string, color: string) {
    const t = this.add
      .text(x, y, text, { fontFamily: 'monospace', fontSize: '12px', color, stroke: '#1c2b1a', strokeThickness: 3 })
      .setOrigin(0.5)
      .setDepth(100000);
    this.tweens.add({ targets: t, y: y - 22, alpha: 0, duration: 1100, ease: 'Sine.out', onComplete: () => t.destroy() });
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
        // Social hub is a free-roam space: ONLY fences block movement. Trees,
        // houses, water, etc. are walkable (still y-sorted via `tall` so overlap
        // reads right). Keeps the hub from feeling like a maze of invisible walls.
        if (key.includes('fences')) {
          this.addCollider(cx, cy, TILE, TILE);
          blocked.add(k);
        }
        if (cat === 'water') this.waterTiles.add(k); // click nearby to fish
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

  // ---- multiplayer: remote avatars ----------------------------------------

  // Throttle (~10/sec) and only when the pose actually changed, tell the net
  // layer where the local player is so it can broadcast (world pixel coords, to
  // match how createRemote/onRemoteMove place avatars). Mirrors FarmScene.
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

  // Deterministic pastel hue per player id so remote avatars are distinct
  // (identical scheme to FarmScene so a player looks the same on island + hub).
  private tintForId(id: string): number {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const hue = (h >>> 0) % 360;
    return Phaser.Display.Color.HSVToRGB(hue / 360, 0.45, 1).color;
  }

  // Narrow the bus's loose `facing: string` into our strict Dir union.
  private toDir(facing: string): Dir {
    return facing === 'up' || facing === 'left' || facing === 'right' ? facing : 'down';
  }

  // Create a brand-new remote avatar (shared 'pchar' sheet + name label),
  // distinguished by an id-hashed tint. Visual only — no physics body.
  private createRemote(id: string, name: string, x: number, y: number, facing: Dir): RemotePlayer {
    const sprite = this.add.sprite(x, y, 'pchar', HubScene.IDLE_ROW[facing]);
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

  // A remote player moved: create their avatar if new, else update the target
  // pose we interpolate toward each frame (and their facing).
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
    const rp = this.remotePlayers.get(id);
    if (!rp) return;
    rp.sprite.destroy();
    rp.label.destroy();
    this.remotePlayers.delete(id);
  }

  // Presence sync: the roster is the full list of who's on the hub (including
  // us). Spawn an avatar for every OTHER peer right away (at the dock spawn until
  // their first pose streams in) so idle/just-joined players are visible, refresh
  // names, and drop avatars for anyone who left.
  private onRoster(players: Array<{ id: string; name: string; plot: number }>) {
    const selfId = currentSelfId();
    const present = new Set(players.map((p) => p.id));
    for (const id of [...this.remotePlayers.keys()]) {
      if (!present.has(id)) this.removeRemote(id);
    }
    for (const p of players) {
      if (p.id === selfId) continue; // never spawn an avatar for ourselves
      let rp = this.remotePlayers.get(p.id);
      if (!rp) {
        rp = this.createRemote(
          p.id,
          p.name || p.id.slice(0, 4),
          this.spawn.x * TILE + TILE / 2,
          this.spawn.y * TILE + TILE / 2,
          'down',
        );
      }
      if (p.name && rp.name !== p.name) {
        rp.name = p.name;
        rp.label.setText(p.name);
      }
    }
  }

  // Keep a remote avatar + its label y-sorted with the world (same scheme the
  // local player uses) and float the label just above the head.
  private depthSortRemote(rp: RemotePlayer) {
    rp.sprite.setDepth(rp.sprite.y + 18);
    rp.label.setPosition(rp.sprite.x, rp.sprite.y - 26);
    rp.label.setDepth(rp.sprite.y + 19);
  }

  // Smoothly move every remote avatar toward its target each frame and play the
  // matching walk/idle anim (same keys as the local player). Called from update.
  private updateRemotes(delta: number) {
    if (!this.remotePlayers.size) return;
    const t = 1 - Math.pow(0.001, delta / 1000); // frame-rate-independent smoothing
    for (const rp of this.remotePlayers.values()) {
      const dx = rp.targetX - rp.sprite.x;
      const dy = rp.targetY - rp.sprite.y;
      const moving = Math.hypot(dx, dy) > 1.5;
      if (moving) {
        rp.sprite.x += dx * t;
        rp.sprite.y += dy * t;
        rp.sprite.play(`walk-${rp.facing}`, true);
      } else {
        rp.sprite.x = rp.targetX;
        rp.sprite.y = rp.targetY;
        rp.sprite.play(`idle-${rp.facing}`, true);
      }
      this.depthSortRemote(rp);
    }
  }
}
