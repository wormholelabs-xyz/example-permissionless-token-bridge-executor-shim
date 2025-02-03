use anchor_lang::prelude::*;
use wormhole_anchor_sdk::wormhole::CHAIN_ID_SOLANA;

declare_id!("Gfo1Jn4zHvc8BBGWNPQpNDZob5DsG2bhmS4wEA2GKFx6");

// TODO: cfg_if
pub const CHAIN_ID: u16 = CHAIN_ID_SOLANA;

mod instructions;
pub(crate) use instructions::*;

pub mod state;

pub mod error;

pub mod ext;

#[program]
pub mod svm {
    use super::*;

    /// Permissionlessly initializes the sender config PDA. This avoids having to re-derive the bump in later instructions.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize(ctx)
    }

    /// Permissionlessly registers the foreign token bridge contract. The token bridge contract's PDAs for this are derived
    /// using the chain ID and emitter, but this program requires looking up an emitter by chain ID in order to request execution.
    /// TODO: does this approach work for Aptos and Sui?
    pub fn register(ctx: Context<Register>, chain: u16, address: [u8; 32]) -> Result<()> {
        instructions::register(ctx, chain, address)
    }

    /// Send tokens native to this chain via the token bridge and request execution
    pub fn send_native_tokens(
        ctx: Context<SendNativeTokens>,
        nonce: u32,
        amount: u64,
        recipient_address: [u8; 32],
        recipient_chain: u16,
        exec_amount: u64,
        signed_quote_bytes: Vec<u8>,
        relay_instructions: Vec<u8>,
    ) -> Result<()> {
        instructions::send_native_tokens(
            ctx,
            nonce,
            amount,
            recipient_address,
            recipient_chain,
            exec_amount,
            signed_quote_bytes,
            relay_instructions,
        )
    }

    /// Send tokens native to other chains via the token bridge and request execution
    pub fn send_wrapped_tokens(
        ctx: Context<SendWrappedTokens>,
        nonce: u32,
        amount: u64,
        recipient_address: [u8; 32],
        recipient_chain: u16,
        exec_amount: u64,
        signed_quote_bytes: Vec<u8>,
        relay_instructions: Vec<u8>,
    ) -> Result<()> {
        instructions::send_wrapped_tokens(
            ctx,
            nonce,
            amount,
            recipient_address,
            recipient_chain,
            exec_amount,
            signed_quote_bytes,
            relay_instructions,
        )
    }
}
