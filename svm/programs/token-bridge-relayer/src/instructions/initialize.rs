use anchor_lang::prelude::*;

use crate::state::{RedeemerConfig, SenderConfig};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        seeds = [SenderConfig::SEED_PREFIX],
        bump,
        space = SenderConfig::MAXIMUM_SIZE,
    )]
    /// Sender Config account, which saves program data useful for other
    /// instructions, specifically for outbound transfers.
    pub sender_config: Account<'info, SenderConfig>,

    #[account(
        init,
        payer = payer,
        seeds = [RedeemerConfig::SEED_PREFIX],
        bump,
        space = RedeemerConfig::MAXIMUM_SIZE,
    )]
    /// Redeemer Config account, which saves program data useful for other
    /// instructions, specifically for inbound transfers.
    pub redeemer_config: Account<'info, RedeemerConfig>,

    /// System program.
    pub system_program: Program<'info, System>,
}

pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    ctx.accounts.sender_config.bump = ctx.bumps.sender_config;
    ctx.accounts.redeemer_config.bump = ctx.bumps.redeemer_config;
    Ok(())
}
