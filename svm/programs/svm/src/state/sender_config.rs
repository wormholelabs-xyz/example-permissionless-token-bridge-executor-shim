use anchor_lang::prelude::*;
use wormhole_anchor_sdk::token_bridge;

#[account]
#[derive(Debug)]
pub struct SenderConfig {
    /// PDA bump.
    pub bump: u8,
}

impl SenderConfig {
    pub const MAXIMUM_SIZE: usize = 8 // discriminator
        + 1 // bump
    ;
    /// AKA `b"sender"`.
    pub const SEED_PREFIX: &'static [u8; 6] = token_bridge::SEED_PREFIX_SENDER;
}
