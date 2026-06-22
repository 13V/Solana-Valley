// Solana Valley — trustless merkle reward distributor (see docs/REWARDS.md).
//
// The custodial reward path (api/claim.ts) has a hot treasury key sign every
// payout. This program removes that: a season's allocations are committed to a
// single merkle ROOT published on-chain in a `Distributor` account, funded once
// with the season's total $SPROUT. Each wallet then *self-claims* its tokens by
// presenting its leaf (index, claimant, amount) + a merkle proof. The program
// verifies the proof against the root and pays straight out of a program-owned
// vault — no hot wallet signs an individual claim, ever.
//
// Trust model: the program guarantees (a) only leaves that are members of the
// published root can claim, (b) each wallet claims at most once (a fresh
// `ClaimStatus` PDA is `init`-ed per claim — a second claim hits "already in
// use" and fails), and (c) nobody but the configured authority can recover the
// vault, and only after `clawback_after`. It does NOT decide *who deserves
// what* — that is the off-chain season accounting (server-verified contribution
// signals, see docs/REWARDS.md) baked into the root before it is published.
//
// CANONICAL MERKLE CONTRACT — must match scripts/lib/merkle.mjs byte-for-byte
// (the builder) and the client claim encoder, or proofs won't verify:
//   leaf = keccak256( u64le(index) ++ claimant(32) ++ u64le(amount) )   // 48-byte preimage
//   node = keccak256( min(a,b) ++ max(a,b) )                            // sorted pair, 64-byte
//   proof folds leaf -> root with the same sorted rule (no position bits).
// Sorted-pair hashing means a 48-byte leaf preimage can never collide with a
// 64-byte node by construction.
//
// LEAF TEST VECTOR (locks the encoding; mirrored in scripts/lib/merkle.mjs):
//   leaf(index=0, claimant=11111111111111111111111111111111, amount=1000000)
//     == 6b51e580de79f585468ef94881739028002088fc2747567c31ca24ff72087597
// If this stops holding in either place, the hashing drifted and BOTH the Rust
// verify and the JS builder/client must be fixed back into agreement.
//
// NOTE: not yet built/deployed in CI. `declare_id!` is a placeholder — replace
// with the real program id after `anchor build && anchor deploy`. See DEPLOY.md.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("Distr1bute1111111111111111111111111111111111");

#[program]
pub mod reward_distributor {
    use super::*;

    /// Create + fund a season's distributor. `season_id` namespaces the PDA so
    /// one authority can run many seasons; `root` is the merkle root committed to
    /// (hex of these 32 bytes is what gets published to Supabase `distributors`);
    /// `total` is the sum of every leaf's amount, pulled from `funder_token` into
    /// the program-owned vault up front. `clawback_after` is a unix timestamp
    /// after which the authority may sweep the unclaimed remainder (0 = never).
    pub fn new_distributor(
        ctx: Context<NewDistributor>,
        season_id: u64,
        root: [u8; 32],
        total: u64,
        clawback_after: i64,
    ) -> Result<()> {
        require!(total > 0, RewardError::ZeroTotal);

        let d = &mut ctx.accounts.distributor;
        d.authority = ctx.accounts.authority.key();
        d.mint = ctx.accounts.reward_mint.key();
        d.root = root;
        d.total = total;
        d.claimed_amount = 0;
        d.claimed_count = 0;
        d.clawback_after = clawback_after;
        d.season_id = season_id;
        d.bump = ctx.bumps.distributor;
        d.vault_bump = ctx.bumps.vault;

        // Fund the vault: authority -> vault (authority signs as the funder).
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.funder_token.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            total,
        )?;
        Ok(())
    }

    /// Self-claim: a wallet proves (index, amount) is in the published root and
    /// receives `amount` from the vault. The fresh `ClaimStatus` PDA (init, not
    /// init_if_needed) is the double-claim guard — a second claim by the same
    /// wallet fails on the already-in-use account before any transfer happens.
    pub fn claim(ctx: Context<Claim>, index: u64, amount: u64, proof: Vec<[u8; 32]>) -> Result<()> {
        let distributor = &ctx.accounts.distributor;

        // leaf = keccak256( u64le(index) ++ claimant(32) ++ u64le(amount) ).
        let leaf = keccak::hashv(&[
            &index.to_le_bytes(),
            ctx.accounts.claimant.key().as_ref(),
            &amount.to_le_bytes(),
        ])
        .0;

        // Defensive CU cap: a valid proof is at most tree-height siblings, so a
        // 32-deep proof already covers 2^32 leaves. Bound it before folding so a
        // malicious oversized proof can't burn compute.
        require!(proof.len() <= 32, RewardError::ProofTooLong);

        // Fold the proof with sorted-pair hashing: node = keccak256(min ++ max).
        let mut computed = leaf;
        for p in proof.iter() {
            computed = if computed <= *p {
                keccak::hashv(&[&computed, p]).0
            } else {
                keccak::hashv(&[p, &computed]).0
            };
        }
        require!(computed == distributor.root, RewardError::InvalidProof);

        // Record the claim (PDA was just init-ed; this can only run once/wallet).
        let now = Clock::get()?.unix_timestamp;
        let claim_status = &mut ctx.accounts.claim_status;
        claim_status.claimant = ctx.accounts.claimant.key();
        claim_status.amount = amount;
        claim_status.claimed_at = now;
        claim_status.bump = ctx.bumps.claim_status;

        // Pay out of the vault. The Distributor PDA is the vault authority.
        let authority_key = distributor.authority;
        let season_bytes = distributor.season_id.to_le_bytes();
        let bump = distributor.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"distributor",
            authority_key.as_ref(),
            season_bytes.as_ref(),
            &[bump],
        ]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.claimant_token.to_account_info(),
                    authority: ctx.accounts.distributor.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        // Running totals (checked — these are public accounting).
        let distributor = &mut ctx.accounts.distributor;
        distributor.claimed_amount = distributor
            .claimed_amount
            .checked_add(amount)
            .ok_or(RewardError::MathOverflow)?;
        distributor.claimed_count = distributor
            .claimed_count
            .checked_add(1)
            .ok_or(RewardError::MathOverflow)?;
        Ok(())
    }

    /// After `clawback_after`, the authority sweeps the entire remaining vault
    /// balance back to itself (covers unclaimed allocations / dust). Disabled
    /// while `clawback_after == 0` or before that timestamp.
    pub fn clawback(ctx: Context<Clawback>) -> Result<()> {
        let distributor = &ctx.accounts.distributor;
        let now = Clock::get()?.unix_timestamp;
        require!(
            distributor.clawback_after != 0 && now >= distributor.clawback_after,
            RewardError::ClawbackNotReady
        );

        let remaining = ctx.accounts.vault.amount;
        if remaining > 0 {
            let authority_key = distributor.authority;
            let season_bytes = distributor.season_id.to_le_bytes();
            let bump = distributor.bump;
            let signer_seeds: &[&[&[u8]]] = &[&[
                b"distributor",
                authority_key.as_ref(),
                season_bytes.as_ref(),
                &[bump],
            ]];
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.authority_token.to_account_info(),
                        authority: ctx.accounts.distributor.to_account_info(),
                    },
                    signer_seeds,
                ),
                remaining,
            )?;
        }
        Ok(())
    }
}

// ---- accounts ----------------------------------------------------------------

#[account]
pub struct Distributor {
    pub authority: Pubkey,    // can create + (after the deadline) clawback
    pub mint: Pubkey,         // the $SPROUT mint paid out
    pub root: [u8; 32],       // merkle root committed for this season
    pub total: u64,           // base units funded into the vault
    pub claimed_amount: u64,  // base units claimed so far
    pub claimed_count: u64,   // number of successful claims
    pub clawback_after: i64,  // unix ts; 0 = clawback disabled
    pub season_id: u64,       // namespaces the PDA per authority
    pub bump: u8,
    pub vault_bump: u8,
}
impl Distributor {
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 1 + 1;
}

#[account]
pub struct ClaimStatus {
    pub claimant: Pubkey,
    pub amount: u64,
    pub claimed_at: i64,
    pub bump: u8,
}
impl ClaimStatus {
    pub const SIZE: usize = 8 + 32 + 8 + 8 + 1;
}

#[derive(Accounts)]
#[instruction(season_id: u64)]
pub struct NewDistributor<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = Distributor::SIZE,
        seeds = [b"distributor", authority.key().as_ref(), season_id.to_le_bytes().as_ref()],
        bump
    )]
    pub distributor: Account<'info, Distributor>,
    /// Program-owned vault token account, authority = the distributor PDA.
    #[account(
        init,
        payer = authority,
        seeds = [b"vault", distributor.key().as_ref()],
        bump,
        token::mint = reward_mint,
        token::authority = distributor
    )]
    pub vault: Account<'info, TokenAccount>,
    pub reward_mint: Account<'info, Mint>,
    /// The authority's $SPROUT account the season total is pulled from.
    #[account(
        mut,
        constraint = funder_token.mint == reward_mint.key() @ RewardError::WrongMint,
        constraint = funder_token.owner == authority.key() @ RewardError::WrongOwner
    )]
    pub funder_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub claimant: Signer<'info>,
    #[account(
        mut,
        seeds = [b"distributor", distributor.authority.as_ref(), distributor.season_id.to_le_bytes().as_ref()],
        bump = distributor.bump
    )]
    pub distributor: Account<'info, Distributor>,
    /// Fresh per (distributor, claimant). `init` (not init_if_needed) so a second
    /// claim by the same wallet fails — this is the double-claim guard.
    #[account(
        init,
        payer = claimant,
        space = ClaimStatus::SIZE,
        seeds = [b"claim_status", distributor.key().as_ref(), claimant.key().as_ref()],
        bump
    )]
    pub claim_status: Account<'info, ClaimStatus>,
    // vault is always created at the canonical bump, so a client's findProgramAddressSync(['vault', distributor]) matches stored vault_bump.
    #[account(mut, seeds = [b"vault", distributor.key().as_ref()], bump = distributor.vault_bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = claimant_token.mint == distributor.mint @ RewardError::WrongMint,
        constraint = claimant_token.owner == claimant.key() @ RewardError::WrongOwner
    )]
    pub claimant_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Clawback<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"distributor", distributor.authority.as_ref(), distributor.season_id.to_le_bytes().as_ref()],
        bump = distributor.bump,
        has_one = authority
    )]
    pub distributor: Account<'info, Distributor>,
    #[account(mut, seeds = [b"vault", distributor.key().as_ref()], bump = distributor.vault_bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = authority_token.mint == distributor.mint @ RewardError::WrongMint,
        constraint = authority_token.owner == authority.key() @ RewardError::WrongOwner
    )]
    pub authority_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[error_code]
pub enum RewardError {
    #[msg("Merkle proof does not verify against the published root")]
    InvalidProof,
    #[msg("Clawback is disabled or the clawback deadline has not passed")]
    ClawbackNotReady,
    #[msg("Total funded must be greater than zero")]
    ZeroTotal,
    #[msg("Token account mint does not match")]
    WrongMint,
    #[msg("Token account owner does not match")]
    WrongOwner,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Merkle proof too long")]
    ProofTooLong,
}
