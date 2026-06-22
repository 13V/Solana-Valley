// Accessibility / presentation settings store.
//
// Persists a small bag of user preferences to localStorage and applies them by
// toggling classes / CSS custom properties on <html> (document.documentElement)
// plus injecting an SVG colour-matrix filter for the colourblind modes. The
// module self-applies on import (see the applySettings() call at the bottom) so
// the very first paint already reflects saved settings; App.tsx only needs to
// import it once. Components subscribe via the useSettings() hook.

import { useEffect, useState } from 'react';
import { sfx } from '../game/audio';

const SETTINGS_KEY = 'farm-lands:settings';
const REDUCE_MOTION_KEY = 'farm-lands:reduce-motion';
// Standalone key the game core reads directly to decide if ripe crops wilt.
// Default ON: only '0' disables withering.
const CROP_WITHER_KEY = 'farm-lands:crop-wither';
const FILTER_DEFS_ID = 'cb-filter-defs';

export type TextSize = 'sm' | 'md' | 'lg';
export type Colorblind = 'off' | 'prot' | 'deut' | 'trit';

export type Settings = {
  // Sound volume 0..1. Mirrors the audio engine's persisted volume so the
  // slider has a value even before the AudioContext exists.
  volume: number;
  muted: boolean;
  reduceMotion: boolean;
  textSize: TextSize;
  colorblind: Colorblind;
  // When on, ripe crops wilt if left too long (reduced sell value). Persisted
  // to its own localStorage key so the Phaser game core can read it directly.
  cropWither: boolean;
};

const DEFAULTS: Settings = {
  volume: 1,
  muted: false,
  reduceMotion: false,
  textSize: 'md',
  colorblind: 'off',
  cropWither: true,
};

const TEXT_SCALE: Record<TextSize, number> = { sm: 0.9, md: 1, lg: 1.15 };

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Read settings from localStorage, falling back to (and back-filling) defaults.
// Pull the canonical mute/volume straight from the audio engine so the two
// stay in sync regardless of which one last wrote.
export function loadSettings(): Settings {
  let parsed: Partial<Settings> = {};
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) parsed = JSON.parse(raw) as Partial<Settings>;
  } catch {
    parsed = {};
  }
  const textSize: TextSize =
    parsed.textSize === 'sm' || parsed.textSize === 'lg' ? parsed.textSize : 'md';
  const colorblind: Colorblind =
    parsed.colorblind === 'prot' ||
    parsed.colorblind === 'deut' ||
    parsed.colorblind === 'trit'
      ? parsed.colorblind
      : 'off';
  // Crop withering: the standalone key is the source of truth (the game core
  // reads it directly). Default ON; only an explicit '0' disables it. Fall back
  // to the bundled settings blob if the standalone key was never written.
  let cropWither = parsed.cropWither !== false;
  try {
    const raw = localStorage.getItem(CROP_WITHER_KEY);
    if (raw !== null) cropWither = raw !== '0';
  } catch {
    // storage unavailable; keep the value from the settings blob / default
  }
  return {
    // The audio engine is the source of truth for volume + mute.
    volume: clamp01(typeof sfx.getVolume === 'function' ? sfx.getVolume() : DEFAULTS.volume),
    muted: typeof sfx.isMuted === 'function' ? sfx.isMuted() : DEFAULTS.muted,
    reduceMotion: parsed.reduceMotion === true,
    textSize,
    colorblind,
    cropWither,
  };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // storage unavailable; settings still apply for the session
  }
  try {
    localStorage.setItem(REDUCE_MOTION_KEY, s.reduceMotion ? '1' : '0');
  } catch {
    // ignore
  }
  try {
    // Standalone key the game core reads: '1' on, '0' off.
    localStorage.setItem(CROP_WITHER_KEY, s.cropWither ? '1' : '0');
  } catch {
    // ignore
  }
}

// SVG colour-matrix filters for colourblind simulation. These are the common
// Machado/standard simulation matrices, injected once into <body> so the CSS
// `filter: url(#cb-prot)` references resolve. Off uses no filter at all.
const CB_FILTERS: Record<Exclude<Colorblind, 'off'>, string> = {
  // Protanopia (no red cones)
  prot:
    '0.567 0.433 0     0 0 ' +
    '0.558 0.442 0     0 0 ' +
    '0     0.242 0.758 0 0 ' +
    '0     0     0     1 0',
  // Deuteranopia (no green cones)
  deut:
    '0.625 0.375 0   0 0 ' +
    '0.7   0.3   0   0 0 ' +
    '0     0.3   0.7 0 0 ' +
    '0     0     0   1 0',
  // Tritanopia (no blue cones)
  trit:
    '0.95 0.05  0     0 0 ' +
    '0    0.433 0.567 0 0 ' +
    '0    0.475 0.525 0 0 ' +
    '0    0     0     1 0',
};

// Inject the <filter> defs once. Idempotent: a second call is a no-op.
function ensureFilterDefs(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(FILTER_DEFS_ID)) return;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('id', FILTER_DEFS_ID);
  svg.setAttribute('aria-hidden', 'true');
  // Keep it out of layout / off-screen but still referenceable.
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.style.width = '0';
  svg.style.height = '0';
  svg.style.overflow = 'hidden';
  const defs = document.createElementNS(NS, 'defs');
  (Object.keys(CB_FILTERS) as Array<keyof typeof CB_FILTERS>).forEach((key) => {
    const filter = document.createElementNS(NS, 'filter');
    filter.setAttribute('id', `cb-${key}`);
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    const matrix = document.createElementNS(NS, 'feColorMatrix');
    matrix.setAttribute('type', 'matrix');
    matrix.setAttribute('values', CB_FILTERS[key]);
    filter.appendChild(matrix);
    defs.appendChild(filter);
  });
  svg.appendChild(defs);
  document.body.appendChild(svg);
}

// Apply a settings bag to the document: toggle classes / CSS vars on <html>,
// keep the audio engine in sync, and expose a global reduced-motion flag the
// Phaser side can read (window.__reduceMotion).
export function applySettings(s: Settings = loadSettings()): void {
  // Audio engine is the source of truth; push values into it.
  try {
    sfx.setVolume(s.volume);
    sfx.setMuted(s.muted);
  } catch {
    // audio may be unavailable; ignore
  }

  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  // Text size: CSS var for em-based sizing + a class to bump px-based text.
  root.style.setProperty('--ui-scale', String(TEXT_SCALE[s.textSize]));
  root.classList.remove('txt-sm', 'txt-md', 'txt-lg');
  root.classList.add(`txt-${s.textSize}`);

  // Reduced motion: CSS class (defeats animations) + a global flag for Phaser.
  root.classList.toggle('reduce-motion', s.reduceMotion);
  (window as unknown as { __reduceMotion?: boolean }).__reduceMotion = s.reduceMotion;

  // Colourblind: ensure the SVG filter defs exist, then swap the class.
  ensureFilterDefs();
  root.classList.remove('cb-off', 'cb-prot', 'cb-deut', 'cb-trit');
  root.classList.add(`cb-${s.colorblind}`);
}

// React hook: returns [settings, update]. `update` merges a partial, persists,
// applies immediately, and re-renders subscribers.
export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  // Re-sync on mount in case settings were applied (e.g. audio changed) before
  // this component mounted.
  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const update = (patch: Partial<Settings>) => {
    setSettings((cur) => {
      const next = { ...cur, ...patch };
      saveSettings(next);
      applySettings(next);
      return next;
    });
  };

  return [settings, update];
}

// Self-apply on import so saved settings take effect on first paint. App.tsx
// just needs to `import './settings'` (or import a symbol from it) once.
applySettings();
