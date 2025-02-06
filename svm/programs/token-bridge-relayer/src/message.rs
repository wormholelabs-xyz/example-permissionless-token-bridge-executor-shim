use anchor_lang::prelude::*;

use wormhole_anchor_sdk::token_bridge;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct TokenBridgeRelayerMessage {
    pub recipient: [u8; 32],
}

pub type PostedTokenBridgeRelayerMessage =
    token_bridge::PostedTransferWith<TokenBridgeRelayerMessage>;
