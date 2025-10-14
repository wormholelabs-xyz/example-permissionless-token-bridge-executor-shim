// SPDX-License-Identifier: Apache 2

/// This minimal payload works with the Executor infrastructure which handles
/// fees and gas drop-offs separately via relay instructions.
module token_bridge_relayer::message {
    use wormhole::cursor;
    use wormhole::external_address::{Self, ExternalAddress};

    const E_INVALID_PAYLOAD_LENGTH: u64 = 0;

    /// Minimal v4 payload - Only 32-byte recipient address (EVM, Solana, Sui, etc.)
    public struct TransferWithRelay has drop {
        recipient: ExternalAddress,
    }

    public fun new(recipient: ExternalAddress): TransferWithRelay {
        TransferWithRelay { recipient }
    }

    public fun serialize(transfer: TransferWithRelay): vector<u8> {
        external_address::to_bytes(transfer.recipient)
    }

    public fun deserialize(buf: vector<u8>): TransferWithRelay {
        assert!(
            vector::length(&buf) == 32,
            E_INVALID_PAYLOAD_LENGTH
        );

        let mut cur = cursor::new(buf);
        let recipient = external_address::take_bytes(&mut cur);
        cursor::destroy_empty(cur);

        new(recipient)
    }

    public fun recipient(self: &TransferWithRelay): ExternalAddress {
        self.recipient
    }
}
