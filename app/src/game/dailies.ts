// Daily quests + streak — a retention layer that gives a fresh set of 3
// objectives each real-world day, with a streak that rewards returning daily.
// A one-day grace ("insurance") means a single missed day doesn't wipe a long
// streak. FarmScene tracks per-day counters and auto-grants the reward when all
// three are done. Keyed to the local calendar day (NOT the fast in-game day).

export type DailyKind = 'harvest' | 'sell' | 'fish' | 'forage' | 'mutation' | 'plant';

export type DailyCounters = Record<DailyKind, number>;
export const EMPTY_DAILY_COUNTERS: DailyCounters = {
  harvest: 0, sell: 0, fish: 0, forage: 0, mutation: 0, plant: 0,
};

export type DailyQuest = { kind: DailyKind; target: number; label: string };

const TEMPLATES: DailyQuest[] = [
  { kind: 'harvest', target: 25, label: 'Harvest 25 crops' },
  { kind: 'sell', target: 1500, label: 'Sell 1,500🪙 of goods' },
  { kind: 'plant', target: 20, label: 'Plant 20 seeds' },
  { kind: 'fish', target: 3, label: 'Catch 3 fish' },
  { kind: 'forage', target: 4, label: 'Forage 4 wild finds' },
  { kind: 'mutation', target: 1, label: 'Find a mutation' },
];

// Deterministic 3-quest pick for a date key — stable across reloads that day,
// and the same for everyone ("today's dailies").
export function dailiesForDate(dateKey: string): DailyQuest[] {
  let seed = 0;
  for (let i = 0; i < dateKey.length; i++) seed = (seed * 31 + dateKey.charCodeAt(i)) | 0;
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const idx = TEMPLATES.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, 3).map((i) => ({ ...TEMPLATES[i] }));
}

export function dailyDone(q: DailyQuest, c: DailyCounters): boolean {
  return (c[q.kind] ?? 0) >= q.target;
}
export function allDailiesDone(qs: DailyQuest[], c: DailyCounters): boolean {
  return qs.every((q) => dailyDone(q, c));
}

// Reward for completing all dailies, scaling gently with the streak (capped so
// it stays a nice bonus, never a runaway). Every 7th day also drops a rare seed
// (granted in FarmScene).
export function dailyReward(streak: number): { coins: number; xp: number } {
  const s = Math.min(Math.max(1, streak), 10);
  return { coins: 500 + s * 150, xp: 60 + s * 15 };
}

// Local-calendar day key, e.g. "2026-06-22".
export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Whole-day difference toKey - fromKey (0 = same day, 1 = consecutive).
export function dayGap(fromKey: string, toKey: string): number {
  const parse = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(toKey) - parse(fromKey)) / 86_400_000);
}
