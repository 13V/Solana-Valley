// Fish caught at the social hub. The hub is its own Phaser scene and does NOT
// own the farm inventory (FarmScene does), so a hub catch is buffered here and
// the island drains it into the bag — awarding XP/points/daily — the next time
// FarmScene loads (i.e. when the player sails home). Persisted to localStorage
// so a catch survives even if the tab is closed while still at the hub.
const KEY = 'farm-lands:hub-catches';

export function pushHubCatch(fishId: string): void {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]') as unknown;
    const list = Array.isArray(raw) ? (raw as string[]) : [];
    list.push(fishId);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable (private mode) — the catch is lost but never crashes */
  }
}

export function drainHubCatches(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]') as unknown;
    localStorage.removeItem(KEY);
    return Array.isArray(raw) ? (raw as string[]) : [];
  } catch {
    return [];
  }
}
