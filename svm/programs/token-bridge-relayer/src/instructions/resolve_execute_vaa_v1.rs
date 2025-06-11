use anchor_lang::{
    prelude::*,
    solana_program::{self, instruction::Instruction},
    InstructionData,
};
use anchor_spl::associated_token::{get_associated_token_address_with_program_id, AssociatedToken};
use executor_account_resolver_svm::{
    InstructionGroup, InstructionGroups, MissingAccounts, Resolver, RESOLVER_PUBKEY_PAYER,
    RESOLVER_PUBKEY_POSTED_VAA,
};
use wormhole_anchor_sdk::{token_bridge::program::TokenBridge, wormhole::program::Wormhole};
use wormhole_raw_vaas::{token_bridge::TokenBridgePayload, Body};

use crate::{
    error::TokenBridgeRelayerError,
    instruction::{CompleteNativeTransferWithRelay, CompleteWrappedTransferWithRelay},
    state::{RedeemerConfig, SEED_PREFIX_TMP},
    OUR_CHAIN,
};

#[derive(Accounts)]
pub struct ResolveExecuteVaaV1 {}

pub fn find_account<'c, 'info>(
    accs: &'c [AccountInfo<'info>],
    pubkey: Pubkey,
) -> Option<&'c AccountInfo<'info>> {
    accs.iter().find(|acc_info| *acc_info.key == pubkey)
}

pub fn missing_account(pubkey: Pubkey) -> Resolver<InstructionGroups> {
    Resolver::Missing(MissingAccounts {
        accounts: vec![pubkey],
        address_lookup_tables: vec![],
    })
}

pub fn resolve_execute_vaa_v1(
    ctx: Context<ResolveExecuteVaaV1>,
    vaa_body: Vec<u8>,
) -> Result<Resolver<InstructionGroups>> {
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
    let (redeemer, _) = Pubkey::find_program_address(&[RedeemerConfig::SEED_PREFIX], &crate::ID);
    let (token_bridge_config, _) = Pubkey::find_program_address(&[b"config"], &TokenBridge::id());
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
        let mint_info = if let Some(acc_info) = find_account(ctx.remaining_accounts, mint) {
            acc_info
        } else {
            return Ok(missing_account(mint));
        };
        let token_program = *mint_info.owner;
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
        Ok(Resolver::Resolved(InstructionGroups(vec![
            InstructionGroup {
                instructions: vec![Instruction {
                    program_id: crate::ID,
                    data: data.data(),
                    accounts: vec![
                        AccountMeta {
                            pubkey: RESOLVER_PUBKEY_PAYER,
                            is_writable: true,
                            is_signer: true,
                        },
                        AccountMeta {
                            pubkey: redeemer,
                            is_writable: false,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: mint,
                            is_writable: false,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: get_associated_token_address_with_program_id(
                                &recipient,
                                &mint,
                                &token_program,
                            ),
                            is_writable: true,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: recipient,
                            is_writable: true,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: tmp_token_account,
                            is_writable: true,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: token_bridge_config,
                            is_writable: false,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: RESOLVER_PUBKEY_POSTED_VAA,
                            is_writable: false,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: token_bridge_claim,
                            is_writable: true,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: token_bridge_foreign_endpoint,
                            is_writable: false,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: token_bridge_custody,
                            is_writable: true,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: token_bridge_custody_signer,
                            is_writable: false,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: Wormhole::id(),
                            is_writable: false,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: TokenBridge::id(),
                            is_writable: false,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: token_program,
                            is_writable: false,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: AssociatedToken::id(),
                            is_writable: false,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: System::id(),
                            is_writable: false,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: solana_program::sysvar::rent::id(),
                            is_writable: false,
                            is_signer: false,
                        },
                    ],
                }
                .into()],
                address_lookup_tables: vec![],
            },
        ])))
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
        let mint_info = if let Some(acc_info) =
            find_account(ctx.remaining_accounts, token_bridge_wrapped_mint)
        {
            acc_info
        } else {
            return Ok(missing_account(token_bridge_wrapped_mint));
        };
        let token_program = *mint_info.owner;
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
        Ok(Resolver::Resolved(InstructionGroups(vec![
            InstructionGroup {
                instructions: vec![Instruction {
                    program_id: crate::ID,
                    data: data.data(),
                    accounts: vec![
                        AccountMeta {
                            pubkey: RESOLVER_PUBKEY_PAYER,
                            is_writable: true,
                            is_signer: true,
                        },
                        AccountMeta {
                            pubkey: redeemer,
                            is_writable: false,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: token_bridge_wrapped_mint,
                            is_writable: false,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: get_associated_token_address_with_program_id(
                                &recipient,
                                &token_bridge_wrapped_mint,
                                &token_program,
                            ),
                            is_writable: true,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: recipient,
                            is_writable: true,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: tmp_token_account,
                            is_writable: true,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: token_bridge_wrapped_meta,
                            is_writable: false,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: token_bridge_config,
                            is_writable: false,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: RESOLVER_PUBKEY_POSTED_VAA,
                            is_writable: false,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: token_bridge_claim,
                            is_writable: true,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: token_bridge_foreign_endpoint,
                            is_writable: false,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: token_bridge_mint_authority,
                            is_writable: true,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: Wormhole::id(),
                            is_writable: false,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: TokenBridge::id(),
                            is_writable: false,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: token_program,
                            is_writable: false,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: AssociatedToken::id(),
                            is_writable: false,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: System::id(),
                            is_writable: false,
                            is_signer: false,
                        },
                        AccountMeta {
                            pubkey: solana_program::sysvar::rent::id(),
                            is_writable: false,
                            is_signer: false,
                        },
                    ],
                }
                .into()],
                address_lookup_tables: vec![],
            },
        ])))
    }
}
