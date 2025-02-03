use anchor_lang::prelude::*;

use crate::state::SenderConfig;

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

    /// System program.
    pub system_program: Program<'info, System>,
}

pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    ctx.accounts.sender_config.bump = ctx.bumps.sender_config;
    Ok(())
}
