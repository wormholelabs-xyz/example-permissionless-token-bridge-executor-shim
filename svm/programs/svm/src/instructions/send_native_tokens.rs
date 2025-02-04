declare_program!(executor);

use anchor_lang::{prelude::*, solana_program};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};
use executor::program::Executor;
use wormhole_anchor_sdk::{
    token_bridge::{self, program::TokenBridge, Instruction, TransferNativeWithPayload},
    wormhole::{self, program::Wormhole},
};

use crate::{
    error,
    ext::make_vaa_v1_request,
    state::{SenderConfig, SEED_PREFIX_TMP},
    CHAIN_ID,
};

// This is not included in the anchor sdk
pub fn transfer_native<'info>(
    // accounts are the same as TransferNativeWithPayload
    ctx: CpiContext<'_, '_, '_, 'info, TransferNativeWithPayload<'info>>,
    nonce: u32,
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
            AccountMeta::new(ctx.accounts.mint.key(), false),
            AccountMeta::new(ctx.accounts.custody.key(), false),
            AccountMeta::new_readonly(ctx.accounts.authority_signer.key(), false),
            AccountMeta::new_readonly(ctx.accounts.custody_signer.key(), false),
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
        data: Instruction::TransferNative {
            batch_id: nonce,
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
pub struct SendNativeTokens<'info> {
    /// Payer will pay Wormhole fee to transfer tokens and create temporary
    /// token account.
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds = [SenderConfig::SEED_PREFIX],
        bump = config.bump
    )]
    /// Sender Config account. Acts as the signer for the Token Bridge token
    /// transfer. Read-only.
    pub config: Box<Account<'info, SenderConfig>>,

    #[account(mut)]
    /// Mint info. This is the SPL token that will be bridged over to the
    /// foreign contract. Mutable.
    pub mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = mint,
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
            mint.key().as_ref(),
        ],
        bump,
        token::mint = mint,
        token::authority = config,
    )]
    /// Program's temporary token account. This account is created before the
    /// instruction is invoked to temporarily take custody of the payer's
    /// tokens. When the tokens are finally bridged out, the token account
    /// will have zero balance and can be closed.
    pub tmp_token_account: Box<Account<'info, TokenAccount>>,

    /// Wormhole program.
    pub wormhole_program: Program<'info, Wormhole>,

    /// Token Bridge program.
    pub token_bridge_program: Program<'info, TokenBridge>,

    /// CHECK: Token Bridge config. Read-only.
    pub token_bridge_config: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [mint.key().as_ref()],
        bump,
        seeds::program = token_bridge_program.key
    )]
    /// CHECK: Token Bridge custody. This is the Token Bridge program's token
    /// account that holds this mint's balance. This account needs to be
    /// unchecked because a token account may not have been created for this
    /// mint yet. Mutable.
    pub token_bridge_custody: UncheckedAccount<'info>,

    /// CHECK: Token Bridge authority signer. Read-only.
    pub token_bridge_authority_signer: UncheckedAccount<'info>,

    /// CHECK: Token Bridge custody signer. Read-only.
    pub token_bridge_custody_signer: UncheckedAccount<'info>,

    #[account(mut)]
    /// CHECK: Wormhole bridge data. Mutable.
    pub wormhole_bridge: UncheckedAccount<'info>,

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
    /// CHECK: Wormhole fee collector. Mutable.
    pub wormhole_fee_collector: UncheckedAccount<'info>,

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

pub fn send_native_tokens(
    ctx: Context<SendNativeTokens>,
    nonce: u32,
    amount: u64,
    recipient_address: [u8; 32],
    recipient_chain: u16,
    destination_shim: [u8; 32],
    exec_amount: u64,
    signed_quote_bytes: Vec<u8>,
    relay_instructions: Vec<u8>,
) -> Result<()> {
    // Token Bridge program truncates amounts to 8 decimals, so there will
    // be a residual amount if decimals of SPL is >8. We need to take into
    // account how much will actually be bridged.
    let truncated_amount = token_bridge::truncate_amount(amount, ctx.accounts.mint.decimals);
    require!(
        truncated_amount > 0,
        error::TokenBridgeExecutorShim::ZeroBridgeAmount
    );
    if truncated_amount != amount {
        msg!(
            "SendNativeTokens :: truncating amount {} to {}",
            amount,
            truncated_amount
        );
    }

    require!(
        recipient_chain > 0
            && recipient_chain != CHAIN_ID
            && !recipient_address.iter().all(|&x| x == 0),
        error::TokenBridgeExecutorShim::InvalidRecipient,
    );

    // These seeds are used to:
    // 1.  Sign the Sender Config's token account to delegate approval
    //     of truncated_amount.
    // 2.  Sign Token Bridge program's transfer_native instruction.
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
        truncated_amount,
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
        truncated_amount,
    )?;

    // Bridge native token with encoded payload.
    transfer_native(
        CpiContext::new_with_signer(
            ctx.accounts.token_bridge_program.to_account_info(),
            token_bridge::TransferNativeWithPayload {
                payer: ctx.accounts.payer.to_account_info(),
                config: ctx.accounts.token_bridge_config.to_account_info(),
                from: ctx.accounts.tmp_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                custody: ctx.accounts.token_bridge_custody.to_account_info(),
                authority_signer: ctx.accounts.token_bridge_authority_signer.to_account_info(),
                custody_signer: ctx.accounts.token_bridge_custody_signer.to_account_info(),
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
        truncated_amount,
        recipient_address,
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
        destination_shim,
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
