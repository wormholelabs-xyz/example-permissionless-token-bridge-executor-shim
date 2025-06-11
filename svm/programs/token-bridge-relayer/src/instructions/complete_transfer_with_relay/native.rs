use crate::{
    error::TokenBridgeRelayerError,
    message::TokenBridgeRelayerMessage,
    state::{RedeemerConfig, SEED_PREFIX_TMP},
    PostedTokenBridgeRelayerMessage, OUR_CHAIN,
};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::spl_token::native_mint,
    token_interface::{Mint, TokenAccount, TokenInterface},
};
use wormhole_anchor_sdk::{
    token_bridge::{self, program::TokenBridge},
    wormhole::{program::Wormhole, SEED_PREFIX_POSTED_VAA},
};

use super::{redeem_token, RedeemToken};

#[derive(Accounts)]
#[instruction(vaa_hash: [u8; 32])]
pub struct CompleteNativeWithRelay<'info> {
    #[account(mut)]
    /// Payer will pay Wormhole fee to transfer tokens and create temporary
    /// token account.
    pub payer: Signer<'info>,

    #[account(
        seeds = [RedeemerConfig::SEED_PREFIX],
        bump = config.bump
    )]
    /// Redeemer Config account. Acts as the Token Bridge redeemer, which signs
    /// for the complete transfer instruction. Read-only.
    pub config: Box<Account<'info, RedeemerConfig>>,

    /// Mint info. This is the SPL token that will be bridged over from the
    /// foreign contract. This must match the token address specified in the
    /// signed Wormhole message. Read-only.
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = recipient,
        associated_token::token_program = token_program
    )]
    /// Recipient associated token account. The recipient authority check
    /// is necessary to ensure that the recipient is the intended recipient
    /// of the bridged tokens and create the token account if needed. Mutable.
    pub recipient_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    /// CHECK: recipient may differ from payer if a relayer paid for this
    /// transaction. This instruction verifies that the recipient key
    /// passed in this context matches the intended recipient in the vaa.
    pub recipient: AccountInfo<'info>,

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
    /// tokens. When the tokens are finally bridged in, the tokens will be
    /// transferred to the destination token accounts. This account will have
    /// zero balance and can be closed.
    pub tmp_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: Token Bridge config. Read-only.
    pub token_bridge_config: UncheckedAccount<'info>,

    #[account(
        seeds = [
            SEED_PREFIX_POSTED_VAA,
            &vaa_hash
        ],
        bump,
        seeds::program = wormhole_program.key(),
        constraint = vaa.data().to() == crate::ID @ TokenBridgeRelayerError::InvalidTransferToAddress,
        constraint = vaa.data().to_chain() == OUR_CHAIN @ TokenBridgeRelayerError::InvalidTransferToChain,
        constraint = vaa.data().token_chain() == OUR_CHAIN @ TokenBridgeRelayerError::InvalidTransferTokenChain
    )]
    /// Verified Wormhole message account. The Wormhole program verified
    /// signatures and posted the account data here. Read-only.
    pub vaa: Box<Account<'info, PostedTokenBridgeRelayerMessage>>,

    #[account(
        mut,
        constraint = token_bridge_claim.data_is_empty() @ TokenBridgeRelayerError::AlreadyRedeemed
    )]
    /// CHECK: Token Bridge claim account. It stores a boolean, whose value
    /// is true if the bridged assets have been claimed. If the transfer has
    /// not been redeemed, this account will not exist yet.
    ///
    /// NOTE: The Token Bridge program's claim account is only initialized when
    /// a transfer is redeemed (and the boolean value `true` is written as
    /// its data).
    ///
    /// The Token Bridge program will automatically fail if this transfer
    /// is redeemed again. But we choose to short-circuit the failure as the
    /// first evaluation of this instruction.
    pub token_bridge_claim: AccountInfo<'info>,

    /// CHECK: Token Bridge foreign endpoint. This account should really be one
    /// endpoint per chain, but the PDA allows for multiple endpoints for each
    /// chain! We store the proper endpoint for the emitter chain.
    pub token_bridge_foreign_endpoint: UncheckedAccount<'info>,

    /// CHECK: Token Bridge custody. This is the Token Bridge program's token
    /// account that holds this mint's balance.
    #[account(mut)]
    pub token_bridge_custody: UncheckedAccount<'info>,

    /// CHECK: Token Bridge custody signer. Read-only.
    pub token_bridge_custody_signer: UncheckedAccount<'info>,

    pub wormhole_program: Program<'info, Wormhole>,
    pub token_bridge_program: Program<'info, TokenBridge>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,

    /// CHECK: Token Bridge program needs rent sysvar.
    pub rent: UncheckedAccount<'info>,
}

pub fn complete_native_transfer_with_relay(
    ctx: Context<CompleteNativeWithRelay>,
    _vaa_hash: [u8; 32],
) -> Result<()> {
    // The intended recipient must agree with the recipient account.
    let TokenBridgeRelayerMessage { recipient } = *ctx.accounts.vaa.message().data();
    require!(
        ctx.accounts.recipient.key() == Pubkey::from(recipient),
        TokenBridgeRelayerError::InvalidRecipient
    );

    // These seeds are used to:
    // 1.  Redeem Token Bridge program's
    //     complete_transfer_native_with_payload.
    // 2.  Transfer tokens to recipient.
    // 3.  Close tmp_token_account.
    let config_seeds = &[
        RedeemerConfig::SEED_PREFIX.as_ref(),
        &[ctx.accounts.config.bump],
    ];

    // Redeem the token transfer to the tmp_token_account.
    token_bridge::complete_transfer_native_with_payload(CpiContext::new_with_signer(
        ctx.accounts.token_bridge_program.to_account_info(),
        token_bridge::CompleteTransferNativeWithPayload {
            payer: ctx.accounts.payer.to_account_info(),
            config: ctx.accounts.token_bridge_config.to_account_info(),
            vaa: ctx.accounts.vaa.to_account_info(),
            claim: ctx.accounts.token_bridge_claim.to_account_info(),
            foreign_endpoint: ctx.accounts.token_bridge_foreign_endpoint.to_account_info(),
            to: ctx.accounts.tmp_token_account.to_account_info(),
            redeemer: ctx.accounts.config.to_account_info(),
            custody: ctx.accounts.token_bridge_custody.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            custody_signer: ctx.accounts.token_bridge_custody_signer.to_account_info(),
            rent: ctx.accounts.rent.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            wormhole_program: ctx.accounts.wormhole_program.to_account_info(),
        },
        &[config_seeds],
    ))?;

    // Denormalize the transfer amount encoded in
    // the VAA.
    let amount = token_bridge::denormalize_amount(
        ctx.accounts.vaa.data().amount(),
        ctx.accounts.mint.decimals,
    );

    // Check to see if the transfer is for wrapped SOL. If it is,
    // unwrap and transfer the SOL to the recipient and relayer.
    // Since we are unwrapping the SOL, this contract will not
    // perform a swap with the off-chain relayer.
    if ctx.accounts.mint.key() == native_mint::ID {
        // Transfer all lamports to the recipient.
        anchor_spl::token_interface::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token_interface::CloseAccount {
                account: ctx.accounts.tmp_token_account.to_account_info(),
                destination: ctx.accounts.recipient.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            &[config_seeds],
        ))?;

        Ok(())
    } else {
        redeem_token(
            RedeemToken {
                payer: &ctx.accounts.payer,
                config: &ctx.accounts.config,
                mint: &ctx.accounts.mint,
                recipient_token_account: &ctx.accounts.recipient_token_account,
                tmp_token_account: &ctx.accounts.tmp_token_account,
                token_program: &ctx.accounts.token_program,
            },
            amount,
        )
    }
}
