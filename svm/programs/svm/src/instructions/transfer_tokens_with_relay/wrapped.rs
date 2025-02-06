declare_program!(executor);

use crate::{
    ext::make_vaa_v1_request,
    state::{SenderConfig, SEED_PREFIX_TMP},
    token::{Token, TokenAccount},
    OUR_CHAIN,
};
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use executor::{program::Executor, types::RequestForExecutionArgs};
use wormhole_anchor_sdk::{
    token_bridge::{self, program::TokenBridge},
    wormhole::{self, program::Wormhole},
};

use super::{prepare_transfer, PrepareTransfer};

#[derive(Accounts)]
#[instruction(
    _amount: u64,
    recipient_chain: u16
)]
pub struct TransferWrappedWithRelay<'info> {
    #[account(mut)]
    /// Payer will pay Wormhole fee to transfer tokens and create temporary
    /// token account.
    pub payer: Signer<'info>,

    #[account(
        seeds = [SenderConfig::SEED_PREFIX],
        bump = config.bump,
    )]
    /// Sender Config account. Acts as the Token Bridge sender PDA. Mutable.
    pub config: Box<Account<'info, SenderConfig>>,

    #[account(mut)]
    /// Token Bridge wrapped mint info. This is the SPL token that will be
    /// bridged to the foreign contract. The wrapped mint PDA must agree
    /// with the native token's metadata. Mutable.
    pub token_bridge_wrapped_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = token_bridge_wrapped_mint,
        associated_token::authority = payer,
    )]
    /// Payer's associated token account. We may want to make this a generic
    /// token account in the future.
    pub from_token_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = payer,
        seeds = [
            SEED_PREFIX_TMP,
            token_bridge_wrapped_mint.key().as_ref(),
        ],
        bump,
        token::mint = token_bridge_wrapped_mint,
        token::authority = config,
    )]
    /// Program's temporary token account. This account is created before the
    /// instruction is invoked to temporarily take custody of the payer's
    /// tokens. When the tokens are finally bridged out, the token account
    /// will have zero balance and can be closed.
    pub tmp_token_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: Token Bridge program's wrapped metadata, which stores info
    /// about the token from its native chain:
    ///   * Wormhole Chain ID
    ///   * Token's native contract address
    ///   * Token's native decimals
    pub token_bridge_wrapped_meta: UncheckedAccount<'info>,

    /// CHECK: Token Bridge config. Read-only.
    pub token_bridge_config: UncheckedAccount<'info>,

    /// CHECK: Token Bridge authority signer. Read-only.
    pub token_bridge_authority_signer: UncheckedAccount<'info>,

    #[account(mut)]
    /// CHECK: Wormhole bridge data. Mutable.
    pub wormhole_bridge: UncheckedAccount<'info>,

    #[account(mut)]
    /// CHECK: Wormhole Message. Token Bridge program writes info about the
    /// tokens transferred in this account for our program. Mutable.
    pub wormhole_message: Signer<'info>,

    /// CHECK: Token Bridge emitter.
    pub token_bridge_emitter: UncheckedAccount<'info>,

    /// CHECK: Token Bridge sequence.
    #[account(mut)]
    pub token_bridge_sequence: UncheckedAccount<'info>,

    #[account(mut)]
    /// CHECK: Wormhole fee collector. Mutable.
    pub wormhole_fee_collector: UncheckedAccount<'info>,

    #[account(mut)]
    /// CHECK: payee account enforced by the Executor to match the quote.
    pub payee: UncheckedAccount<'info>,

    pub wormhole_program: Program<'info, Wormhole>,
    pub token_bridge_program: Program<'info, TokenBridge>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub executor_program: Program<'info, Executor>,

    /// CHECK: Token Bridge program needs clock sysvar.
    pub clock: UncheckedAccount<'info>,

    /// CHECK: Token Bridge program needs rent sysvar.
    pub rent: UncheckedAccount<'info>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct TransferWrappedTokensWithRelayArgs {
    pub amount: u64,
    pub recipient_chain: u16,
    pub recipient_address: [u8; 32],
    pub nonce: u32,
    pub dst_transfer_recipient: [u8; 32],
    pub dst_execution_address: [u8; 32],
    pub exec_amount: u64,
    pub signed_quote_bytes: Vec<u8>,
    pub relay_instructions: Vec<u8>,
}

pub fn transfer_wrapped_tokens_with_relay(
    ctx: Context<TransferWrappedWithRelay>,
    args: TransferWrappedTokensWithRelayArgs,
) -> Result<()> {
    let TransferWrappedTokensWithRelayArgs {
        amount,
        recipient_chain,
        recipient_address,
        nonce,
        dst_transfer_recipient,
        dst_execution_address,
        exec_amount,
        signed_quote_bytes,
        relay_instructions,
    } = args;

    let config = &ctx.accounts.config;
    let payer = &ctx.accounts.payer;
    let tmp_token_account = &ctx.accounts.tmp_token_account;
    let token_bridge_authority_signer = &ctx.accounts.token_bridge_authority_signer;
    let token_program = &ctx.accounts.token_program;

    // First transfer tokens from payer to tmp_token_account.
    anchor_spl::token::transfer(
        CpiContext::new(
            token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: ctx.accounts.from_token_account.to_account_info(),
                to: tmp_token_account.to_account_info(),
                authority: payer.to_account_info(),
            },
        ),
        amount,
    )?;

    let msg = prepare_transfer(
        PrepareTransfer {
            config,
            tmp_token_account,
            token_bridge_authority_signer,
            token_program,
        },
        amount,
        recipient_chain,
        recipient_address,
    )?;

    let config_seeds = &[SenderConfig::SEED_PREFIX.as_ref(), &[config.bump]];

    // Bridge wrapped token with encoded payload.
    token_bridge::transfer_wrapped_with_payload(
        CpiContext::new_with_signer(
            ctx.accounts.token_bridge_program.to_account_info(),
            token_bridge::TransferWrappedWithPayload {
                payer: payer.to_account_info(),
                config: ctx.accounts.token_bridge_config.to_account_info(),
                from: tmp_token_account.to_account_info(),
                from_owner: ctx.accounts.config.to_account_info(),
                wrapped_mint: ctx.accounts.token_bridge_wrapped_mint.to_account_info(),
                wrapped_metadata: ctx.accounts.token_bridge_wrapped_meta.to_account_info(),
                authority_signer: ctx.accounts.token_bridge_authority_signer.to_account_info(),
                wormhole_bridge: ctx.accounts.wormhole_bridge.to_account_info(),
                wormhole_message: ctx.accounts.wormhole_message.to_account_info(),
                wormhole_emitter: ctx.accounts.token_bridge_emitter.to_account_info(),
                wormhole_sequence: ctx.accounts.token_bridge_sequence.to_account_info(),
                wormhole_fee_collector: ctx.accounts.wormhole_fee_collector.to_account_info(),
                clock: ctx.accounts.clock.to_account_info(),
                sender: ctx.accounts.config.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                token_program: token_program.to_account_info(),
                wormhole_program: ctx.accounts.wormhole_program.to_account_info(),
            },
            &[config_seeds],
        ),
        nonce,
        amount,
        dst_transfer_recipient,
        recipient_chain,
        msg.try_to_vec()?,
        &crate::ID,
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
    ))?;

    // parse the sequence from the account and request execution
    // reading the account after avoids having to handle when the account doesn't exist
    let mut buf = &ctx.accounts.token_bridge_sequence.try_borrow_mut_data()?[..];
    let seq = wormhole::SequenceTracker::try_deserialize(&mut buf)?;
    executor::cpi::request_for_execution(
        CpiContext::new(
            ctx.accounts.executor_program.to_account_info(),
            executor::cpi::accounts::RequestForExecution {
                payer: ctx.accounts.payer.to_account_info(),
                payee: ctx.accounts.payee.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
            },
        ),
        RequestForExecutionArgs {
            amount: exec_amount,
            dst_chain: recipient_chain,
            dst_addr: dst_execution_address,
            refund_addr: ctx.accounts.payer.key(),
            signed_quote_bytes,
            request_bytes: make_vaa_v1_request(
                OUR_CHAIN,
                ctx.accounts.token_bridge_emitter.key().to_bytes(),
                seq.sequence - 1,
            ),
            relay_instructions,
        },
    )
}
