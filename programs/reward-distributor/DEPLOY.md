# Reward distributor — deploy & go-live runbook

The trustless merkle distributor (`src/lib.rs`) is written. It can't be
built/deployed from the web sandbox (no Rust/Solana toolchain, no key custody),
so this is the exact path to take it live on a machine that has the toolchain.
Order matters.

This program replaces the custodial reward path (`api/claim.ts`, where a hot
treasury key signs every payout): a season's allocations are committed to one
merkle **root**, funded once, and each wallet **self-claims** against the root.
No hot wallet signs an individual claim. See `docs/REWARDS.md`.

## 0. Prereqs
- Rust + Solana CLI + Anchor (`avm install latest`) — https://www.anchor-lang.com/docs/installation
- A funded deployer/authority keypair (`solana-keygen new`; airdrop on devnet).
- The **`$SPROUT`** mint address (already live — it's the CA shown in-game).
- The season's allocations (wallet → base-unit amount), server-verified — these
  are what get hashed into the root. NEVER trust the client coin balance.

## 1. Build + deploy the program (devnet first)
```bash
cd programs/reward-distributor
anchor build
# grab the generated program id and put it back in the source + Anchor.toml:
anchor keys list
#   reward_distributor: <PROGRAM_ID>
# -> replace the placeholder in declare_id!("Distr1bute...") with <PROGRAM_ID>, rebuild:
anchor build
anchor deploy --provider.cluster devnet
# commit the generated IDL (target/idl/reward_distributor.json) into the repo for the client.
```

## 2. Build the season tree (off-chain)
The leaf/node hashing is **canonical** and shared three ways — the Rust program
(`claim` verify), the JS builder (`scripts/lib/merkle.mjs`), and the client claim
encoder MUST agree byte-for-byte or proofs won't verify:
```
leaf = keccak256( u64le(index) ++ claimant(32) ++ u64le(amount) )   # 48-byte preimage
node = keccak256( min(a,b) ++ max(a,b) )                            # sorted pair, 64-byte
```
A fixed **test vector** is asserted in both `scripts/lib/merkle.mjs` and a comment
at the top of `src/lib.rs` — `leaf(index=0, claimant=1111…1111, amount=1000000)`
== `6b51e580de79f585468ef94881739028002088fc2747567c31ca24ff72087597`. If that
ever changes, the hashing drifted and both sides must be fixed back into
agreement.

Build + publish the tree with `scripts/merkle-season.mjs` (service role; uses
`scripts/lib/merkle.mjs`):
- computes the `root` and `total` (sum of all leaves, base units),
- writes one row to Supabase **`distributors`** (root + total + label + mint),
- writes one row per wallet to Supabase **`distributor_claims`** (`idx`, `amount`,
  and the JSON `proof` — the sibling hashes leaf→root). These are PUBLIC-READ by
  design (`supabase/distributors.sql`): a proof grants nothing without the
  wallet's own on-chain signature against the already-public root, so the browser
  fetches its proof directly with no server round-trip.

## 3. Create + fund the on-chain distributor (once per season)
Call `new_distributor(season_id, root, total, clawback_after)`:
- `season_id` — the season's id (matches the `distributors` row; namespaces the
  `Distributor` PDA per authority).
- `root` — the 32-byte merkle root (hex-decoded from step 2).
- `total` — base units to fund; pulled from `funder_token` (the authority's
  `$SPROUT` ATA) into the program-owned **vault** PDA up front.
- `clawback_after` — unix ts after which the authority may sweep the unclaimed
  remainder; pass `0` to disable clawback entirely.

Accounts (order): `authority` (signer, mut), `distributor` (init PDA), `vault`
(init token acct, authority = distributor PDA), `reward_mint`, `funder_token`
(mut, authority's `$SPROUT` ATA), `token_program`, `system_program`, `rent`.

Then backfill the on-chain pubkey + create tx into the `distributors` row
(`scripts/merkle-season.mjs` set-onchain) so the client knows which distributor
to claim against. Do this with a small TS script using the IDL, or `anchor run`.

## 4. How a wallet claims (`claim`)
The browser fetches its `distributor_claims` row (`idx`, `amount`, `proof`),
hex-decodes the proof to `Vec<[u8;32]>`, and calls
`claim(index, amount, proof)` signed by the connected wallet:
- the program recomputes the leaf, folds the proof against `distributor.root`
  (sorted-pair rule) and rejects on mismatch (`InvalidProof`);
- it `init`s a fresh `ClaimStatus` PDA — a **second** claim by the same wallet
  fails on the already-in-use account (the double-claim guard) before any
  transfer happens;
- it transfers `amount` from the vault to the wallet's `$SPROUT` ATA (the
  Distributor PDA signs for the vault) and bumps `claimed_amount` / `claimed_count`.

Accounts (order — the client encodes to this exactly): `claimant` (signer, mut),
`distributor` (mut), `claim_status` (init PDA), `vault` (mut), `claimant_token`
(mut, claimant's `$SPROUT` ATA), `token_program`, `system_program`.

## 5. Clawback (after the deadline)
Call `clawback()` as the authority once `clawback_after` has passed (and was
non-zero). It sweeps the **entire remaining** vault balance to `authority_token`
(the Distributor PDA signs). Fails early with `ClawbackNotReady` if clawback is
disabled or the deadline hasn't passed.

Accounts (order): `authority` (signer, mut, `has_one` on the distributor),
`distributor` (mut), `vault` (mut), `authority_token` (mut), `token_program`.

## 6. Client integration (front-end)
Add deps (`@coral-xyz/anchor`, `@solana/spl-token`) and create
`app/src/chain/distributor.ts` using the committed IDL:
- `fetchClaim(wallet)` — read the wallet's `distributor_claims` row from Supabase
  (anon key, public-read) for the active season.
- `claimSeason()` — build/sign the `claim` ix with the connected wallet (reuse the
  existing wallet adapter), hex-decoding the stored proof.
- Gate everything behind env: `VITE_DISTRIBUTOR_PROGRAM_ID`, `VITE_SPROUT_MINT`.
  When unset, the rewards UI keeps using the custodial claim (`RewardsClaim.tsx`)
  and the live game is unaffected.

## 7. Before mainnet
- [ ] **Audit** the program (proof verification, vault drain, account
      substitution, the `init` double-claim guard, clawback gating).
- [ ] Re-verify the leaf/node test vector matches across Rust + `scripts/lib/merkle.mjs`.
- [ ] Sanity-check the published `total` equals the sum of leaf `amount`s and the
      funded vault balance.
- [ ] Fund/secure the authority keypair; decide a `clawback_after` policy per season.
- [ ] Switch `--provider.cluster mainnet`, redeploy, set mainnet env.

## What's done vs. pending
- ✅ Distributor program (`src/lib.rs`): `new_distributor` (create + fund),
  `claim` (proof-verify + self-pay + double-claim guard), `clawback`.
- ⏳ Everything in steps 1–7 (needs a toolchain, the season tree publisher
  `scripts/merkle-season.mjs`, the Supabase tables `supabase/distributors.sql`,
  and the client module).

The canonical merkle contract (leaf/node hashing + the locked test vector) is the
one hard invariant: the Rust verify, `scripts/lib/merkle.mjs`, and the client
claim encoder must stay byte-for-byte identical, or no proof will verify.
