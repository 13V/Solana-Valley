-- Custodial reward ledger: how much $SPROUT each wallet may CLAIM out of the
-- treasury, and an append-only log of payouts.
--
-- MODEL (see docs/REWARDS.md). The treasury is funded off-chain by *real
-- revenue* (pump.fun creator fees → buy-back → treasury). This ledger only
-- decides each wallet's SHARE; the actual token transfer is signed server-side
-- by /api/claim. Amounts are stored in the token's BASE UNITS (integer, i.e.
-- whole-token × 10^decimals) so there is never any float rounding on a payout.
--
-- A claim is two-phase so it can never double-pay or be raced:
--   reserve_claim()  moves claimable → pending (atomic, one in-flight at a time)
--   <on-chain transfer signed by the treasury>
--   finalize_claim() pending → claimed + logs the tx     (transfer succeeded)
--   cancel_claim()   pending → claimable (refund)         (transfer failed)
--
-- Run this in the Supabase SQL editor for the project the app's anon key points
-- at (app/src/chain/supabase.ts). Safe to re-run.

create table if not exists public.rewards (
  wallet     text        primary key,
  claimable  numeric     not null default 0,  -- base units a wallet may claim now
  claimed    numeric     not null default 0,  -- base units already paid out (lifetime)
  pending    numeric     not null default 0,  -- base units reserved by an in-flight claim
  pending_at timestamptz,                     -- when `pending` was reserved (stuck-claim visibility)
  updated_at timestamptz not null default now()
);

-- Append-only audit of every successful payout (one row per finalized claim).
create table if not exists public.reward_claims (
  id         bigint      generated always as identity primary key,
  wallet     text        not null,
  amount     numeric     not null,            -- base units paid in this claim
  signature  text        not null,            -- the Solana tx signature
  created_at timestamptz not null default now()
);

-- RLS on, NO policies: only the service role (which bypasses RLS, used by the
-- /api functions) may read or write. The browser never touches these tables
-- directly — it goes through wallet-signed /api/rewards and /api/claim.
alter table public.rewards       enable row level security;
alter table public.reward_claims enable row level security;

-- ---- claim RPCs (service-role only) -------------------------------------
-- All security-definer. We REVOKE from public and GRANT only to service_role so
-- a leaked anon key can never call finalize without actually paying.

-- Credit (or top up) a wallet's claimable balance. Called by the season/reward
-- crediting job (server-side, service key). p_amount is in BASE UNITS.
create or replace function public.credit_reward(p_wallet text, p_amount numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare new_claimable numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  insert into public.rewards (wallet, claimable, updated_at)
    values (p_wallet, p_amount, now())
  on conflict (wallet) do update
    set claimable = public.rewards.claimable + p_amount, updated_at = now()
  returning claimable into new_claimable;
  return new_claimable;
end; $$;

-- Reserve the whole claimable balance for an in-flight payout. Returns the
-- reserved amount (base units) on success, 0 if there's nothing to claim, or -1
-- if a claim is already in progress for this wallet.
create or replace function public.reserve_claim(p_wallet text)
returns numeric language plpgsql security definer set search_path = public as $$
declare amount numeric;
begin
  update public.rewards
    set pending = claimable, claimable = 0, pending_at = now(), updated_at = now()
    where wallet = p_wallet and claimable > 0 and pending = 0
  returning pending into amount;
  if amount is not null then return amount; end if;
  -- Distinguish "already in progress" (pending>0) from "nothing to claim".
  if exists (select 1 from public.rewards where wallet = p_wallet and pending > 0) then
    return -1;
  end if;
  return 0;
end; $$;

-- Finalize a reserved claim after the on-chain transfer confirmed: move pending
-- → claimed and append the payout to the log. Returns lifetime claimed total.
create or replace function public.finalize_claim(p_wallet text, p_signature text)
returns numeric language plpgsql security definer set search_path = public as $$
declare amount numeric; total numeric;
begin
  select pending into amount from public.rewards where wallet = p_wallet;
  if amount is null or amount <= 0 then
    raise exception 'no pending claim to finalize';
  end if;
  update public.rewards
    set claimed = claimed + amount, pending = 0, pending_at = null, updated_at = now()
    where wallet = p_wallet
  returning claimed into total;
  insert into public.reward_claims (wallet, amount, signature)
    values (p_wallet, amount, p_signature);
  return total;
end; $$;

-- Cancel a reserved claim (the transfer failed): refund pending → claimable.
-- Returns the restored claimable balance.
create or replace function public.cancel_claim(p_wallet text)
returns numeric language plpgsql security definer set search_path = public as $$
declare restored numeric;
begin
  update public.rewards
    set claimable = claimable + pending, pending = 0, pending_at = null, updated_at = now()
    where wallet = p_wallet
  returning claimable into restored;
  return coalesce(restored, 0);
end; $$;

revoke execute on function public.credit_reward(text, numeric)   from public;
revoke execute on function public.reserve_claim(text)            from public;
revoke execute on function public.finalize_claim(text, text)     from public;
revoke execute on function public.cancel_claim(text)             from public;
grant  execute on function public.credit_reward(text, numeric)   to service_role;
grant  execute on function public.reserve_claim(text)            to service_role;
grant  execute on function public.finalize_claim(text, text)     to service_role;
grant  execute on function public.cancel_claim(text)             to service_role;
