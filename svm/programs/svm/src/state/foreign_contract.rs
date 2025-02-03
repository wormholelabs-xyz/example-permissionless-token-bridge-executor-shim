use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
/// Foreign token bridge account data.
pub struct ForeignContract {
    /// Emitter chain. Cannot equal this chain.
    pub chain: u16,
    /// Contract address.
    pub address: [u8; 32],
    /// PDA bump.
    pub bump: u8,
}

impl ForeignContract {
    pub const MAXIMUM_SIZE: usize = 8 // discriminator
        + 2 // chain
        + 32 // address
        + 1 // bump
    ;
    /// AKA `b"foreign_contract"`.
    pub const SEED_PREFIX: &'static [u8; 16] = b"foreign_contract";
}
