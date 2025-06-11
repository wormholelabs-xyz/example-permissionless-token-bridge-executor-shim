mod native;
mod wrapped;

pub use native::*;
pub use wrapped::*;

use crate::{
    error::TokenBridgeRelayerError, message::TokenBridgeRelayerMessage, state::SenderConfig,
    utils::valid_foreign_address,
};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{TokenAccount, TokenInterface};

struct PrepareTransfer<'ctx, 'info> {
    pub config: &'ctx Account<'info, SenderConfig>,
    pub tmp_token_account: &'ctx InterfaceAccount<'info, TokenAccount>,
    pub token_bridge_authority_signer: &'ctx UncheckedAccount<'info>,
    pub token_program: &'ctx Interface<'info, TokenInterface>,
}

fn prepare_transfer(
    prepare_transfer: PrepareTransfer,
    amount: u64,
    recipient_chain: u16,
    recipient: [u8; 32],
) -> Result<TokenBridgeRelayerMessage> {
    let PrepareTransfer {
        config,
        tmp_token_account,
        token_bridge_authority_signer,
        token_program,
    } = prepare_transfer;
    require!(
        valid_foreign_address(recipient_chain, &recipient),
        TokenBridgeRelayerError::InvalidRecipient,
    );

    // These seeds are used to:
    // 1.  Sign the Sender Config's token account to delegate approval
    //     of amount.
    // 2.  Sign Token Bridge program's transfer_wrapped instruction.
    // 3.  Close tmp_token_account.
    let config_seeds = &[SenderConfig::SEED_PREFIX.as_ref(), &[config.bump]];

    // Delegate spending to Token Bridge program's authority signer.
    anchor_spl::token_interface::approve(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            anchor_spl::token_interface::Approve {
                to: tmp_token_account.to_account_info(),
                delegate: token_bridge_authority_signer.to_account_info(),
                authority: config.to_account_info(),
            },
            &[config_seeds],
        ),
        amount,
    )?;

    // Serialize TokenBridgeRelayerMessage as encoded payload for Token Bridge
    // transfer.
    Ok(TokenBridgeRelayerMessage { recipient })
}
