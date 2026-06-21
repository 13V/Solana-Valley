-- On-demand "redeem game items for $SPROUT" pool, with a HARD CAP so it can
-- never drain the treasury. Additive to rewards.sql — this depends on the
-- public.rewards table (and its credit semantics) already existing. Run
-- rewards.sql first.
--
-- MODEL: capped daily budget with a draining, floating rate (NOT a fixed
--   rate × item value forever).
--   Players may redeem items for $SPROUT at ANY time, but every payout draws
--   from a fixed DAILY budget (base units per UTC day) that is only refilled by
--   the operator out of real revenue. Three things bound the spend:
--     1. daily_budget       — the global cap: total base units credited per UTC
--                             day can never exceed this, no matter the demand.
--     2. wallet_daily_cap   — the per-wallet cap: one actor can't vacuum the day.
--     3. a floating rate     — the multiplier floats DOWN as the budget drains
--                             (mult = remaining / daily_budget, clamped to
--                             [rate_floor_bps/10000, 1.0]), so the more of the
--                             day's budget is already gone, the less each
--                             further coin of item value pays out. This makes
--                             the budget self-throttling rather than first-come-
--                             first-served-then-cliff.
--   Net effect: total payout per day is hard-capped at daily_budget, and no
--   single wallet can take more than wallet_daily_cap — the pool cannot drain
--   the treasury.
--
--   This file owns the *ledger* side. A successful redeem CREDITS the wallet's
--   claimable balance in public.rewards (exactly like credit_reward /
--   distribute_season do); the player then withdraws through the EXISTING claim
--   flow (reserve_claim → on-chain transfer → finalize_claim in rewards.sql).
--   Redemption never moves tokens itself.
--
-- Amounts are BASE UNITS (integer = whole tokens × 10^decimals), matching the
-- rest of the ledger — no floats touch a balance (the floating rate is applied
-- and then floor()'d to an integer base-unit amount). Safe to re-run.

-- ---- config (singleton) -------------------------------------------------
-- One operator-controlled config row. id is pinned to 1 so there is exactly one.
create table if not exists public.redemption_config (
  id              integer primary key default 1 check (id = 1),
  base_rate       numeric not null default 0,     -- $SPROUT BASE UNITS credited per 1 coin of item value (0 = effectively off)
  daily_budget    numeric not null default 0,     -- global cap: max total base units redeemable per UTC day
  wallet_daily_cap numeric not null default 0,    -- per-wallet cap: max base units one wallet can redeem per UTC day
  rate_floor_bps  integer not null default 10000, -- 10000 = FLAT rate (simple item→$SPROUT); lower it (<10000) to make the rate drain with the daily budget instead
  enabled         boolean not null default false  -- master switch (off by default)
);

-- Seed the singleton with safe defaults (disabled). Re-run leaves it untouched.
insert into public.redemption_config (id) values (1) on conflict do nothing;

-- ---- daily accounting ---------------------------------------------------
-- Global base units already redeemed for a given UTC day.
create table if not exists public.redemption_days (
  day   date primary key,
  spent numeric not null default 0
);

-- Per-wallet base units already redeemed for a given UTC day.
create table if not exists public.redemption_wallet_days (
  day    date    not null,
  wallet text    not null,
  spent  numeric not null default 0,
  primary key (day, wallet)
);

-- Append-only audit of every redemption (one row per successful redeem).
create table if not exists public.redemption_log (
  id         bigint      generated always as identity primary key,
  wallet     text        not null,
  day        date        not null,
  item_value numeric     not null,            -- item value (in coins) submitted
  credited   numeric     not null,            -- base units actually credited
  rate_mult  numeric     not null,            -- the floating multiplier applied
  created_at timestamptz not null default now()
);

-- RLS on, NO policies: only the service role (which bypasses RLS, used by the
-- /api functions with the service key) may read or write. The browser never
-- touches these tables directly — redemption requests go through a wallet-signed
-- /api endpoint, which validates the item server-side before calling the RPC.
alter table public.redemption_config      enable row level security;
alter table public.redemption_days        enable row level security;
alter table public.redemption_wallet_days enable row level security;
alter table public.redemption_log         enable row level security;

-- ---- redeem RPC (service-role only) -------------------------------------
-- Atomic + concurrency-safe: the whole body runs in one transaction. It locks
-- today's global row and the wallet's row FOR UPDATE before reading remaining
-- budget, so two concurrent redeems can never both spend the last of the cap.
-- Security-definer; revoked from public, granted to service_role only (a leaked
-- anon key can never credit balances).
--
--   p_wallet     — the wallet to credit.
--   p_item_value — the value (in coins) of the item(s) being redeemed; the
--                  caller (/api) is responsible for verifying this server-side.
-- Returns the base units credited to public.rewards.claimable, or 0 when
-- disabled / nothing to credit / fully capped for the day.
create or replace function public.redeem_items(p_wallet text, p_item_value numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  cfg               public.redemption_config%rowtype;
  v_day             date;
  v_global          numeric;   -- base units already spent globally today
  v_wallet_spent    numeric;   -- base units already spent by this wallet today
  v_remaining       numeric;   -- budget left globally today
  v_wallet_remaining numeric;  -- budget left for this wallet today
  v_mult            numeric;   -- floating rate multiplier in [floor, 1.0]
  v_gross           numeric;   -- uncapped credit at the current rate
  v_credited        numeric;   -- final credit after all caps (what we pay)
begin
  -- Guard the input.
  if p_item_value is null or p_item_value <= 0 then
    return 0;
  end if;

  -- Load config. If the pool is off or misconfigured, nothing is redeemable.
  select * into cfg from public.redemption_config where id = 1;
  if not found or not cfg.enabled or cfg.base_rate <= 0 or cfg.daily_budget <= 0 then
    return 0;
  end if;

  v_day := (now() at time zone 'utc')::date;

  -- Ensure today's global row exists, then lock it FOR UPDATE and read spent.
  -- (insert-then-locking-select: a plain upsert can't return a row locked for
  -- this txn, so we create-if-missing then SELECT ... FOR UPDATE.)
  insert into public.redemption_days (day) values (v_day) on conflict (day) do nothing;
  select spent into v_global from public.redemption_days where day = v_day for update;

  -- Same pattern for this wallet's row today: create-if-missing, then lock+read.
  insert into public.redemption_wallet_days (day, wallet)
    values (v_day, p_wallet) on conflict (day, wallet) do nothing;
  select spent into v_wallet_spent
    from public.redemption_wallet_days where day = v_day and wallet = p_wallet for update;

  -- How much budget is left today, globally and for this wallet.
  v_remaining        := cfg.daily_budget - v_global;
  v_wallet_remaining := cfg.wallet_daily_cap - v_wallet_spent;
  if v_remaining <= 0 or v_wallet_remaining <= 0 then
    return 0;  -- day's budget (or this wallet's cap) is exhausted
  end if;

  -- Floating multiplier: drains with the budget. Clamp to [floor, 1.0].
  -- remaining can't exceed budget so the ratio is already ≤ 1, but least(,1.0)
  -- defends against any config drift.
  v_mult := least(1.0, greatest(cfg.rate_floor_bps / 10000.0, v_remaining / cfg.daily_budget));

  -- Gross credit at the current rate, floored to whole base units.
  v_gross := floor(p_item_value * cfg.base_rate * v_mult);

  -- Never exceed either remaining cap.
  v_credited := least(v_gross, v_remaining, v_wallet_remaining);
  if v_credited <= 0 then
    return 0;
  end if;

  -- Spend the budget (rows are already locked above for this txn).
  update public.redemption_days
    set spent = spent + v_credited
    where day = v_day;
  update public.redemption_wallet_days
    set spent = spent + v_credited
    where day = v_day and wallet = p_wallet;

  -- Credit the EXISTING rewards ledger: the player withdraws via the normal
  -- claim flow (reserve_claim → transfer → finalize_claim) in rewards.sql.
  insert into public.rewards (wallet, claimable, updated_at)
    values (p_wallet, v_credited, now())
  on conflict (wallet) do update
    set claimable = public.rewards.claimable + v_credited, updated_at = now();

  -- Audit it.
  insert into public.redemption_log (wallet, day, item_value, credited, rate_mult)
    values (p_wallet, v_day, p_item_value, v_credited, v_mult);

  return v_credited;
end; $$;

revoke execute on function public.redeem_items(text, numeric) from public;
grant  execute on function public.redeem_items(text, numeric) to service_role;
