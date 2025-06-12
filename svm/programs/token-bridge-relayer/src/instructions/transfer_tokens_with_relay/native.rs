declare_program!(executor);

use crate::{
    error::TokenBridgeRelayerError,
    ext::make_vaa_v1_request,
    state::{SenderConfig, SEED_PREFIX_TMP},
    OUR_CHAIN,
};
use anchor_lang::{
    prelude::*,
    system_program::{self, Transfer},
};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::spl_token::native_mint,
    token_interface::{self, Mint, TokenAccount, TokenInterface},
};
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
pub struct TransferNativeWithRelay<'info> {
    #[account(mut)]
    /// Payer will pay Wormhole fee to transfer tokens and create temporary
    /// token account.
    pub payer: Signer<'info>,

    #[account(
        seeds = [SenderConfig::SEED_PREFIX],
        bump = config.bump,
    )]
    /// Sender Config account. Acts as the signer for the Token Bridge token
    /// transfer. Read-only.
    pub config: Box<Account<'info, SenderConfig>>,

    #[account(mut)]
    /// Mint info. This is the SPL token that will be bridged over to the
    /// foreign contract. Mutable.
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init_if_needed, // this is used for a native transfer without a native account
        // TODO: could this account be optional somehow?
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = payer,
        associated_token::token_program = token_program
    )]
    /// Payer's associated token account. We may want to make this a generic
    /// token account in the future.
    pub from_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

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
        token::token_program = token_program
    )]
    /// Program's temporary token account. This account is created before the
    /// instruction is invoked to temporarily take custody of the payer's
    /// tokens. When the tokens are finally bridged out, the token account
    /// will have zero balance and can be closed.
    pub tmp_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: Token Bridge config. Read-only.
    pub token_bridge_config: UncheckedAccount<'info>,

    #[account(mut)]
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

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub wormhole_program: Program<'info, Wormhole>,
    pub token_bridge_program: Program<'info, TokenBridge>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub executor_program: Program<'info, Executor>,

    /// CHECK: Token Bridge program needs clock sysvar.
    pub clock: UncheckedAccount<'info>,

    /// CHECK: Token Bridge program needs rent sysvar.
    pub rent: UncheckedAccount<'info>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct TransferNativeTokensWithRelayArgs {
    pub amount: u64,
    pub recipient_chain: u16,
    pub recipient_address: [u8; 32],
    pub nonce: u32,
    pub wrap_native: bool,
    pub dst_transfer_recipient: [u8; 32],
    pub dst_execution_address: [u8; 32],
    pub exec_amount: u64,
    pub signed_quote_bytes: Vec<u8>,
    pub relay_instructions: Vec<u8>,
}

pub fn transfer_native_tokens_with_relay(
    ctx: Context<TransferNativeWithRelay>,
    args: TransferNativeTokensWithRelayArgs,
) -> Result<()> {
    let TransferNativeTokensWithRelayArgs {
        amount,
        recipient_chain,
        recipient_address,
        nonce,
        wrap_native,
        dst_transfer_recipient,
        dst_execution_address,
        exec_amount,
        signed_quote_bytes,
        relay_instructions,
    } = args;

    let mint = &ctx.accounts.mint;

    // Token Bridge program truncates amounts to 8 decimals, so there will
    // be a residual amount if decimals of the SPL is >8. We need to take
    // into account how much will actually be bridged.
    let truncated_amount = token_bridge::truncate_amount(amount, mint.decimals);
    require!(
        truncated_amount > 0,
        TokenBridgeRelayerError::ZeroBridgeAmount
    );

    let config = &ctx.accounts.config;
    let payer = &ctx.accounts.payer;
    let tmp_token_account = &ctx.accounts.tmp_token_account;
    let token_program = &ctx.accounts.token_program;
    let system_program = &ctx.accounts.system_program;

    // These seeds are used to:
    // 1.  Sign the Sender Config's token account to delegate approval
    //     of truncated_amount.
    // 2.  Sign Token Bridge program's transfer_native instruction.
    // 3.  Close tmp_token_account.
    let config_seeds = &[SenderConfig::SEED_PREFIX.as_ref(), &[config.bump]];

    // If the user wishes to transfer native SOL, we need to transfer the
    // lamports to the tmp_token_account and then convert it to native SOL. Otherwise,
    // we can just transfer the specified token to the tmp_token_account.
    if wrap_native {
        require!(
            mint.key() == native_mint::ID,
            TokenBridgeRelayerError::NativeMintRequired
        );

        // Transfer lamports to the tmp_token_account (these lamports will be our WSOL).
        system_program::transfer(
            CpiContext::new(
                system_program.to_account_info(),
                Transfer {
                    from: payer.to_account_info(),
                    to: tmp_token_account.to_account_info(),
                },
            ),
            truncated_amount,
        )?;

        // Sync the token account based on the lamports we sent it,
        // this is where the wrapping takes place.
        token_interface::sync_native(CpiContext::new(
            token_program.to_account_info(),
            token_interface::SyncNative {
                account: tmp_token_account.to_account_info(),
            },
        ))?;
    } else {
        anchor_spl::token_interface::transfer_checked(
            CpiContext::new(
                token_program.to_account_info(),
                anchor_spl::token_interface::TransferChecked {
                    from: ctx.accounts.from_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: tmp_token_account.to_account_info(),
                    authority: payer.to_account_info(),
                },
            ),
            truncated_amount,
            mint.decimals,
        )?;
    }

    let token_bridge_authority_signer = &ctx.accounts.token_bridge_authority_signer;

    let msg = prepare_transfer(
        PrepareTransfer {
            config,
            tmp_token_account,
            token_bridge_authority_signer,
            token_program,
        },
        truncated_amount,
        recipient_chain,
        recipient_address,
    )?;

    // Bridge native token with encoded payload.
    crate::ext::transfer_native_with_payload(
        CpiContext::new_with_signer(
            ctx.accounts.token_bridge_program.to_account_info(),
            crate::ext::TransferNativeWithPayload {
                payer: payer.to_account_info(),
                config: ctx.accounts.token_bridge_config.to_account_info(),
                from: tmp_token_account.to_account_info(),
                mint: mint.to_account_info(),
                custody: ctx.accounts.token_bridge_custody.to_account_info(),
                authority_signer: token_bridge_authority_signer.to_account_info(),
                custody_signer: ctx.accounts.token_bridge_custody_signer.to_account_info(),
                wormhole_bridge: ctx.accounts.wormhole_bridge.to_account_info(),
                wormhole_message: ctx.accounts.wormhole_message.to_account_info(),
                wormhole_emitter: ctx.accounts.token_bridge_emitter.to_account_info(),
                wormhole_sequence: ctx.accounts.token_bridge_sequence.to_account_info(),
                wormhole_fee_collector: ctx.accounts.wormhole_fee_collector.to_account_info(),
                clock: ctx.accounts.clock.to_account_info(),
                sender: config.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
                system_program: system_program.to_account_info(),
                token_program: token_program.to_account_info(),
                wormhole_program: ctx.accounts.wormhole_program.to_account_info(),
            },
            &[config_seeds],
        ),
        nonce,
        truncated_amount,
        dst_transfer_recipient,
        recipient_chain,
        msg.try_to_vec()?,
        &crate::ID,
    )?;

    // Finish instruction by closing tmp_token_account.
    anchor_spl::token_interface::close_account(CpiContext::new_with_signer(
        token_program.to_account_info(),
        anchor_spl::token_interface::CloseAccount {
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
