use anchor_lang::prelude::*;
use wormhole_anchor_sdk::token_bridge;

#[account]
#[derive(Debug)]
pub struct RedeemerConfig {
    /// PDA bump.
    pub bump: u8,
}

impl RedeemerConfig {
    pub const MAXIMUM_SIZE: usize = 8 // discriminator
        + 1 // bump
    ;
    /// AKA `b"redeemer"`.
    pub const SEED_PREFIX: &'static [u8; 8] = token_bridge::SEED_PREFIX_REDEEMER;
}
