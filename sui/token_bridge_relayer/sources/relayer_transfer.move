// SPDX-License-Identifier: Apache 2

module token_bridge_relayer::relayer_transfer {
    use sui::coin::Coin;
    use sui::clock::Clock;
    use sui::sui::SUI;

    use token_bridge::state::{State as TokenBridgeState};
    use token_bridge::transfer_tokens_with_payload;
    use token_bridge::token_registry::VerifiedAsset;
    use token_bridge::coin_utils;

    use token_bridge_relayer::message;
    use token_bridge_relayer::state::{Self, State};

    use wormhole::external_address;
    use wormhole::bytes32;
    use wormhole::publish_message;

    use executor::executor;
    use executor_requests::executor_requests;

    const E_INVALID_RECIPIENT_LENGTH: u64 = 0;
    const CHAIN_ID: u16 = 21;

    /// Transfer tokens with Executor relay request
    ///
    /// This function:
    /// 1. Validates the recipient address (must be 32 bytes)
    /// 2. Creates the minimal v4 payload (32-byte recipient only)
    /// 3. Prepares Token Bridge transfer (type 3 = transfer_with_payload)
    /// 4. Publishes the message to Wormhole to get sequence number
    /// 5. Requests execution via Executor
    /// 6. Returns the sequence number for tracking
    ///
    /// Example usage in TypeScript:
    /// ```typescript
    /// tx.moveCall({
    ///   target: `${packageId}::relayer_transfer::transfer_tokens_with_relay`,
    ///   arguments: [
    ///     tx.object(relayerStateId),        // Our relayer's State (shared object)
    ///     tx.object(wormholeStateId),       // Wormhole state
    ///     tx.object(tokenBridgeStateId),    // Token Bridge state
    ///     coin,
    ///     tx.object(assetInfoId),
    ///     messageFee,                       // SUI coin for Wormhole message fee
    ///     executorCoin,                     // SUI coin for Executor payment
    ///     tx.object(CLOCK_ID),
    ///     tx.pure.u16(targetChain),
    ///     tx.pure.vector("u8", recipientBytes),
    ///     tx.pure.address(dstExecutionAddress),
    ///     tx.pure.address(refundAddress),
    ///     tx.pure.vector("u8", signedQuote),
    ///     tx.pure.vector("u8", relayInstructions),
    ///     tx.pure.u32(nonce),
    ///   ],
    ///   typeArguments: [coinType],
    /// });
    /// ```
    public fun transfer_tokens_with_relay<C>(
        relayer_state: &State,
        wormhole_state: &mut wormhole::state::State,
        token_bridge_state: &mut TokenBridgeState,
        coins: Coin<C>,
        asset_info: VerifiedAsset<C>,
        message_fee: Coin<SUI>,
        executor_payment: Coin<SUI>,
        clock: &Clock,
        target_chain: u16,
        recipient: vector<u8>,
        dst_execution_address: address,
        refund_addr: address,
        signed_quote: vector<u8>,
        relay_instructions: vector<u8>,
        nonce: u32,
        ctx: &sui::tx_context::TxContext
    ): u64 {
        assert!(
            vector::length(&recipient) == 32,
            E_INVALID_RECIPIENT_LENGTH
        );

        // Compose payload and serialize
        let recipient_bytes32 = bytes32::new(recipient);
        let recipient_external = external_address::new(recipient_bytes32);
        let msg = message::new(recipient_external);
        let payload = message::serialize(msg);

        // Get our own EmitterCap from relayer state
        let emitter_cap = state::emitter_cap(relayer_state);

        let (prepared_transfer, dust) = transfer_tokens_with_payload::prepare_transfer<C>(
            emitter_cap,
            asset_info,
            coins,
            target_chain,
            external_address::to_bytes(
                external_address::from_address(dst_execution_address)
            ),
            payload,
            nonce
        );

        // Return dust to sender (if any)
        coin_utils::return_nonzero(dust, ctx);

        // Complete the Token Bridge transfer and get MessageTicket
        let message_ticket = transfer_tokens_with_payload::transfer_tokens_with_payload(
            token_bridge_state,
            prepared_transfer
        );

        // Publish the message to Wormhole and get sequence number
        let sequence = publish_message::publish_message(
            wormhole_state,
            message_fee,
            message_ticket,
            clock
        );

        // Get our relayer's emitter address for Executor VAA request
        // The emitter address is derived from the EmitterCap's object ID
        let emitter_address = external_address::to_bytes(
            external_address::from_address(
                object::id_to_address(&object::id(emitter_cap))
            )
        );

        // Build Executor VAA v1 request
        let request_bytes = executor_requests::make_vaa_v1_request(
            CHAIN_ID,
            emitter_address,
            sequence
        );

        // Request execution via Executor
        executor::request_execution(
            executor_payment,
            clock,
            target_chain,
            dst_execution_address,
            refund_addr,
            signed_quote,
            request_bytes,
            relay_instructions
        );

        sequence
    }
}
