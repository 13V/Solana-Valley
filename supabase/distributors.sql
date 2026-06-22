-- Trustless merkle reward distributor: the PUBLIC mirror of a season's on-chain
-- distribution (see programs/reward-distributor, scripts/merkle-season.mjs, and
-- docs/REWARDS.md).
--
-- MODEL: instead of the treasury signing each payout (the custodial path in
-- rewards.sql / seasons.sql), a season's allocations are committed to a single
-- merkle ROOT that is published on-chain in a distributor account. Each wallet
-- claims its own tokens directly from that account by presenting its leaf
-- (index, wallet, amount) + a merkle proof; the program verifies the proof
-- against the root and pays out. The treasury never signs an individual claim.
--
-- This file owns the OFF-CHAIN mirror of that data so the browser can look up its
-- own proof and call the on-chain claim itself:
--   * distributors      — one row per season: the root + total + (once created)
--                         the on-chain distributor pubkey & creation tx.
--   * distributor_claims — one row per wallet: its leaf index, amount, and the
--                         merkle proof (a JSON array of hex sibling hashes).
-- Amounts are BASE UNITS (integer = whole tokens × 10^decimals), matching the
-- rest of the ledger and the on-chain program — no floats touch an amount.
--
-- PUBLIC-READ, by design. A merkle proof grants NOTHING on its own: a wallet can
-- only claim by also signing the on-chain claim instruction with its own key, and
-- the proof merely demonstrates membership in the already-public root. So both
-- tables carry a `for select using (true)` policy — exactly like shop.sql — to let
-- the browser (anon key) fetch its proof directly, with no server round-trip.
-- There is intentionally NO insert/update/delete policy: only the service role
-- (which bypasses RLS), used by scripts/merkle-season.mjs, may publish a tree.
--
-- Run this in the Supabase SQL editor for the project the app's anon key points
-- at (app/src/chain/supabase.ts). Safe to re-run.

-- One published distributor per season. `distributor_pubkey` and `tx` stay null
-- until the on-chain distributor account is created (scripts/merkle-season.mjs
-- set-onchain backfills them, after which the client knows which distributor to
-- claim against).
create table if not exists public.distributors (
  season_id          bigint      generated always as identity primary key,
  label              text,                                  -- human label, e.g. "Season 1 — Spring"
  mint               text,                                  -- the $SPROUT mint these tokens are paid in
  root               text        not null,                  -- merkle root (hex) committed on-chain
  total              numeric     not null,                  -- base units across all leaves
  decimals           smallint    not null default 6,        -- mint decimals, so clients format any-decimals mints correctly
  distributor_pubkey text,                                  -- on-chain distributor account (null until created)
  tx                 text,                                  -- the create tx signature (null until created)
  created_at         timestamptz not null default now()
);

-- Additive migration for an EXISTING install (the create-table above only runs on
-- a fresh DB). Both are guarded so re-running this file is always safe.
alter table public.distributors add column if not exists decimals smallint not null default 6;

-- Per-wallet leaf + proof for a season. `idx` is the wallet's leaf index in the
-- tree; `proof` is a JSON array of hex strings (sibling hashes leaf→root) that
-- verifies `(idx, wallet, amount)` against the season's root.
create table if not exists public.distributor_claims (
  season_id  bigint      not null,
  wallet     text        not null,
  idx        bigint      not null,                          -- leaf index in the merkle tree (on-chain index is u64)
  amount     numeric     not null,                          -- base units claimable by this wallet
  proof      jsonb       not null,                          -- ["<hex>", ...] merkle proof (sibling hashes)
  created_at timestamptz default now(),
  primary key (season_id, wallet)
);

-- Additive migration for an EXISTING install where idx was created as integer
-- (the on-chain index is u64). Widening integer -> bigint is lossless, and the
-- alter is a no-op if idx is already bigint, so re-running this file is safe.
alter table public.distributor_claims alter column idx type bigint;

-- RLS on. Merkle proofs are PUBLIC data (they grant nothing without the wallet's
-- own on-chain signature against the already-public root), so anyone (anon) may
-- READ both tables — the browser fetches its own proof directly. There is NO
-- insert/update/delete policy: a tree is published only via the service role
-- (which bypasses RLS) in scripts/merkle-season.mjs.
alter table public.distributors       enable row level security;
alter table public.distributor_claims enable row level security;

drop policy if exists "distributors read" on public.distributors;
create policy "distributors read" on public.distributors
  for select using (true);

drop policy if exists "distributor_claims read" on public.distributor_claims;
create policy "distributor_claims read" on public.distributor_claims
  for select using (true);
