use anchor_lang::prelude::*;
use anchor_spl::token::{self};

declare_id!("Hsf7mQAy6eSYbqGYqkeTx8smMGF4m6Nn6viGoh9wxiah");

// TODO: cfg_if
pub const OUR_CHAIN: u16 = 1;

mod instructions;
pub(crate) use instructions::*;

pub mod state;

pub mod error;

pub mod ext;

mod message;
pub use message::*;

pub mod utils;

#[program]
pub mod token_bridge_relayer {

    use super::*;

    /// Permissionlessly initializes the sender config PDA. This avoids having to re-derive the bump in later instructions.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize(ctx)
    }

    /// This instruction is used to transfer native tokens from Solana to a
    /// foreign blockchain. If the user is transferring native SOL,
    /// the contract will automatically wrap the lamports into a WSOL.
    ///
    /// # Arguments
    ///
    /// * `ctx` - `TransferNativeWithRelay` context
    /// * `amount` - Amount of tokens to send
    /// * `recipient_chain` - Chain ID of the target chain
    /// * `recipient_address` - Address of the target wallet on the target chain
    /// * `nonce` - Nonce of Wormhole message
    /// * `wrap_native` - Whether to wrap native SOL
    /// * `dst_transfer_recipient` - Token Bridge payload 3 recipient
    /// * `dst_execution_address` - Executor destination address
    /// * `exec_amount` - Amount of lamports to pay the execution payee
    /// * `signed_quote_bytes` - Executor signed quote
    /// * `relay_instructions` - Executor relay instructions
    pub fn transfer_native_tokens_with_relay(
        ctx: Context<TransferNativeWithRelay>,
        args: TransferNativeTokensWithRelayArgs,
    ) -> Result<()> {
        instructions::transfer_native_tokens_with_relay(ctx, args)
    }

    /// This instruction is used to transfer wrapped tokens from Solana to a
    /// foreign blockchain. This instruction should only be called
    /// when the user is transferring a wrapped token.
    ///
    /// # Arguments
    ///
    /// * `ctx` - `TransferWrappedWithRelay` context
    /// * `amount` - Amount of tokens to send
    /// * `recipient_chain` - Chain ID of the target chain
    /// * `recipient_address` - Address of the target wallet on the target chain
    /// * `nonce` - Nonce of Wormhole message
    /// * `dst_transfer_recipient` - Token Bridge payload 3 recipient
    /// * `dst_execution_address` - Executor destination address
    /// * `exec_amount` - Amount of lamports to pay the execution payee
    /// * `signed_quote_bytes` - Executor signed quote
    /// * `relay_instructions` - Executor relay instructions
    pub fn transfer_wrapped_tokens_with_relay(
        ctx: Context<TransferWrappedWithRelay>,
        args: TransferWrappedTokensWithRelayArgs,
    ) -> Result<()> {
        instructions::transfer_wrapped_tokens_with_relay(ctx, args)
    }

    /// This instruction is used to redeem token transfers from foreign emitters.
    /// It takes custody of the released native tokens and sends the tokens to the
    /// encoded `recipient`.  If the token being transferred is WSOL, the contract
    /// will unwrap the WSOL and send the lamports to the recipient.
    ///
    /// # Arguments
    ///
    /// * `ctx` - `CompleteNativeWithRelay` context
    /// * `vaa_hash` - Hash of the VAA that triggered the transfer
    pub fn complete_native_transfer_with_relay(
        ctx: Context<CompleteNativeWithRelay>,
        _vaa_hash: [u8; 32],
    ) -> Result<()> {
        instructions::complete_native_transfer_with_relay(ctx, _vaa_hash)
    }

    /// This instruction is used to redeem token transfers from foreign emitters.
    /// It takes custody of the minted wrapped tokens and sends the tokens to the
    /// encoded `recipient`.
    ///
    /// # Arguments
    ///
    /// * `ctx` - `CompleteWrappedWithRelay` context
    /// * `vaa_hash` - Hash of the VAA that triggered the transfer
    pub fn complete_wrapped_transfer_with_relay(
        ctx: Context<CompleteWrappedWithRelay>,
        _vaa_hash: [u8; 32],
    ) -> Result<()> {
        instructions::complete_wrapped_transfer_with_relay(ctx, _vaa_hash)
    }

    /// This instruction returns the instruction for execution based on a v1 VAA
    /// # Arguments
    ///
    /// * `ctx` - `ExecuteVaaV1` context
    /// * `vaa_body` - Body of the VAA for execution
    pub fn execute_vaa_v1(ctx: Context<ExecuteVaaV1>, vaa_body: Vec<u8>) -> Result<Ix> {
        instructions::execute_vaa_v1(ctx, vaa_body)
    }
}
