// Shared rarity + search filter bar for the Shop and Seeds panels. With 196
// plants the lists got long; this lets players narrow by rarity or name.
import type { Plant, Rarity } from '../game/economy';

export function matchesFilter(p: Plant, rarity: Rarity | 'All', q: string): boolean {
  if (rarity !== 'All' && p.rarity !== rarity) return false;
  if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false;
  return true;
}

export function RarityFilterBar({
  rarity,
  setRarity,
  q,
  setQ,
  rarities,
  colorOf,
}: {
  rarity: Rarity | 'All';
  setRarity: (r: Rarity | 'All') => void;
  q: string;
  setQ: (s: string) => void;
  rarities: readonly Rarity[];
  colorOf: (r: Rarity) => string;
}) {
  const chip = (active: boolean, color?: string) =>
    ({
      fontSize: 11,
      padding: '2px 7px',
      borderRadius: 999,
      opacity: active ? 1 : 0.55,
      fontWeight: active ? 700 : 400,
      color,
      cursor: 'pointer',
    }) as const;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '0 4px 6px', alignItems: 'center' }}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search…"
        style={{ flex: '1 1 110px', minWidth: 80, padding: '3px 7px', borderRadius: 6, fontSize: 12 }}
      />
      <button className="btn sm" style={chip(rarity === 'All')} onClick={() => setRarity('All')}>
        All
      </button>
      {rarities.map((r) => (
        <button key={r} className="btn sm" style={chip(rarity === r, colorOf(r))} onClick={() => setRarity(r)}>
          {r}
        </button>
      ))}
    </div>
  );
}
