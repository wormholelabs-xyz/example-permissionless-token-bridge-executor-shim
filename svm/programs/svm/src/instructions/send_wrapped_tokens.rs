declare_program!(executor);

use anchor_lang::{prelude::*, solana_program};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Token, TokenAccount},
};
use executor::program::Executor;
use wormhole_anchor_sdk::{
    token_bridge::{self, program::TokenBridge, Instruction, TransferWrappedWithPayload},
    wormhole::{self, program::Wormhole},
};

use crate::{
    error,
    ext::make_vaa_v1_request,
    state::{ForeignContract, SenderConfig, SEED_PREFIX_TMP},
    CHAIN_ID,
};

// This is not included in the anchor sdk
pub fn transfer_wrapped<'info>(
    // accounts are the same as TransferWrappedWithPayload
    ctx: CpiContext<'_, '_, '_, 'info, TransferWrappedWithPayload<'info>>,
    batch_id: u32,
    amount: u64,
    recipient_address: [u8; 32],
    recipient_chain: u16,
    fee: u64,
) -> Result<()> {
    let ix = solana_program::instruction::Instruction {
        program_id: ctx.program.key(),
        accounts: vec![
            AccountMeta::new(ctx.accounts.payer.key(), true),
            AccountMeta::new_readonly(ctx.accounts.config.key(), false),
            AccountMeta::new(ctx.accounts.from.key(), false),
            AccountMeta::new_readonly(ctx.accounts.from_owner.key(), true),
            AccountMeta::new(ctx.accounts.wrapped_mint.key(), false),
            AccountMeta::new_readonly(ctx.accounts.wrapped_metadata.key(), false),
            AccountMeta::new_readonly(ctx.accounts.authority_signer.key(), false),
            AccountMeta::new(ctx.accounts.wormhole_bridge.key(), false),
            AccountMeta::new(ctx.accounts.wormhole_message.key(), true),
            AccountMeta::new_readonly(ctx.accounts.wormhole_emitter.key(), false),
            AccountMeta::new(ctx.accounts.wormhole_sequence.key(), false),
            AccountMeta::new(ctx.accounts.wormhole_fee_collector.key(), false),
            AccountMeta::new_readonly(solana_program::sysvar::clock::id(), false),
            AccountMeta::new_readonly(ctx.accounts.sender.key(), true),
            AccountMeta::new_readonly(solana_program::sysvar::rent::id(), false),
            AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
            AccountMeta::new_readonly(ctx.accounts.wormhole_program.key(), false),
            AccountMeta::new_readonly(anchor_spl::token::spl_token::id(), false),
        ],
        data: Instruction::TransferWrapped {
            batch_id,
            amount,
            recipient_address,
            recipient_chain,
            fee,
        }
        .try_to_vec()?,
    };

    solana_program::program::invoke_signed(
        &ix,
        &ToAccountInfos::to_account_infos(&ctx),
        ctx.signer_seeds,
    )
    .map_err(Into::into)
}

#[derive(Accounts)]
#[instruction(
    nonce: u32,
    amount: u64,
    recipient_address: [u8; 32],
    recipient_chain: u16,
)]
pub struct SendWrappedTokens<'info> {
    #[account(mut)]
    /// Payer will pay Wormhole fee to transfer tokens and create temporary
    /// token account.
    pub payer: Signer<'info>,

    #[account(
        seeds = [SenderConfig::SEED_PREFIX],
        bump = config.bump
    )]
    /// Sender Config account. Acts as the Token Bridge sender PDA. Mutable.
    pub config: Box<Account<'info, SenderConfig>>,

    #[account(
        seeds = [
            ForeignContract::SEED_PREFIX,
            &recipient_chain.to_le_bytes()[..]
        ],
        bump = foreign_contract.bump,
    )]
    /// Foreign Contract account. This is the address the execution is requested for. Read-only.
    pub foreign_contract: Box<Account<'info, ForeignContract>>,

    #[account(
        mut,
        seeds = [
            token_bridge::WrappedMint::SEED_PREFIX,
            &token_bridge_wrapped_meta.chain.to_be_bytes(),
            &token_bridge_wrapped_meta.token_address
        ],
        bump,
        seeds::program = token_bridge_program
    )]
    /// Token Bridge wrapped mint info. This is the SPL token that will be
    /// bridged to the foreign contract. The wrapped mint PDA must agree
    /// with the native token's metadata. Mutable.
    pub token_bridge_wrapped_mint: Box<Account<'info, token_bridge::WrappedMint>>,

    #[account(
        mut,
        associated_token::mint = token_bridge_wrapped_mint,
        associated_token::authority = payer,
    )]
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
    pub tmp_token_account: Box<Account<'info, TokenAccount>>,

    /// Wormhole program.
    pub wormhole_program: Program<'info, Wormhole>,

    /// Token Bridge program.
    pub token_bridge_program: Program<'info, TokenBridge>,

    #[account(
        seeds = [
            token_bridge::WrappedMeta::SEED_PREFIX,
            token_bridge_wrapped_mint.key().as_ref()
        ],
        bump,
        seeds::program = token_bridge_program.key
    )]
    /// Token Bridge program's wrapped metadata, which stores info
    /// about the token from its native chain:
    ///   * Wormhole Chain ID
    ///   * Token's native contract address
    ///   * Token's native decimals
    pub token_bridge_wrapped_meta: Account<'info, token_bridge::WrappedMeta>,

    #[account(mut)]
    /// Token Bridge config. Mutable.
    pub token_bridge_config: UncheckedAccount<'info>,

    /// CHECK: Token Bridge authority signer. Read-only.
    pub token_bridge_authority_signer: UncheckedAccount<'info>,

    #[account(mut)]
    /// Wormhole bridge data. Mutable.
    pub wormhole_bridge: Box<Account<'info, wormhole::BridgeData>>,

    #[account(mut)]
    /// Wormhole Message. Token Bridge program writes info about the
    /// tokens transferred in this account for our program. Mutable.
    pub wormhole_message: Signer<'info>,

    #[account(mut)]
    /// CHECK: Token Bridge emitter. Read-only.
    pub token_bridge_emitter: UncheckedAccount<'info>,

    #[account(mut)]
    /// CHECK: Token Bridge sequence. Mutable.
    pub token_bridge_sequence: UncheckedAccount<'info>,

    #[account(mut)]
    /// Wormhole fee collector. Mutable.
    pub wormhole_fee_collector: Account<'info, wormhole::FeeCollector>,

    /// System program.
    pub system_program: Program<'info, System>,

    /// Token program.
    pub token_program: Program<'info, Token>,

    /// Associated Token program.
    pub associated_token_program: Program<'info, AssociatedToken>,

    /// Clock sysvar.
    pub clock: Sysvar<'info, Clock>,

    /// Rent sysvar.
    pub rent: Sysvar<'info, Rent>,

    /// Executor program.
    pub executor: Program<'info, Executor>,

    /// CHECK: payee account enforced by the Executor to match the quote.
    pub payee: UncheckedAccount<'info>,
}

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
    require!(amount > 0, error::TokenBridgeExecutorShim::ZeroBridgeAmount);
    require!(
        recipient_chain > 0
            && recipient_chain != CHAIN_ID
            && !recipient_address.iter().all(|&x| x == 0),
        error::TokenBridgeExecutorShim::InvalidRecipient,
    );

    // These seeds are used to:
    // 1.  Sign the Sender Config's token account to delegate approval
    //     of amount.
    // 2.  Sign Token Bridge program's transfer_wrapped instruction.
    // 3.  Close tmp_token_account.
    let config_seeds = &[
        SenderConfig::SEED_PREFIX.as_ref(),
        &[ctx.accounts.config.bump],
    ];

    // First transfer tokens from payer to tmp_token_account.
    anchor_spl::token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: ctx.accounts.from_token_account.to_account_info(),
                to: ctx.accounts.tmp_token_account.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            },
        ),
        amount,
    )?;

    // Delegate spending to Token Bridge program's authority signer.
    anchor_spl::token::approve(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Approve {
                to: ctx.accounts.tmp_token_account.to_account_info(),
                delegate: ctx.accounts.token_bridge_authority_signer.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            &[&config_seeds[..]],
        ),
        amount,
    )?;

    // Bridge wrapped token with encoded payload.
    transfer_wrapped(
        CpiContext::new_with_signer(
            ctx.accounts.token_bridge_program.to_account_info(),
            token_bridge::TransferWrappedWithPayload {
                payer: ctx.accounts.payer.to_account_info(),
                config: ctx.accounts.token_bridge_config.to_account_info(),
                from: ctx.accounts.tmp_token_account.to_account_info(),
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
                token_program: ctx.accounts.token_program.to_account_info(),
                wormhole_program: ctx.accounts.wormhole_program.to_account_info(),
            },
            &[&config_seeds[..]],
        ),
        nonce,
        amount,
        ctx.accounts.foreign_contract.address,
        recipient_chain,
        0,
    )?;

    // Close tmp_token_account.
    anchor_spl::token::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        anchor_spl::token::CloseAccount {
            account: ctx.accounts.tmp_token_account.to_account_info(),
            destination: ctx.accounts.payer.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        },
        &[&config_seeds[..]],
    ))?;

    // parse the sequence from the account and request execution
    // reading the account after avoids having to handle when the account doesn't exist
    let mut buf = &ctx.accounts.token_bridge_sequence.try_borrow_mut_data()?[..];
    let seq = wormhole::SequenceTracker::try_deserialize(&mut buf)?;
    executor::cpi::request_for_execution(
        CpiContext::new(
            ctx.accounts.executor.to_account_info(),
            executor::cpi::accounts::RequestForExecution {
                payer: ctx.accounts.payer.to_account_info(),
                payee: ctx.accounts.payee.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
            },
        ),
        exec_amount,
        recipient_chain,
        ctx.accounts.foreign_contract.address,
        ctx.accounts.payer.key(),
        signed_quote_bytes,
        make_vaa_v1_request(
            CHAIN_ID,
            ctx.accounts.token_bridge_emitter.key().to_bytes(),
            seq.sequence - 1,
        ),
        relay_instructions,
    )
}
