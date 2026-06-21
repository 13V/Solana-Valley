// Shared input layer: a virtual movement vector (written by on-screen touch
// controls and gamepad polling) plus remappable movement keys persisted to
// localStorage. FarmScene consumes both; the on-screen-controls UI writes to
// `virtualMove` and edits binds through the functions below.

export type MoveAction = 'up' | 'down' | 'left' | 'right';

// Mutable singleton — NOT React state. Touch joystick & gamepad poll write here
// each frame; FarmScene reads it as a fallback when no keyboard input is active.
// Components: -1..1 each (left/up negative, right/down positive).
export const virtualMove: { x: number; y: number } = { x: 0, y: 0 };

type KeyBinds = Record<MoveAction, string>;

const STORAGE_KEY = 'farm-lands:keybinds';
const DEFAULTS: KeyBinds = { up: 'W', down: 'S', left: 'A', right: 'D' };
const ACTIONS: MoveAction[] = ['up', 'down', 'left', 'right'];

function clone(b: KeyBinds): KeyBinds {
  return { up: b.up, down: b.down, left: b.left, right: b.right };
}

function load(): KeyBinds {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(DEFAULTS);
    const parsed = JSON.parse(raw) as Partial<Record<MoveAction, unknown>>;
    const out = clone(DEFAULTS);
    for (const a of ACTIONS) {
      const v = parsed[a];
      if (typeof v === 'string' && v.length > 0) out[a] = v;
    }
    return out;
  } catch {
    return clone(DEFAULTS);
  }
}

let binds: KeyBinds = load();
const subscribers = new Set<() => void>();

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(binds));
  } catch {
    // Ignore quota/availability errors — keybinds stay in-memory for the session.
  }
}

function notify(): void {
  for (const cb of subscribers) cb();
}

// Returns a copy so callers can't mutate the live binds directly.
export function getKeyBinds(): KeyBinds {
  return clone(binds);
}

export function setKeyBind(a: MoveAction, key: string): void {
  if (!key) return;
  binds[a] = key;
  persist();
  notify();
}

export function resetKeyBinds(): void {
  binds = clone(DEFAULTS);
  persist();
  notify();
}

// Subscribe to bind changes; returns an unsubscribe function.
export function onKeyBindsChange(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}
