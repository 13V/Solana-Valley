// Contribution scoring + pool allocation for the seasonal $SPROUT distribution.
//
// Pure, dependency-free. Two exports:
//   scoreFromSave(save) -> number   a non-negative contribution score for one save
//   allocate(pool, scored) -> [...]  split a fixed pool by score (largest remainder)
//
// SOFT-SCORE CAVEAT: these scores derive from the player's *client-authoritative*
// save (api/save.ts stores the jsonb verbatim), so every signal here is forgeable
// by a modified client until gameplay moves on-chain (roadmap M2/M3). The
// mitigation baked in below is two-fold:
//   1. DIMINISHING RETURNS — grindable/forgeable magnitudes (xp, earned,
//      harvested) go through sqrt/log10 so doubling a number does NOT double its
//      contribution; raw grind (or a forged big number) can't run away.
//   2. PER-SIGNAL CAPS — each term is individually clamped, so no single forged
//      field can dominate the whole score.
// Discovery + achievements are weighted highest because they reward *breadth of
// contribution, not hours*, and they are naturally bounded (19 plants + 5
// mutations, a fixed achievement/goal set). When stake moves on-chain, an
// on-chain stake/activity weight should multiply this score so the forgeable
// part can no longer dominate. Treat the output as relative, not money.

// --- per-term caps (in "score points") ---------------------------------------
// Discovery is intentionally NOT capped beyond its natural ceiling: 19 plants +
// 5 mutations = 24 discoveries × 10 = 240 max, which is the single largest
// honest contribution a player can make. Achievements/goals are likewise bounded
// by their fixed sets. The grindable terms are the ones that need hard caps.
const CAP_SKILLS    = 60;  // 6*sqrt(sumLevels): caps ~ sumLevels >= 100
const CAP_XP        = 90;  // 3*sqrt(xp):        caps ~ xp >= 900,000
const CAP_HARVESTED = 40;  // 2*sqrt(harvested): caps ~ harvested >= 400
const CAP_EARNED    = 8;   // 1*log10(1+earned): caps ~ earned >= 10^8

// --- helpers -----------------------------------------------------------------

// Coerce anything to a finite, non-negative number (forged/missing -> 0).
function num(v) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Length of an array-ish field, 0 if missing/not an array.
function len(v) {
  return Array.isArray(v) ? v.length : 0;
}

// Sum of the numeric values of an object map (e.g. skills: {farming: 5, ...}).
function sumValues(obj) {
  if (!obj || typeof obj !== 'object') return 0;
  let total = 0;
  for (const v of Object.values(obj)) total += num(v);
  return total;
}

function cap(value, max) {
  return value > max ? max : value;
}

/**
 * Compute a non-negative contribution score for a single save's `data` jsonb.
 * Every field is treated as optional (missing -> 0 / []). See the file header
 * for the weighting rationale and the soft-score caveat.
 */
export function scoreFromSave(save) {
  const d = save && typeof save === 'object' ? save : {};

  // Discovery + curated progress: weighted highest, naturally bounded.
  //   10 per discovered plant/mutation (24 possible -> max 240)
  //    8 per achievement
  //    4 per claimed goal
  const discovery =
    10 * (len(d.discPlants) + len(d.discMutations)) +
    8 * len(d.achievements) +
    4 * len(d.claimedGoals);

  // Skill investment: diminishing in total levels, capped.
  const skills = cap(6 * Math.sqrt(sumValues(d.skills)), CAP_SKILLS);

  // Grindable magnitudes: heavy diminishing returns + hard caps so a forged or
  // grinded number can't dominate.
  const xp        = cap(3 * Math.sqrt(num(d.xp)), CAP_XP);
  const harvested = cap(2 * Math.sqrt(num(d.harvested)), CAP_HARVESTED);
  const earned    = cap(1 * Math.log10(1 + num(d.earned)), CAP_EARNED);

  const score = discovery + skills + xp + harvested + earned;

  // Final guard: never NaN/negative.
  return Number.isFinite(score) && score > 0 ? score : 0;
}

/**
 * Split a fixed pool of base units proportionally by score, using the
 * largest-remainder method so the sum of credited values EXACTLY equals the pool
 * (no base-unit dust lost or created).
 *
 * @param {bigint} poolBaseUnits  total base units to distribute
 * @param {{wallet: string, score: number}[]} scored
 * @returns {{wallet: string, score: number, credited: string}[]}
 *          credited is base units as a string (BigInt -> string).
 */
export function allocate(poolBaseUnits, scored) {
  const pool = BigInt(poolBaseUnits);
  const rows = Array.isArray(scored) ? scored : [];

  // Total score (as a number; only used to derive integer shares of the pool).
  let totalScore = 0;
  for (const r of rows) totalScore += num(r && r.score);

  // Degenerate cases: no pool or no positive score -> everyone gets 0.
  if (pool <= 0n || totalScore <= 0) {
    return rows.map((r) => ({
      wallet: r.wallet,
      score: num(r && r.score),
      credited: '0',
    }));
  }

  // Scale scores to integer weights to do the split in pure BigInt. We multiply
  // by a large factor so fractional scores keep precision, then largest-
  // remainder rounds the leftover base units onto the highest remainders.
  const SCALE = 1_000_000n;
  const weights = rows.map((r) => {
    const s = num(r && r.score);
    return BigInt(Math.round((s / totalScore) * Number(SCALE)));
  });
  let totalWeight = 0n;
  for (const w of weights) totalWeight += w;

  // If rounding wiped every weight to 0 (shouldn't happen with the scale above),
  // fall back to all-zero rather than divide by zero.
  if (totalWeight <= 0n) {
    return rows.map((r) => ({
      wallet: r.wallet,
      score: num(r && r.score),
      credited: '0',
    }));
  }

  // Floor share for each wallet + remainder for largest-remainder rounding.
  const result = rows.map((r, i) => {
    const product = pool * weights[i];
    const credited = product / totalWeight;      // floor division
    const remainder = product % totalWeight;     // for ranking leftover units
    return {
      wallet: r.wallet,
      score: num(r && r.score),
      credited,                                  // BigInt for now
      remainder,
      hasScore: num(r && r.score) > 0,
    };
  });

  // Distribute the leftover base units (pool - sum of floors) one at a time to
  // the wallets with the largest remainders (ties broken by original order).
  let distributed = 0n;
  for (const row of result) distributed += row.credited;
  let leftover = pool - distributed;

  const order = result
    .map((row, i) => ({ i, remainder: row.remainder, hasScore: row.hasScore }))
    .filter((x) => x.hasScore) // never hand dust to a zero-score wallet
    .sort((a, b) => {
      if (b.remainder > a.remainder) return 1;
      if (b.remainder < a.remainder) return -1;
      return a.i - b.i;
    });

  let k = 0;
  while (leftover > 0n && order.length > 0) {
    result[order[k % order.length].i].credited += 1n;
    leftover -= 1n;
    k += 1;
  }

  return result.map((row) => ({
    wallet: row.wallet,
    score: row.score,
    credited: row.credited.toString(),
  }));
}
