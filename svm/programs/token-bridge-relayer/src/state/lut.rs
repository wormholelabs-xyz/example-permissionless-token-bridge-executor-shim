use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct LUT {
    pub bump: u8,
    pub address: Pubkey,
}
