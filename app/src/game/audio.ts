// Dependency-free WebAudio sound engine.
//
// Sounds are synthesized at runtime from OscillatorNode + GainNode graphs, so
// there are no audio asset files to ship or load. Everything is guarded so a
// missing or blocked AudioContext (older browsers, autoplay policies, private
// mode) degrades silently rather than throwing.

const MUTE_KEY = 'solana-valley:muted';
const VOLUME_KEY = 'solana-valley:volume';
const MUSIC_VOLUME_KEY = 'solana-valley:music-volume';
const MUSIC_ON_KEY = 'solana-valley:music-on';

// Background-music tuning. The loop is a gentle 4-bar jazzy progression at a
// slow tempo; everything is kept quiet so it sits under the SFX as ambience.
const MUSIC_DEFAULT_VOLUME = 0.5;
const MUSIC_BPM = 72;
const MUSIC_SECONDS_PER_BEAT = 60 / MUSIC_BPM;
const MUSIC_SECONDS_PER_BAR = MUSIC_SECONDS_PER_BEAT * 4; // 4/4 time
const MUSIC_BARS = 4;
// Lookahead scheduler: poll often, schedule a little ahead of the play head.
const MUSIC_LOOKAHEAD_MS = 250;
const MUSIC_SCHEDULE_AHEAD = 0.3; // seconds

// MIDI note number -> frequency in Hz (A4 = 69 = 440Hz).
function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// A warm jazzy progression in A-minor / C-major, one chord per bar:
// Fmaj7 – G7 – Em7 – Am7. Each chord is voiced as a few MIDI notes; the bass
// root and a sparse melody are derived from these.
const MUSIC_CHORDS: { notes: number[]; bass: number }[] = [
  { notes: [65, 69, 72, 76], bass: 41 }, // Fmaj7 (F A C E), bass F2
  { notes: [67, 71, 74, 77], bass: 43 }, // G7    (G B D F), bass G2
  { notes: [64, 67, 71, 74], bass: 40 }, // Em7   (E G B D), bass E2
  { notes: [69, 72, 76, 79], bass: 45 }, // Am7   (A C E G), bass A2
];

// A single tone scheduled relative to a start time. We synthesize each sound as
// a handful of these so they stay short and snappy.
type Tone = {
  freq: number;
  type: OscillatorType;
  start: number; // seconds after the play() instant
  dur: number; // seconds
  gain: number; // peak gain (kept low to avoid clipping when notes overlap)
  freqTo?: number; // optional linear pitch sweep to this frequency
};

type SoundName =
  | 'till'
  | 'water'
  | 'plant'
  | 'harvest'
  | 'sell'
  | 'buy'
  | 'upgrade'
  | 'levelup'
  | 'achievement'
  | 'click';

// Recipes: each sound is an array of tones. Frequencies in Hz, times in seconds.
// Gains are intentionally subtle (~0.05–0.12) and durations short (~0.05–0.2s).
const RECIPES: Record<SoundName, Tone[]> = {
  // Dull thunk: a low, fast-decaying sine that drops in pitch.
  till: [{ freq: 150, freqTo: 70, type: 'sine', start: 0, dur: 0.12, gain: 0.11 }],

  // Soft watery sweep: a quiet triangle gliding upward.
  water: [{ freq: 320, freqTo: 620, type: 'triangle', start: 0, dur: 0.18, gain: 0.06 }],

  // Gentle pop: a brief sine that pitches up a touch.
  plant: [{ freq: 420, freqTo: 540, type: 'sine', start: 0, dur: 0.08, gain: 0.09 }],

  // Bright pluck: a short triangle high up.
  harvest: [{ freq: 880, freqTo: 1180, type: 'triangle', start: 0, dur: 0.1, gain: 0.08 }],

  // Coin-y two-note up (classic pickup): two quick square notes.
  sell: [
    { freq: 988, type: 'square', start: 0, dur: 0.07, gain: 0.06 },
    { freq: 1319, type: 'square', start: 0.07, dur: 0.12, gain: 0.06 },
  ],

  // Short click + tone: a tiny tick followed by a soft confirming note.
  buy: [
    { freq: 1400, type: 'square', start: 0, dur: 0.02, gain: 0.05 },
    { freq: 560, type: 'sine', start: 0.02, dur: 0.09, gain: 0.08 },
  ],

  // Rising arpeggio: three ascending triangle notes.
  upgrade: [
    { freq: 523, type: 'triangle', start: 0, dur: 0.08, gain: 0.07 },
    { freq: 659, type: 'triangle', start: 0.07, dur: 0.08, gain: 0.07 },
    { freq: 784, type: 'triangle', start: 0.14, dur: 0.12, gain: 0.07 },
  ],

  // Cheerful 3-note arpeggio (major triad up an octave).
  levelup: [
    { freq: 523, type: 'square', start: 0, dur: 0.09, gain: 0.06 },
    { freq: 659, type: 'square', start: 0.09, dur: 0.09, gain: 0.06 },
    { freq: 1047, type: 'square', start: 0.18, dur: 0.16, gain: 0.07 },
  ],

  // Fanfare-ish: a triad stab then a held top note.
  achievement: [
    { freq: 659, type: 'triangle', start: 0, dur: 0.1, gain: 0.06 },
    { freq: 831, type: 'triangle', start: 0.05, dur: 0.1, gain: 0.06 },
    { freq: 988, type: 'triangle', start: 0.1, dur: 0.1, gain: 0.06 },
    { freq: 1319, type: 'square', start: 0.18, dur: 0.2, gain: 0.07 },
  ],

  // Tiny tick: a barely-there high blip.
  click: [{ freq: 1200, type: 'square', start: 0, dur: 0.03, gain: 0.05 }],
};

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private volume = 1; // 0..1, independent of mute (mute overrides volume).
  private failed = false; // AudioContext unavailable; stop trying.

  // --- Background music ---
  private music: GainNode | null = null; // music sub-bus, feeds master
  private musicFilter: BiquadFilterNode | null = null; // shared warmth lowpass
  private musicVolume = MUSIC_DEFAULT_VOLUME; // 0..1 music sub-level
  private musicOn = true; // user preference (persisted)
  private musicPlaying = false; // a loop is currently scheduled
  private musicTimer: ReturnType<typeof setInterval> | null = null; // scheduler
  private musicStep = 0; // index into the bar-by-bar loop
  private musicNextTime = 0; // ctx time the next bar should be scheduled at
  private crackle: AudioBufferSourceNode | null = null; // vinyl-crackle source

  constructor() {
    this.muted = this.readMuted();
    this.volume = this.readVolume();
    this.musicVolume = this.readMusicVolume();
    this.musicOn = this.readMusicOn();
  }

  private readMuted(): boolean {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  }

  private readVolume(): number {
    try {
      const raw = localStorage.getItem(VOLUME_KEY);
      if (raw == null) return 1;
      const v = Number(raw);
      return Number.isFinite(v) ? clamp01(v) : 1;
    } catch {
      return 1;
    }
  }

  private readMusicVolume(): number {
    try {
      const raw = localStorage.getItem(MUSIC_VOLUME_KEY);
      if (raw == null) return MUSIC_DEFAULT_VOLUME;
      const v = Number(raw);
      return Number.isFinite(v) ? clamp01(v) : MUSIC_DEFAULT_VOLUME;
    } catch {
      return MUSIC_DEFAULT_VOLUME;
    }
  }

  private readMusicOn(): boolean {
    try {
      // Default on: anything other than an explicit '0' counts as enabled.
      return localStorage.getItem(MUSIC_ON_KEY) !== '0';
    } catch {
      return true;
    }
  }

  // The level the master gain should sit at given mute + volume state.
  private targetGain(): number {
    return this.muted ? 0 : this.volume;
  }

  // Lazily create the AudioContext on first use. Returns null if unavailable.
  private ensureCtx(): AudioContext | null {
    if (this.ctx || this.failed) return this.ctx;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        this.failed = true;
        return null;
      }
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.targetGain();
      this.master.connect(this.ctx.destination);

      // Music sub-bus: a shared warmth lowpass into a dedicated gain, then into
      // master. Mute + master volume therefore apply to music for free, while
      // `music` carries the music-only sub-level.
      this.musicFilter = this.ctx.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = 1000;
      this.musicFilter.Q.value = 0.7;
      this.music = this.ctx.createGain();
      this.music.gain.value = this.musicVolume;
      this.musicFilter.connect(this.music);
      this.music.connect(this.master);
    } catch {
      this.failed = true;
      this.ctx = null;
      this.master = null;
      this.music = null;
      this.musicFilter = null;
    }
    return this.ctx;
  }

  // Call from a user-gesture handler. Browsers start the context suspended
  // until a gesture occurs; this resumes it so subsequent sounds are audible.
  resume(): void {
    try {
      const ctx = this.ensureCtx();
      if (ctx && ctx.state === 'suspended') void ctx.resume();
      // First gesture is our chance to satisfy autoplay policies: kick off the
      // background music if the user has it enabled and it isn't already going.
      if (this.musicOn && !this.musicPlaying) this.startMusic();
    } catch {
      // ignore — audio just stays silent
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(b: boolean): void {
    this.muted = b;
    try {
      localStorage.setItem(MUTE_KEY, b ? '1' : '0');
    } catch {
      // storage may be unavailable; mute still applies for the session
    }
    this.applyGain();
  }

  getVolume(): number {
    return this.volume;
  }

  // Set the SFX volume (0..1, clamped) and persist it. When muted, the audible
  // level stays 0 — mute overrides volume — but the new value is remembered for
  // when mute is lifted.
  setVolume(v: number): void {
    this.volume = clamp01(v);
    try {
      localStorage.setItem(VOLUME_KEY, String(this.volume));
    } catch {
      // storage may be unavailable; volume still applies for the session
    }
    this.applyGain();
  }

  // Ramp the master gain to the current mute/volume target, avoiding clicks.
  private applyGain(): void {
    if (!this.master || !this.ctx) return;
    const target = this.targetGain();
    try {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(target, now + 0.02);
    } catch {
      this.master.gain.value = target;
    }
  }

  // --- Background music: public API ---

  getMusicVolume(): number {
    return this.musicVolume;
  }

  isMusicOn(): boolean {
    return this.musicOn;
  }

  // Set the music sub-level (0..1, clamped) and persist it. Mute and master
  // volume still apply on top via the gain graph; this is the music-only level.
  setMusicVolume(v: number): void {
    this.musicVolume = clamp01(v);
    try {
      localStorage.setItem(MUSIC_VOLUME_KEY, String(this.musicVolume));
    } catch {
      // storage may be unavailable; level still applies for the session
    }
    if (!this.music || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      this.music.gain.cancelScheduledValues(now);
      this.music.gain.setValueAtTime(this.music.gain.value, now);
      this.music.gain.linearRampToValueAtTime(this.musicVolume, now + 0.05);
    } catch {
      this.music.gain.value = this.musicVolume;
    }
  }

  // Begin the loop. Idempotent: a second call while playing is a no-op. Safe to
  // call before a user gesture — it only truly starts once the context is
  // running, otherwise it stays primed for resume() to start it.
  startMusic(): void {
    this.musicOn = true;
    try {
      localStorage.setItem(MUSIC_ON_KEY, '1');
    } catch {
      // storage may be unavailable; preference still applies for the session
    }
    if (this.musicPlaying) return;
    let ctx: AudioContext | null;
    try {
      ctx = this.ensureCtx();
      if (!ctx || !this.music || !this.musicFilter) return;
      // No context running yet (no gesture): leave it primed for resume().
      if (ctx.state !== 'running') return;

      this.musicPlaying = true;
      this.musicStep = 0;
      this.musicNextTime = ctx.currentTime + 0.1;
      this.startCrackle(ctx);
      // Prime immediately, then keep filling the lookahead window.
      this.scheduleMusic();
      this.musicTimer = setInterval(() => this.scheduleMusic(), MUSIC_LOOKAHEAD_MS);
    } catch {
      // Never let music failures bubble into gameplay.
      this.musicPlaying = false;
    }
  }

  // Stop the loop, clear the scheduler, and silence the crackle. Persists the
  // off preference so it stays off across reloads and through resume().
  stopMusic(): void {
    this.musicOn = false;
    try {
      localStorage.setItem(MUSIC_ON_KEY, '0');
    } catch {
      // storage may be unavailable; preference still applies for the session
    }
    if (this.musicTimer != null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    this.musicPlaying = false;
    if (this.crackle) {
      try {
        this.crackle.onended = null;
        this.crackle.stop();
        this.crackle.disconnect();
      } catch {
        // already stopped/disconnected
      }
      this.crackle = null;
    }
  }

  // Lookahead scheduler (the standard WebAudio pattern): while the next bar is
  // within the schedule-ahead window, schedule it and advance. Already-queued
  // notes are left to play out; this only adds notes near the play head, which
  // avoids gaps and timing drift from setInterval jitter.
  private scheduleMusic(): void {
    if (!this.musicPlaying) return;
    const ctx = this.ctx;
    const dest = this.musicFilter;
    if (!ctx || !dest) return;
    try {
      while (this.musicNextTime < ctx.currentTime + MUSIC_SCHEDULE_AHEAD) {
        const chord = MUSIC_CHORDS[this.musicStep % MUSIC_CHORDS.length];
        this.scheduleBar(ctx, dest, chord, this.musicNextTime);
        this.musicNextTime += MUSIC_SECONDS_PER_BAR;
        this.musicStep = (this.musicStep + 1) % (MUSIC_CHORDS.length * MUSIC_BARS);
      }
    } catch {
      // If scheduling fails, stop cleanly rather than throwing.
      this.stopMusicInternal();
    }
  }

  // Schedule one bar: a soft sustained pad chord, a sine bass root, and a
  // sparse melody note plucked from the chord tones.
  private scheduleBar(
    ctx: AudioContext,
    dest: AudioNode,
    chord: { notes: number[]; bass: number },
    barStart: number,
  ): void {
    const padDur = MUSIC_SECONDS_PER_BAR * 0.98;

    // Pad: 3-4 quiet notes with slow attack and long release for a warm wash.
    for (const note of chord.notes) {
      this.schedulePadNote(ctx, dest, midiToFreq(note), barStart, padDur, 0.04);
    }

    // Bass: root one octave below the chord's bass note, even softer/rounder.
    this.schedulePadNote(ctx, dest, midiToFreq(chord.bass), barStart, padDur, 0.06, 'sine');

    // Melody: a single gentle chord tone late in the bar, every other bar, so
    // it stays sparse and unobtrusive.
    if (this.musicStep % 2 === 0) {
      const top = chord.notes[chord.notes.length - 1] + 12; // an octave up
      const melStart = barStart + MUSIC_SECONDS_PER_BEAT * 2.5;
      const melDur = MUSIC_SECONDS_PER_BEAT * 1.5;
      this.schedulePadNote(ctx, dest, midiToFreq(top), melStart, melDur, 0.025, 'triangle');
    }
  }

  // A single soft voice: oscillator -> per-note gain with slow attack + long
  // release, into the shared music filter. Frees its nodes when finished.
  private schedulePadNote(
    ctx: AudioContext,
    dest: AudioNode,
    freq: number,
    start: number,
    dur: number,
    peak: number,
    type: OscillatorType = 'triangle',
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);

    const attack = 0.25;
    const end = start + dur;
    const peakTime = start + Math.min(attack, dur * 0.5);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, peakTime);
    // Long, gentle release down to silence by the end of the note.
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(start);
    osc.stop(end + 0.05);
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        // already disconnected
      }
    };
  }

  // Vinyl crackle: a short buffer of low-amplitude noise looped through a
  // highpass, at very low gain, for subtle lofi texture. Routed through the
  // music sub-bus so it follows mute/volume/music-level like everything else.
  private startCrackle(ctx: AudioContext): void {
    if (!this.music) return;
    try {
      const seconds = 2;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        // Mostly silence with occasional faint pops -> classic crackle.
        data[i] = (Math.random() * 2 - 1) * (Math.random() < 0.03 ? 0.5 : 0.04);
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;

      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1500;

      const crackleGain = ctx.createGain();
      crackleGain.gain.value = 0.04;

      src.connect(hp);
      hp.connect(crackleGain);
      crackleGain.connect(this.music);
      src.start();
      src.onended = () => {
        try {
          src.disconnect();
          hp.disconnect();
          crackleGain.disconnect();
        } catch {
          // already disconnected
        }
      };
      this.crackle = src;
    } catch {
      // crackle is optional texture; ignore failures
    }
  }

  // Stop scheduling without changing the user's on/off preference. Used when an
  // internal error forces us to bail out of an otherwise-enabled loop.
  private stopMusicInternal(): void {
    if (this.musicTimer != null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    this.musicPlaying = false;
    if (this.crackle) {
      try {
        this.crackle.onended = null;
        this.crackle.stop();
        this.crackle.disconnect();
      } catch {
        // already stopped/disconnected
      }
      this.crackle = null;
    }
  }

  play(name: SoundName | string): void {
    if (this.muted) return;
    const recipe = RECIPES[name as SoundName];
    if (!recipe) return;
    let ctx: AudioContext | null;
    let master: GainNode | null;
    try {
      ctx = this.ensureCtx();
      master = this.master;
      if (!ctx || !master) return;
      // If still suspended (no gesture yet) there's nothing audible to do.
      if (ctx.state === 'suspended') return;
      const t0 = ctx.currentTime;
      for (const tone of recipe) this.scheduleTone(ctx, master, tone, t0);
    } catch {
      // Never let audio failures bubble into gameplay.
    }
  }

  private scheduleTone(ctx: AudioContext, dest: GainNode, tone: Tone, t0: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type;

    const start = t0 + tone.start;
    const end = start + tone.dur;

    osc.frequency.setValueAtTime(tone.freq, start);
    if (tone.freqTo != null) {
      osc.frequency.linearRampToValueAtTime(tone.freqTo, end);
    }

    // Quick attack, then exponential-ish decay to near-zero for a soft tail.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(tone.gain, start + Math.min(0.008, tone.dur * 0.4));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(start);
    osc.stop(end + 0.02);
    // Free nodes once they've finished so they don't accumulate.
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        // already disconnected
      }
    };
  }
}

export const sfx = new Sfx();
export type { SoundName };
