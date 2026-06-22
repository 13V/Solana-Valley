-- Seasonal contribution-score distribution for the custodial $SPROUT rewards
-- system. Additive to rewards.sql — this depends on the public.rewards table
-- (and its credit semantics) already existing. Run rewards.sql first.
--
-- MODEL: capped-pool-by-share (NOT a fixed rate × coins).
--   A season has a FIXED pool of $SPROUT (base units). At distribution time we
--   compute each wallet's *contribution score* off-chain (see
--   scripts/lib/contribution.mjs — discovery/achievements weighted highest, with
--   per-signal caps + diminishing returns so a forged save can't dominate), then
--   split the pool PROPORTIONALLY by score. The pool is the cap: total credited
--   across all wallets equals the pool exactly (the script uses largest-remainder
--   rounding so no base-unit dust is lost). Because the share is relative, a
--   wallet's payout depends on everyone's contribution, not on an absolute coin
--   count — which means no fixed "rate" can be gamed by inflating one number.
--
--   This file owns the *ledger* side: it records the per-wallet allocations for a
--   season and credits each wallet's claimable balance in public.rewards, all in
--   ONE atomic transaction (distribute_season). The scoring/allocation math is
--   done in the ops script and passed in as a precomputed JSON array, so this RPC
--   is purely the trusted write: it never trusts a score it didn't store, and a
--   season can only ever be distributed once (status flips open → distributed).
--
-- Amounts are BASE UNITS (integer = whole tokens × 10^decimals), matching the
-- rest of the ledger — no floats touch a balance. Safe to re-run.

-- A reward season: a fixed pool to be split by contribution share.
create table if not exists public.seasons (
  id             bigint      generated always as identity primary key,
  label          text,                                   -- human label, e.g. "Season 1 — Spring"
  pool           numeric     not null,                   -- base units to distribute this season
  status         text        not null default 'open'
                 check (status in ('open', 'distributed')),
  created_at     timestamptz not null default now(),
  distributed_at timestamptz                             -- set when status flips to 'distributed'
);

-- Per-wallet allocation for a season: the score it earned and what it was
-- credited (base units). Append-only audit of how a pool was split.
create table if not exists public.season_scores (
  season_id  bigint      not null,
  wallet     text        not null,
  score      numeric     not null,                       -- contribution score (relative; not money)
  credited   numeric     not null,                       -- base units credited to this wallet
  created_at timestamptz default now(),
  primary key (season_id, wallet)
);

-- RLS on, NO policies: only the service role (which bypasses RLS) may touch
-- these. The browser never reads or writes seasons directly.
alter table public.seasons       enable row level security;
alter table public.season_scores enable row level security;

-- ---- distribution RPC (service-role only) -------------------------------
-- Atomic: a single function body is a single transaction, so either every
-- allocation is recorded + credited and the season is marked distributed, or
-- nothing changes. Security-definer; revoked from public, granted to
-- service_role only (a leaked anon key can never credit balances).
--
-- p_allocations is a JSON array of objects:
--   [{"wallet": "...", "score": 123.4, "credited": "5000000"}, ...]
-- where `credited` is base units (number or numeric-string both parse). The
-- caller (scripts/reward-season.mjs) is responsible for producing allocations
-- whose credited values sum to the season pool. The pool cap is ALSO enforced
-- in-DB here (not just by the caller): the sum of credited across allocations
-- may not exceed the locked season's pool, and no credited may be negative —
-- either raises and the whole txn rolls back. Returns the count applied.
create or replace function public.distribute_season(p_season_id bigint, p_allocations jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  s_status text;
  v_pool   numeric;   -- the locked season's pool (the in-DB cap)
  v_total  numeric;   -- sum of credited across all allocations
  v_neg    integer;   -- count of allocations with negative credited
  alloc    jsonb;
  n        integer := 0;
begin
  -- Verify the season exists and is still open. Lock the row so two concurrent
  -- distributions of the same season can't both proceed. Read the pool from the
  -- locked row so the cap check below uses the row we hold.
  select status, pool into s_status, v_pool
    from public.seasons where id = p_season_id for update;
  if not found then
    raise exception 'season % not found', p_season_id;
  end if;
  if s_status <> 'open' then
    raise exception 'season % is not open (status=%)', p_season_id, s_status;
  end if;

  -- Enforce the pool cap in-DB (not just trusting the caller): reject any
  -- negative credited, and reject allocations whose total exceeds the pool.
  -- Computed BEFORE applying anything, so a bad batch rolls back untouched.
  select count(*) into v_neg
    from jsonb_array_elements(p_allocations) elem
    where (elem ->> 'credited')::numeric < 0;
  if v_neg > 0 then
    raise exception 'allocations contain % negative credited value(s)', v_neg;
  end if;

  select coalesce(sum((elem ->> 'credited')::numeric), 0) into v_total
    from jsonb_array_elements(p_allocations) elem;
  if v_total > v_pool then
    raise exception 'allocations (%) exceed season pool (%)', v_total, v_pool;
  end if;

  -- Apply each allocation: record it, then credit the wallet's claimable.
  for alloc in select * from jsonb_array_elements(p_allocations)
  loop
    insert into public.season_scores (season_id, wallet, score, credited)
      values (
        p_season_id,
        alloc ->> 'wallet',
        (alloc ->> 'score')::numeric,
        (alloc ->> 'credited')::numeric
      );

    insert into public.rewards (wallet, claimable, updated_at)
      values (alloc ->> 'wallet', (alloc ->> 'credited')::numeric, now())
    on conflict (wallet) do update
      set claimable  = public.rewards.claimable + (alloc ->> 'credited')::numeric,
          updated_at = now();

    n := n + 1;
  end loop;

  -- Close the season so it can never be distributed twice.
  update public.seasons
    set status = 'distributed', distributed_at = now()
    where id = p_season_id;

  return n;
end; $$;

revoke execute on function public.distribute_season(bigint, jsonb) from public;
grant  execute on function public.distribute_season(bigint, jsonb) to service_role;
