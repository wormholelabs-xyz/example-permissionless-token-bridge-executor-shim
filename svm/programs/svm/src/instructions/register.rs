use anchor_lang::prelude::*;
use wormhole_anchor_sdk::token_bridge;

use crate::state::ForeignContract;

#[derive(Accounts)]
#[instruction(chain: u16, address: [u8; 32])]
pub struct Register<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        seeds = [ForeignContract::SEED_PREFIX, &chain.to_le_bytes()[..]],
        bump,
        space = ForeignContract::MAXIMUM_SIZE,
    )]
    /// Foreign contract account, which allows for mapping a chain ID to a foreign token bridge address.
    pub foreign_contract: Account<'info, ForeignContract>,

    #[account(
        seeds = [
            &chain.to_be_bytes(),
            &address,
        ],
        bump,
        seeds::program = token_bridge::program::ID
    )]
    /// CHECK: the existence of the account
    /// Token Bridge foreign endpoint. This account should really be one
    /// endpoint per chain, but the PDA allows for multiple endpoints for each
    /// chain. This program stores one endpoint per chain.
    pub token_bridge_foreign_endpoint: Account<'info, token_bridge::EndpointRegistration>,

    /// System program.
    pub system_program: Program<'info, System>,
}

pub fn register(ctx: Context<Register>, chain: u16, address: [u8; 32]) -> Result<()> {
    ctx.accounts.foreign_contract.set_inner(ForeignContract {
        chain,
        address,
        bump: ctx.bumps.foreign_contract,
    });
    Ok(())
}
