// SPDX-License-Identifier: Apache 2

/// This module implements the destination chain redemption logic for Token Bridge
/// Relayer v4 with Executor integration.
///
/// Key features:
/// - NO relayer fee deduction (fees paid via Executor in native gas)
/// - NO native token swaps (gas drop-offs handled by Executor)
/// - NO state checks (permissionless, no token/contract registration)
/// - Simply parses the minimal 32-byte payload and sends all tokens to recipient
///
/// This module provides ONLY the Executor callback. If Executor fails or for
/// standard Token Bridge transfers, users should use Portal SDK directly.
module token_bridge_relayer::redeem {
    use token_bridge_relayer::message;
    use token_bridge_relayer::state::{Self, State};
    use token_bridge::complete_transfer_with_payload;
    use token_bridge::transfer_with_payload;

    /// Execute VAA v1 - Called by Executor relayer network
    ///
    /// This function:
    /// 1. Completes the Token Bridge transfer (validates VAA, mints/releases tokens)
    /// 2. Parses the minimal 32-byte payload to extract recipient
    /// 3. Transfers ALL tokens to the recipient (no fee deduction)
    ///
    /// Args:
    /// relayer_state: The relayer's State (contains EmitterCap)
    /// receipt: RedeemerReceipt from Token Bridge authorization
    ///
    /// Types:
    /// "C": The coin type being transferred (e.g., USDC, WETH, etc.)
    ///
    /// Note: This is called by the Executor relayer, not by the end user.
    /// The relayer has already been paid via Executor in native gas on source chain.
    public fun execute_vaa_v1<C>(
        relayer_state: &State,
        receipt: complete_transfer_with_payload::RedeemerReceipt<C>
    ) {
        // Get the EmitterCap from our relayer state
        let emitter_cap = state::emitter_cap(relayer_state);

        // Complete the Token Bridge transfer
        // This validates the VAA, checks replay protection, and mints/releases tokens
        let (coins, transfer_payload, _emitter_chain) =
            complete_transfer_with_payload::redeem_coin<C>(
                emitter_cap,
                receipt
            );

        // Deserialize the payload to get the recipient address
        let recipient = message::deserialize(transfer_with_payload::payload(&transfer_payload))
            .recipient()
            .to_address();

        // Transfer all tokens to recipient, no fee deducted
        sui::transfer::public_transfer(coins, recipient);
    }
}
