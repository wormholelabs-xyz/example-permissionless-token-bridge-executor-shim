use anchor_lang::{prelude::*, solana_program, InstructionData};
use anchor_spl::{associated_token::get_associated_token_address, token::Token};
use wormhole_anchor_sdk::{
    token_bridge::program::TokenBridge,
    wormhole::{program::Wormhole, SEED_PREFIX_POSTED_VAA},
};
use wormhole_raw_vaas::{token_bridge::TokenBridgePayload, Body};

use crate::{
    error::TokenBridgeRelayerError,
    instruction::{CompleteNativeTransferWithRelay, CompleteWrappedTransferWithRelay},
    state::{RedeemerConfig, SEED_PREFIX_TMP},
    OUR_CHAIN,
};

#[derive(Accounts)]
pub struct ExecuteVaaV1 {}

#[derive(AnchorSerialize)]
pub struct AcctMeta {
    /// An account's public key.
    pub pubkey: Pubkey,
    /// True if an `Instruction` requires a `Transaction` signature matching `pubkey`.
    pub is_signer: bool,
    /// True if the account data or metadata may be mutated during program execution.
    pub is_writable: bool,
}

#[derive(AnchorSerialize)]
pub struct Ix {
    /// Pubkey of the program that executes this instruction.
    pub program_id: Pubkey,
    /// Metadata describing accounts that should be passed to the program.
    pub accounts: Vec<AcctMeta>,
    /// Opaque data passed to the program for its own interpretation.
    pub data: Vec<u8>,
}

const PAYER: &[u8; 32] = b"payer000000000000000000000000000";

pub fn execute_vaa_v1(_ctx: Context<ExecuteVaaV1>, vaa_body: Vec<u8>) -> Result<Ix> {
    // Compute the message hash.
    let message_hash = solana_program::keccak::hashv(&[&vaa_body]).to_bytes();
    // Parse the body.
    let body = Body::parse(&vaa_body).map_err(|_| TokenBridgeRelayerError::FailedToParseVaaBody)?;
    let payload = TokenBridgePayload::try_from(body.payload())
        .map_err(|_| TokenBridgeRelayerError::FailedToParseVaaBody)?
        .message();
    let transfer_with_message = payload
        .transfer_with_message()
        .ok_or(TokenBridgeRelayerError::FailedToParseVaaBody)?;
    // Calculate shared accounts
    let (config, _) = Pubkey::find_program_address(&[RedeemerConfig::SEED_PREFIX], &crate::ID);
    let (token_bridge_config, _) = Pubkey::find_program_address(&[b"config"], &TokenBridge::id());
    let (vaa, _) =
        Pubkey::find_program_address(&[SEED_PREFIX_POSTED_VAA, &message_hash], &Wormhole::id());
    let (token_bridge_claim, _) = Pubkey::find_program_address(
        &[
            &body.emitter_address(),
            &body.emitter_chain().to_be_bytes(),
            &body.sequence().to_be_bytes(),
        ],
        &TokenBridge::id(),
    );
    let (token_bridge_foreign_endpoint, _) = Pubkey::find_program_address(
        &[&body.emitter_chain().to_be_bytes(), &body.emitter_address()],
        &TokenBridge::id(),
    );
    // Build instruction
    if transfer_with_message.token_chain() == OUR_CHAIN {
        let data = CompleteNativeTransferWithRelay {
            _vaa_hash: message_hash,
        };
        let mint = Pubkey::new_from_array(transfer_with_message.token_address());
        let recipient = Pubkey::new_from_array(
            transfer_with_message.payload().as_ref()[0..32]
                .try_into()
                .unwrap(),
        );
        let (tmp_token_account, _) =
            Pubkey::find_program_address(&[SEED_PREFIX_TMP, &mint.to_bytes()], &crate::ID);
        let (token_bridge_custody, _) =
            Pubkey::find_program_address(&[&mint.to_bytes()], &TokenBridge::id());
        let (token_bridge_custody_signer, _) =
            Pubkey::find_program_address(&[b"custody_signer"], &TokenBridge::id());
        Ok(Ix {
            program_id: crate::ID,
            data: data.data(),
            accounts: vec![
                AcctMeta {
                    pubkey: Pubkey::from(*PAYER),
                    is_writable: true,
                    is_signer: true,
                },
                AcctMeta {
                    pubkey: config,
                    is_writable: false,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: mint,
                    is_writable: false,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: get_associated_token_address(&recipient, &mint),
                    is_writable: true,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: recipient,
                    is_writable: true,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: tmp_token_account,
                    is_writable: true,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: token_bridge_config,
                    is_writable: false,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: vaa,
                    is_writable: false,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: token_bridge_claim,
                    is_writable: true,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: token_bridge_foreign_endpoint,
                    is_writable: false,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: token_bridge_custody,
                    is_writable: true,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: token_bridge_custody_signer,
                    is_writable: false,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: Wormhole::id(),
                    is_writable: false,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: TokenBridge::id(),
                    is_writable: false,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: System::id(),
                    is_writable: false,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: Token::id(),
                    is_writable: false,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: solana_program::sysvar::rent::id(),
                    is_writable: false,
                    is_signer: false,
                },
            ],
        })
    } else {
        let data = CompleteWrappedTransferWithRelay {
            _vaa_hash: message_hash,
        };
        let (token_bridge_wrapped_mint, _) = Pubkey::find_program_address(
            &[
                b"wrapped",
                &transfer_with_message.token_chain().to_be_bytes(),
                &transfer_with_message.token_address(),
            ],
            &TokenBridge::id(),
        );
        let recipient = Pubkey::new_from_array(
            transfer_with_message.payload().as_ref()[0..32]
                .try_into()
                .unwrap(),
        );
        let (tmp_token_account, _) = Pubkey::find_program_address(
            &[SEED_PREFIX_TMP, &token_bridge_wrapped_mint.to_bytes()],
            &crate::ID,
        );
        let (token_bridge_wrapped_meta, _) = Pubkey::find_program_address(
            &[b"meta", &token_bridge_wrapped_mint.to_bytes()],
            &TokenBridge::id(),
        );
        let (token_bridge_mint_authority, _) =
            Pubkey::find_program_address(&[b"mint_signer"], &TokenBridge::id());
        Ok(Ix {
            program_id: crate::ID,
            data: data.data(),
            accounts: vec![
                AcctMeta {
                    pubkey: Pubkey::from(*PAYER),
                    is_writable: true,
                    is_signer: true,
                },
                AcctMeta {
                    pubkey: config,
                    is_writable: false,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: token_bridge_wrapped_mint,
                    is_writable: false,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: get_associated_token_address(&recipient, &token_bridge_wrapped_mint),
                    is_writable: true,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: recipient,
                    is_writable: true,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: tmp_token_account,
                    is_writable: true,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: token_bridge_wrapped_meta,
                    is_writable: false,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: token_bridge_config,
                    is_writable: false,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: vaa,
                    is_writable: false,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: token_bridge_claim,
                    is_writable: true,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: token_bridge_foreign_endpoint,
                    is_writable: false,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: token_bridge_mint_authority,
                    is_writable: true,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: Wormhole::id(),
                    is_writable: false,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: TokenBridge::id(),
                    is_writable: false,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: System::id(),
                    is_writable: false,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: Token::id(),
                    is_writable: false,
                    is_signer: false,
                },
                AcctMeta {
                    pubkey: solana_program::sysvar::rent::id(),
                    is_writable: false,
                    is_signer: false,
                },
            ],
        })
    }
}
