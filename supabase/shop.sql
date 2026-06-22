-- Shared per-island seed shop: authoritative "how many bought this window" state.
--
-- The shop POOL (what's in stock) is computed client-side: a deterministic
-- per-(island, win) roll sized for a single player (it does NOT scale with the
-- number of players online — one island shares one player's worth of stock). This
-- table only tracks how many of each seed have been BOUGHT in a given window, and the
-- buy_seed() RPC increments that atomically while it's below the pool cap — so
-- the last unit can't be double-sold and late-joiners read the true remaining
-- count. `win` = floor(epoch_ms / RESTOCK_MS) (the 2-minute restock window).
-- (Column is `win`, not `window`, because window is a reserved word in Postgres.)
--
-- Run this in the Supabase SQL editor for the project that the app's anon key
-- points at (app/src/chain/supabase.ts). Safe to re-run.

create table if not exists public.shop_buys (
  island     integer     not null,
  win        bigint      not null,
  plant      text        not null,
  bought     integer     not null default 0,
  updated_at timestamptz not null default now(),
  primary key (island, win, plant)
);

-- RLS: anyone (anon) may READ shop state; writes happen only through the
-- security-definer RPC below (no direct insert/update/delete policy).
alter table public.shop_buys enable row level security;

drop policy if exists "shop_buys read" on public.shop_buys;
create policy "shop_buys read" on public.shop_buys
  for select using (true);

-- Atomic buy: bump bought by 1 only while it's below the pool cap. Returns the
-- new bought count on success, or -1 if the seed is sold out (at/over cap) or
-- the cap is invalid. SECURITY DEFINER so it can write past the read-only RLS.
-- This RPC is anon-callable, so it can't trust client-supplied p_win/p_cap: only
-- the current ±1 restock window is writable (no backfilling/forward-dating junk
-- rows) and p_cap is clamped to a sane ceiling far above real stock.
-- (120000 = RESTOCK_MS, the 2-minute window; matches `win` = floor(epoch_ms / RESTOCK_MS).)
create or replace function public.buy_seed(
  p_island integer,
  p_win    bigint,
  p_plant  text,
  p_cap    integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_bought integer;
  v_now_win  bigint;   -- the server's current restock window
begin
  -- Anon-callable: bound the client-supplied window and cap before writing.
  -- Only the current ±1 restock window is writable (no junk rows in arbitrary
  -- past/future windows). 120000 = RESTOCK_MS.
  v_now_win := floor(extract(epoch from now()) * 1000 / 120000)::bigint;
  if p_win < v_now_win - 1 or p_win > v_now_win + 1 then
    return -1; -- window out of range
  end if;

  -- Clamp the cap to a sane ceiling; real per-window stock is far below this.
  if p_cap > 100000 then
    return -1; -- implausible cap
  end if;

  if p_cap is null or p_cap < 1 then
    return -1; -- not in stock this window
  end if;

  insert into public.shop_buys (island, win, plant, bought, updated_at)
    values (p_island, p_win, p_plant, 1, now())
  on conflict (island, win, plant) do update
    set bought = public.shop_buys.bought + 1, updated_at = now()
    where public.shop_buys.bought < p_cap
  returning bought into new_bought;

  if new_bought is null then
    return -1; -- row existed and was already at the cap (sold out)
  end if;
  return new_bought;
end;
$$;

grant execute on function public.buy_seed(integer, bigint, text, integer) to anon, authenticated;

-- Optional housekeeping: prune rows from old windows so the table stays small.
-- (Run occasionally, or schedule with pg_cron.)
--   delete from public.shop_buys
--   where win < floor(extract(epoch from now()) * 1000 / 120000) - 30;
