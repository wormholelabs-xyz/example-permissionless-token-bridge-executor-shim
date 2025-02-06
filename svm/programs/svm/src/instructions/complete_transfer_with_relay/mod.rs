mod native;
mod wrapped;

pub use native::*;
pub use wrapped::*;

use crate::state::RedeemerConfig;
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

pub struct RedeemToken<'ctx, 'info> {
    payer: &'ctx Signer<'info>,
    config: &'ctx Account<'info, RedeemerConfig>,
    recipient_token_account: &'ctx Account<'info, TokenAccount>,
    tmp_token_account: &'ctx Account<'info, TokenAccount>,
    token_program: &'ctx Program<'info, Token>,
}

pub fn redeem_token(redeem_token: RedeemToken, amount: u64) -> Result<()> {
    let RedeemToken {
        payer,
        config,
        recipient_token_account,
        tmp_token_account,
        token_program,
    } = redeem_token;

    let config_seeds = &[RedeemerConfig::SEED_PREFIX.as_ref(), &[config.bump]];

    // Transfer tokens from tmp_token_account to recipient.
    anchor_spl::token::transfer(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: tmp_token_account.to_account_info(),
                to: recipient_token_account.to_account_info(),
                authority: config.to_account_info(),
            },
            &[&config_seeds[..]],
        ),
        amount,
    )?;

    // Finish instruction by closing tmp_token_account.
    anchor_spl::token::close_account(CpiContext::new_with_signer(
        token_program.to_account_info(),
        anchor_spl::token::CloseAccount {
            account: tmp_token_account.to_account_info(),
            destination: payer.to_account_info(),
            authority: config.to_account_info(),
        },
        &[config_seeds],
    ))
}
