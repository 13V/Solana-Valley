// Farm Lands — player-to-player marketplace (Phase B of docs/MARKETPLACE.md).
//
// An escrow program: a seller lists `qty` of an item SPL token at a fixed total
// price in $SPROUT; the item is held in a program-owned escrow account until a
// buyer pays (seller gets price minus a fee, the treasury gets the fee) or the
// seller cancels. Settlement is always in the configured $SPROUT mint.
//
// Trust model: the program guarantees the trade is atomic and the escrow can't be
// drained. It does NOT validate that an "item" is a legitimate game drop — that
// is the job of item tokenization (roadmap M2/M3): produce must be minted
// on-chain behind an oracle that checks the on-chain planted-at-slot, so a modded
// client can't conjure tradeable items. This program is mint-agnostic and works
// with whatever item mints that system produces.
//
// NOTE: not yet built/deployed in CI. `declare_id!` is a placeholder — replace
// with the real program id after `anchor build && anchor deploy`.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

declare_id!("Mk7Va11eyMarketp1aceProgram11111111111111111");

const BPS_DENOMINATOR: u64 = 10_000;
const MAX_FEE_BPS: u16 = 1_000; // hard cap: fee can never exceed 10%

#[program]
pub mod marketplace {
    use super::*;

    /// One-time global config. `treasury` is a $SPROUT token account that
    /// collects fees; `fee_bps` is the marketplace cut (e.g. 500 = 5%).
    pub fn initialize(ctx: Context<Initialize>, fee_bps: u16) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, MarketError::FeeTooHigh);
        let m = &mut ctx.accounts.marketplace;
        m.admin = ctx.accounts.admin.key();
        m.sprout_mint = ctx.accounts.sprout_mint.key();
        m.treasury = ctx.accounts.treasury.key();
        m.fee_bps = fee_bps;
        m.bump = ctx.bumps.marketplace;
        Ok(())
    }

    /// Admin can adjust the fee (still capped) or move the treasury.
    pub fn set_fee(ctx: Context<AdminOnly>, fee_bps: u16) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, MarketError::FeeTooHigh);
        ctx.accounts.marketplace.fee_bps = fee_bps;
        Ok(())
    }

    /// List `qty` of `item_mint` for a total `price` (in $SPROUT base units).
    /// `nonce` lets a seller hold multiple listings of the same mint. The item is
    /// moved into a program-owned escrow token account.
    pub fn list(ctx: Context<ListItem>, nonce: u64, qty: u64, price: u64) -> Result<()> {
        require!(qty > 0, MarketError::ZeroQty);
        require!(price > 0, MarketError::ZeroPrice);

        let listing = &mut ctx.accounts.listing;
        listing.seller = ctx.accounts.seller.key();
        listing.item_mint = ctx.accounts.item_mint.key();
        listing.qty = qty;
        listing.price = price;
        listing.nonce = nonce;
        listing.bump = ctx.bumps.listing;

        // Pull the item from the seller into escrow (seller authority).
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.seller_item.to_account_info(),
                    to: ctx.accounts.escrow.to_account_info(),
                    authority: ctx.accounts.seller.to_account_info(),
                },
            ),
            qty,
        )?;
        Ok(())
    }

    /// Buy a listing: pay $SPROUT (seller gets price - fee, treasury gets fee),
    /// receive the escrowed item, and close the listing (rent back to seller).
    pub fn buy(ctx: Context<Buy>) -> Result<()> {
        let price = ctx.accounts.listing.price;
        let qty = ctx.accounts.listing.qty;
        let fee = price
            .checked_mul(ctx.accounts.marketplace.fee_bps as u64)
            .unwrap()
            / BPS_DENOMINATOR;
        let to_seller = price.checked_sub(fee).unwrap();

        // Buyer -> seller ($SPROUT, net of fee).
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.buyer_sprout.to_account_info(),
                    to: ctx.accounts.seller_sprout.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            to_seller,
        )?;
        // Buyer -> treasury (fee), if any.
        if fee > 0 {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.buyer_sprout.to_account_info(),
                        to: ctx.accounts.treasury.to_account_info(),
                        authority: ctx.accounts.buyer.to_account_info(),
                    },
                ),
                fee,
            )?;
        }

        // Escrow -> buyer (the item). Listing PDA signs for the escrow.
        let seller_key = ctx.accounts.listing.seller;
        let mint_key = ctx.accounts.listing.item_mint;
        let nonce_bytes = ctx.accounts.listing.nonce.to_le_bytes();
        let bump = ctx.accounts.listing.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"listing",
            seller_key.as_ref(),
            mint_key.as_ref(),
            nonce_bytes.as_ref(),
            &[bump],
        ]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow.to_account_info(),
                    to: ctx.accounts.buyer_item.to_account_info(),
                    authority: ctx.accounts.listing.to_account_info(),
                },
                signer_seeds,
            ),
            qty,
        )?;

        // Close the (now-empty) escrow token account, rent back to the seller.
        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.escrow.to_account_info(),
                destination: ctx.accounts.seller.to_account_info(),
                authority: ctx.accounts.listing.to_account_info(),
            },
            signer_seeds,
        ))?;
        Ok(())
    }

    /// Seller cancels: reclaim the escrowed item and close the listing.
    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        let qty = ctx.accounts.listing.qty;
        let seller_key = ctx.accounts.listing.seller;
        let mint_key = ctx.accounts.listing.item_mint;
        let nonce_bytes = ctx.accounts.listing.nonce.to_le_bytes();
        let bump = ctx.accounts.listing.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"listing",
            seller_key.as_ref(),
            mint_key.as_ref(),
            nonce_bytes.as_ref(),
            &[bump],
        ]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow.to_account_info(),
                    to: ctx.accounts.seller_item.to_account_info(),
                    authority: ctx.accounts.listing.to_account_info(),
                },
                signer_seeds,
            ),
            qty,
        )?;
        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.escrow.to_account_info(),
                destination: ctx.accounts.seller.to_account_info(),
                authority: ctx.accounts.listing.to_account_info(),
            },
            signer_seeds,
        ))?;
        Ok(())
    }
}

// ---- accounts ----------------------------------------------------------------

#[account]
pub struct Marketplace {
    pub admin: Pubkey,
    pub sprout_mint: Pubkey, // settlement currency
    pub treasury: Pubkey,    // $SPROUT token account that collects fees
    pub fee_bps: u16,
    pub bump: u8,
}
impl Marketplace {
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 2 + 1;
}

#[account]
pub struct Listing {
    pub seller: Pubkey,
    pub item_mint: Pubkey,
    pub qty: u64,
    pub price: u64, // total, in $SPROUT base units
    pub nonce: u64,
    pub bump: u8,
}
impl Listing {
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 8 + 8 + 1;
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = Marketplace::SIZE,
        seeds = [b"marketplace"],
        bump
    )]
    pub marketplace: Account<'info, Marketplace>,
    pub sprout_mint: Account<'info, Mint>,
    /// $SPROUT token account that will receive fees (must be for `sprout_mint`).
    #[account(constraint = treasury.mint == sprout_mint.key() @ MarketError::WrongMint)]
    pub treasury: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"marketplace"], bump = marketplace.bump, has_one = admin)]
    pub marketplace: Account<'info, Marketplace>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct ListItem<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    pub item_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = seller,
        space = Listing::SIZE,
        seeds = [b"listing", seller.key().as_ref(), item_mint.key().as_ref(), nonce.to_le_bytes().as_ref()],
        bump
    )]
    pub listing: Account<'info, Listing>,
    /// Program-owned escrow token account for the item, authority = listing PDA.
    #[account(
        init,
        payer = seller,
        seeds = [b"escrow", listing.key().as_ref()],
        bump,
        token::mint = item_mint,
        token::authority = listing
    )]
    pub escrow: Account<'info, TokenAccount>,
    #[account(mut, constraint = seller_item.mint == item_mint.key() @ MarketError::WrongMint, constraint = seller_item.owner == seller.key())]
    pub seller_item: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: the seller just receives funds + rent; validated via has_one on listing.
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,
    #[account(seeds = [b"marketplace"], bump = marketplace.bump)]
    pub marketplace: Account<'info, Marketplace>,
    #[account(
        mut,
        seeds = [b"listing", listing.seller.as_ref(), listing.item_mint.as_ref(), listing.nonce.to_le_bytes().as_ref()],
        bump = listing.bump,
        has_one = seller,
        close = seller
    )]
    pub listing: Account<'info, Listing>,
    #[account(mut, seeds = [b"escrow", listing.key().as_ref()], bump)]
    pub escrow: Account<'info, TokenAccount>,
    // $SPROUT flows
    #[account(mut, constraint = buyer_sprout.mint == marketplace.sprout_mint @ MarketError::WrongMint, constraint = buyer_sprout.owner == buyer.key())]
    pub buyer_sprout: Account<'info, TokenAccount>,
    #[account(mut, constraint = seller_sprout.mint == marketplace.sprout_mint @ MarketError::WrongMint, constraint = seller_sprout.owner == seller.key())]
    pub seller_sprout: Account<'info, TokenAccount>,
    #[account(mut, address = marketplace.treasury @ MarketError::WrongTreasury)]
    pub treasury: Account<'info, TokenAccount>,
    // item flow
    #[account(mut, constraint = buyer_item.mint == listing.item_mint @ MarketError::WrongMint, constraint = buyer_item.owner == buyer.key())]
    pub buyer_item: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(
        mut,
        seeds = [b"listing", seller.key().as_ref(), listing.item_mint.as_ref(), listing.nonce.to_le_bytes().as_ref()],
        bump = listing.bump,
        has_one = seller,
        close = seller
    )]
    pub listing: Account<'info, Listing>,
    #[account(mut, seeds = [b"escrow", listing.key().as_ref()], bump)]
    pub escrow: Account<'info, TokenAccount>,
    #[account(mut, constraint = seller_item.mint == listing.item_mint @ MarketError::WrongMint, constraint = seller_item.owner == seller.key())]
    pub seller_item: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[error_code]
pub enum MarketError {
    #[msg("Fee exceeds the 10% cap")]
    FeeTooHigh,
    #[msg("Quantity must be greater than zero")]
    ZeroQty,
    #[msg("Price must be greater than zero")]
    ZeroPrice,
    #[msg("Token account mint does not match")]
    WrongMint,
    #[msg("Treasury account does not match the marketplace config")]
    WrongTreasury,
}
