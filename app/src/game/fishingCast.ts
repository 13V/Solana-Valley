// The fishing cast minigame: bobber + line choreography and the timing the
// player reacts to. It owns ONLY the feel of a cast — it knows nothing about
// which fish you catch or what it's worth. FarmScene drives it, animates the
// player (via the onPhase callback), and on a successful hook rolls the catch.
//
// Sequence (Stardew-cosy, one-click reaction):
//   1. casting — the player swings the rod, the bobber arcs out onto the water
//   2. waiting — the bobber idles; an underwater shadow circles; a bite is timed
//   3. ready   — bubbles rise to the surface: "a fish is interested!"
//   4. bite    — the bobber DUNKS (splash). A short window opens — click now!
//   5. resolve — hooked (clicked in time) → reel in; else it gets away
//
// Art: the bobber + splash come from the Ocean Pack `fishing_splash` sheet and
// the shadow from `fish_shadow_md` (animations are created in FarmScene); the
// rod itself is part of the player's casting animation, so we only draw the
// thin line from the rod-tip (origin) to the bobber. All art is guarded — if a
// sheet is missing it falls back to generated FX so a cast never hard-crashes.

import Phaser from 'phaser';
import { sfx } from './audio';

// Ocean Pack texture keys + the anim keys FarmScene.createAnims registers.
const SPLASH_SHEET = 'fishing_splash'; // 48px: bobber float + water-splash frames
const SHADOW_SHEET = 'fish_shadow_md'; // 16px: 15-frame "swim in a circle" loop
const ANIM_BOBBER_IDLE = 'bobber_idle';
const ANIM_BOBBER_DUNK = 'bobber_dunk';
const ANIM_SPLASH = 'splash_burst';
const ANIM_SHADOW = 'shadow_swim';

export type CastPhase = 'idle' | 'casting' | 'waiting' | 'ready' | 'bite' | 'reeling';

export type CastOutcome =
  | { hooked: true; at: { x: number; y: number } }
  | { hooked: false; reason: 'late' | 'early'; at: { x: number; y: number } };

export interface CastConfig {
  /** Rod-tip in world space, sampled live each frame so the line tracks the player. */
  origin: () => { x: number; y: number };
  /** Centre of the water tile the bobber lands on. */
  target: { x: number; y: number };
  /** Fired on every phase change so the scene can drive the player's cast animation. */
  onPhase?: (phase: CastPhase) => void;
  /** Called once when the cast finishes (hooked or not). */
  onResolve: (outcome: CastOutcome) => void;
  /** Scales the wait-for-bite delay (<1 = bites sooner). Default 1. */
  biteDelayMult?: number;
  /** Scales the click-to-hook reaction window (>1 = easier). Default 1. */
  hookWindowMult?: number;
}

const DEPTH_LINE = 99975;
const DEPTH_BOBBER = 99985;
const DEPTH_FX = 99980;

export class FishingCast {
  private scene: Phaser.Scene;
  private phase: CastPhase = 'idle';

  private cfg: CastConfig | null = null;
  private line: Phaser.GameObjects.Graphics;
  private bobber: Phaser.GameObjects.Sprite | null = null;
  private shadow: Phaser.GameObjects.Sprite | null = null;
  private prompt: Phaser.GameObjects.Text | null = null;

  private restY = 0; // bobber's resting surface y (for the dunk + bob)
  private timers: Phaser.Time.TimerEvent[] = [];
  private tweens: Phaser.Tweens.Tween[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.line = scene.add.graphics().setDepth(DEPTH_LINE);
  }

  get active(): boolean {
    return this.phase !== 'idle';
  }

  private hasArt(): boolean {
    return this.scene.textures.exists(SPLASH_SHEET) && this.scene.anims.exists(ANIM_BOBBER_IDLE);
  }

  // Set the phase and notify the scene (so it can swap the player's animation).
  private setPhase(p: CastPhase) {
    this.phase = p;
    this.cfg?.onPhase?.(p);
  }

  // ---- lifecycle ----------------------------------------------------------

  begin(cfg: CastConfig) {
    if (this.phase !== 'idle') return;
    this.cfg = cfg;
    this.setPhase('casting');

    const start = cfg.origin();
    if (this.hasArt()) {
      this.bobber = this.scene.add.sprite(start.x, start.y, SPLASH_SHEET).setScale(1.4).play(ANIM_BOBBER_IDLE);
    } else {
      this.bobber = this.scene.add.sprite(start.x, start.y, 'p_droplet').setScale(2);
    }
    this.bobber.setOrigin(0.5, 0.5).setDepth(DEPTH_BOBBER);

    sfx.play('water');

    // Arc the bobber out to the water (a quick parabola so it reads as a cast).
    const proxy = { t: 0 };
    const peak = 26 + Phaser.Math.Distance.Between(start.x, start.y, cfg.target.x, cfg.target.y) * 0.12;
    this.tweens.push(
      this.scene.tweens.add({
        targets: proxy,
        t: 1,
        duration: 460,
        ease: 'Quad.out',
        onUpdate: () => {
          if (!this.bobber) return;
          const t = proxy.t;
          this.bobber.x = Phaser.Math.Linear(start.x, cfg.target.x, t);
          const flatY = Phaser.Math.Linear(start.y, cfg.target.y, t);
          this.bobber.y = flatY - Math.sin(t * Math.PI) * peak; // up then down
        },
        onComplete: () => this.land(),
      }),
    );
  }

  // Click handler routed from the scene while a cast is live.
  onPointer() {
    switch (this.phase) {
      case 'bite':
        this.hook();
        break;
      case 'waiting':
      case 'ready':
        // Reeled in before the fish committed — a gentle, no-penalty whiff.
        this.finish({ hooked: false, reason: 'early', at: this.bobberPos() });
        break;
      // 'casting' / 'reeling' / 'idle' — ignore mid-animation clicks.
    }
  }

  // Redraw the line from the rod-tip (origin) to the bobber each frame. The rod
  // itself is drawn by the player's casting animation, so we draw no pole.
  update() {
    this.line.clear();
    if (this.phase === 'idle' || !this.cfg || !this.bobber) return;
    const o = this.cfg.origin();
    const b = this.bobber;
    const midX = (o.x + b.x) / 2;
    const midY = (o.y + b.y) / 2 + 6; // slight sag
    this.line.lineStyle(1, 0xf2efe6, 0.8);
    this.line.beginPath();
    this.line.moveTo(o.x, o.y);
    this.line.lineTo(midX, midY);
    this.line.lineTo(b.x, b.y);
    this.line.strokePath();
  }

  destroy() {
    this.clearTimers();
    this.line.destroy();
    this.bobber?.destroy();
    this.shadow?.destroy();
    this.prompt?.destroy();
  }

  // ---- phases -------------------------------------------------------------

  private land() {
    if (!this.cfg || !this.bobber) return;
    this.setPhase('waiting');
    this.restY = this.cfg.target.y;
    this.bobber.setPosition(this.cfg.target.x, this.restY);
    if (this.hasArt()) this.bobber.play(ANIM_BOBBER_IDLE);
    this.splashAt(this.cfg.target.x, this.restY);

    // An underwater shadow circles below the bobber — the "something's down
    // there" tell (replaces the old expanding ripple).
    if (this.scene.anims.exists(ANIM_SHADOW)) {
      this.shadow = this.scene.add
        .sprite(this.cfg.target.x, this.restY + 5, SHADOW_SHEET)
        .setAlpha(0.5)
        .setScale(1.6)
        .setDepth(DEPTH_FX)
        .play(ANIM_SHADOW);
    }
    // Idle bob.
    this.tweens.push(
      this.scene.tweens.add({
        targets: this.bobber, y: this.restY + 2, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      }),
    );

    // A bite lands somewhere in this window; the wait is the suspense. Quick Bite
    // (Angler's Tree) shortens it.
    const biteMult = Math.max(0.2, this.cfg.biteDelayMult ?? 1);
    this.after(Phaser.Math.Between(1400, 3600) * biteMult, () => this.ready());
  }

  // "A fish is interested" — bubbles rise to the surface as the tell.
  private ready() {
    if (!this.bobber) return;
    this.setPhase('ready');
    const { x } = this.bobber;
    for (let i = 0; i < 5; i++) {
      this.after(i * 110, () => this.bubble(x + Phaser.Math.Between(-7, 7)));
    }
    // After the tell, the bobber commits — the dunk.
    this.after(720, () => this.bite());
  }

  // The bob: the bobber dunks under and a short reaction window opens.
  private bite() {
    if (!this.bobber) return;
    this.setPhase('bite');
    this.stopTweens(); // stop the idle bob so the dunk is crisp
    this.shadow?.destroy(); // the fish took the bait
    this.shadow = null;
    sfx.play('water');
    this.splashAt(this.bobber.x, this.restY);
    if (this.hasArt()) this.bobber.play(ANIM_BOBBER_DUNK);

    // Snap down (the "bob"), then bounce — the visible click cue.
    this.tweens.push(
      this.scene.tweens.add({
        targets: this.bobber, y: this.restY + 9, duration: 130, ease: 'Quad.in', yoyo: true, repeat: 1,
      }),
    );

    // "!" prompt above the bobber.
    this.prompt = this.scene.add
      .text(this.bobber.x, this.restY - 26, '!', {
        fontFamily: 'Pixelify Sans, monospace', fontSize: '22px', color: '#ffe066',
        stroke: '#2a1f12', strokeThickness: 5,
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_BOBBER + 1);
    this.tweens.push(
      this.scene.tweens.add({ targets: this.prompt, scale: { from: 0.6, to: 1.2 }, duration: 180, ease: 'Back.out' }),
    );

    // Miss it and it gets away. Steady Hands (Angler's Tree) widens the window.
    const winMult = Math.max(0.5, this.cfg?.hookWindowMult ?? 1);
    this.after(900 * winMult, () => {
      if (this.phase === 'bite') this.finish({ hooked: false, reason: 'late', at: this.bobberPos() });
    });
  }

  private hook() {
    if (!this.bobber) return;
    this.setPhase('reeling');
    this.clearTimers();
    this.stopTweens();
    this.prompt?.destroy();
    this.prompt = null;
    if (this.hasArt()) this.bobber.play(ANIM_BOBBER_IDLE);
    sfx.play('sell');

    const at = this.bobberPos();
    const o = this.cfg!.origin();
    // Quick reel: the bobber zips back toward the rod, then we hand off to the
    // scene to present the actual catch at the splash point.
    this.tweens.push(
      this.scene.tweens.add({
        targets: this.bobber, x: o.x, y: o.y, duration: 260, ease: 'Quad.in',
        onComplete: () => this.finish({ hooked: true, at }),
      }),
    );
  }

  private finish(outcome: CastOutcome) {
    const cb = this.cfg?.onResolve;
    this.reset();
    cb?.(outcome);
  }

  // ---- small fx helpers ---------------------------------------------------

  private bubble(x: number) {
    const b = this.scene.add
      .image(x, this.restY + 4, 'p_droplet')
      .setDepth(DEPTH_FX)
      .setScale(Phaser.Math.FloatBetween(0.6, 1.2))
      .setAlpha(0.9)
      .setTint(0xcde6ff);
    this.scene.tweens.add({
      targets: b, y: this.restY - 12, alpha: 0, duration: 600, ease: 'Sine.out',
      onComplete: () => b.destroy(),
    });
  }

  // A water splash at the surface: the Ocean Pack splash sprite if available,
  // else a quick generated-droplet burst.
  private splashAt(x: number, y: number) {
    if (this.scene.anims.exists(ANIM_SPLASH)) {
      const s = this.scene.add.sprite(x, y, SPLASH_SHEET).setDepth(DEPTH_FX).setScale(1.4).setOrigin(0.5, 0.6);
      s.play(ANIM_SPLASH);
      s.once('animationcomplete', () => s.destroy());
      return;
    }
    const emitter = this.scene.add.particles(x, y, 'p_droplet', {
      emitting: false, speed: { min: 30, max: 90 }, angle: { min: 200, max: 340 },
      lifespan: 500, scale: { start: 1.2, end: 0 }, gravityY: 220, tint: 0x9fd4ff,
    });
    emitter.explode(10, x, y);
    this.scene.time.delayedCall(800, () => emitter.destroy());
  }

  // ---- bookkeeping --------------------------------------------------------

  private bobberPos(): { x: number; y: number } {
    return this.bobber ? { x: this.bobber.x, y: this.restY } : { ...(this.cfg?.target ?? { x: 0, y: 0 }) };
  }

  private after(ms: number, fn: () => void) {
    this.timers.push(this.scene.time.delayedCall(ms, fn));
  }

  private clearTimers() {
    this.timers.forEach((t) => t.remove(false));
    this.timers = [];
  }

  private stopTweens() {
    this.tweens.forEach((t) => t.stop());
    this.tweens = [];
  }

  // Tear down the live cast (objects + timers) and go idle.
  private reset() {
    this.clearTimers();
    this.stopTweens();
    this.line.clear();
    this.bobber?.destroy();
    this.bobber = null;
    this.shadow?.destroy();
    this.shadow = null;
    this.prompt?.destroy();
    this.prompt = null;
    this.cfg = null;
    this.phase = 'idle';
  }
}
