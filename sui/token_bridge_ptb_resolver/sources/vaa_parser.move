// SPDX-License-Identifier: Apache 2

// VAA Structure:
// - Header (variable length due to signatures)
// - Payload (Token Bridge transfer_with_payload for type 3)
module token_bridge_ptb_resolver::vaa_parser {

    // Invalid payload type (must be 3 for transfer_with_payload)
    const E_INVALID_PAYLOAD_TYPE: u64 = 0;
    // Invalid VAA length
    const E_INVALID_VAA_LENGTH: u64 = 1;
    // Too many signatures (exceeds mainnet guardian set size)
    const E_TOO_MANY_SIGNATURES: u64 = 2;

    // Expected payload type for Token Bridge transfer_with_payload
    const TRANSFER_WITH_PAYLOAD_TYPE: u8 = 3;
    // Maximum guardian set size (mainnet limit)
    const MAX_GUARDIAN_SET_SIZE: u8 = 19;

    public struct ParsedTransfer has copy, drop {
        token_address: vector<u8>,
        token_chain: u16,
    }

    // Extract and validate payload type from VAA
    //
    // VAA structure:
    // - version: 1 byte
    // - guardian_set_index: 4 bytes
    // - sig_count: 1 byte
    // - signatures: 66 * sig_count bytes
    // - timestamp: 4 bytes
    // - nonce: 4 bytes
    // - emitter_chain: 2 bytes
    // - emitter_address: 32 bytes
    // - sequence: 8 bytes
    // - consistency_level: 1 byte
    // - PAYLOAD starts here:
    //   - payload_type: 1 byte
    public fun extract_payload_type(vaa_bytes: vector<u8>): u8 {
        let payload_offset = get_payload_offset(vaa_bytes);
        *vector::borrow(&vaa_bytes, payload_offset)
    }

    public fun validate_transfer_with_payload(vaa_bytes: vector<u8>) {
        let payload_type = extract_payload_type(vaa_bytes);
        assert!(
            payload_type == TRANSFER_WITH_PAYLOAD_TYPE,
            E_INVALID_PAYLOAD_TYPE
        );
    }

    // Parse token information from Token Bridge transfer_with_payload VAA
    //
    // TransferWithPayload payload structure (after payload type byte):
    // - amount: 32 bytes (u256)
    // - token_address: 32 bytes
    // - token_chain: 2 bytes
    // - redeemer: 32 bytes
    // - redeemer_chain: 2 bytes
    // - sender: 32 bytes
    // - payload_length: 2 bytes
    // - payload: variable bytes
    public fun parse_transfer_info(vaa_bytes: vector<u8>): ParsedTransfer {
        validate_transfer_with_payload(vaa_bytes);

        let mut offset = get_payload_offset(vaa_bytes);

        // We need at least: payload_type(1) + amount(32) + token_address(32) + token_chain(2) = 67 bytes
        let vaa_len = vector::length(&vaa_bytes);
        assert!(vaa_len >= offset + 67, E_INVALID_VAA_LENGTH);

        offset = offset + 1 + 32;

        let mut token_address = vector::empty<u8>();
        let mut i = 0;
        while (i < 32) {
            vector::push_back(&mut token_address, *vector::borrow(&vaa_bytes, offset + i));
            i = i + 1;
        };
        offset = offset + 32;

        let byte1 = (*vector::borrow(&vaa_bytes, offset) as u16);
        let byte2 = (*vector::borrow(&vaa_bytes, offset + 1) as u16);
        let token_chain = (byte1 << 8) | byte2;

        ParsedTransfer {
            token_address,
            token_chain,
        }
    }

    // Get the offset where the payload starts in the VAA
    fun get_payload_offset(vaa_bytes: vector<u8>): u64 {
        let vaa_len = vector::length(&vaa_bytes);

        assert!(vaa_len >= 6, E_INVALID_VAA_LENGTH);

        let mut offset = 0;
        offset = offset + 1;
        offset = offset + 4;

        let sig_count = *vector::borrow(&vaa_bytes, offset);
        offset = offset + 1;

        // Validate signature count doesn't exceed mainnet maximum
        assert!(sig_count <= MAX_GUARDIAN_SET_SIZE, E_TOO_MANY_SIGNATURES);

        let min_required_len = 6 + (66 * (sig_count as u64)) + 57;
        assert!(vaa_len >= min_required_len, E_INVALID_VAA_LENGTH);

        offset = offset + (66 * (sig_count as u64));
        offset = offset + 4;
        offset = offset + 4;
        offset = offset + 2;
        offset = offset + 32;
        offset = offset + 8;
        offset = offset + 1;

        offset
    }

    public fun token_address(self: &ParsedTransfer): vector<u8> {
        self.token_address
    }

    public fun token_chain(self: &ParsedTransfer): u16 {
        self.token_chain
    }

    #[test]
    fun test_payload_offset_calculation() {
        // Create a minimal VAA with 1 signature
        let mut vaa = vector::empty<u8>();

        // VAA Header
        vector::push_back(&mut vaa, 1); // version
        vector::append(&mut vaa, x"00000000"); // guardian_set_index
        vector::push_back(&mut vaa, 1); // sig_count = 1

        // Add 1 signature (66 bytes)
        let mut i = 0;
        while (i < 66) {
            vector::push_back(&mut vaa, 0);
            i = i + 1;
        };

        // VAA Body (57 bytes before payload)
        vector::append(&mut vaa, x"00000000"); // timestamp
        vector::append(&mut vaa, x"00000000"); // nonce
        vector::append(&mut vaa, x"0002"); // emitter_chain

        // Emitter address (32 bytes)
        let mut i = 0;
        while (i < 32) {
            vector::push_back(&mut vaa, 0);
            i = i + 1;
        };

        vector::append(&mut vaa, x"0000000000000001"); // sequence
        vector::push_back(&mut vaa, 15); // consistency_level
        vector::push_back(&mut vaa, 3); // payload type

        // Add minimal transfer_with_payload payload (need at least 133 bytes after payload type)
        // Amount (32 bytes)
        vector::append(&mut vaa, x"0000000000000000000000000000000000000000000000000000000000001388");
        // Token address (32 bytes)
        vector::append(&mut vaa, x"000000000000000000000000DAC17F958D2EE523A2206206994597C13D831EC7");
        // Token chain (2 bytes)
        vector::append(&mut vaa, x"0002");
        // Redeemer (32 bytes)
        let mut i = 0;
        while (i < 32) {
            vector::push_back(&mut vaa, 0);
            i = i + 1;
        };
        // Redeemer chain (2 bytes)
        vector::append(&mut vaa, x"0015");
        // Sender (32 bytes)
        let mut i = 0;
        while (i < 32) {
            vector::push_back(&mut vaa, 0);
            i = i + 1;
        };
        // Payload length (2 bytes)
        vector::append(&mut vaa, x"0000");

        // Offset calculation: 1 + 4 + 1 + (1 * 66) + 4 + 4 + 2 + 32 + 8 + 1 = 123
        let offset = get_payload_offset(vaa);
        assert!(offset == 123, 0);

        let payload_type = extract_payload_type(vaa);
        assert!(payload_type == 3, 1);
    }

    #[test]
    fun test_parse_transfer_info() {
        // Create a VAA with transfer_with_payload
        let mut vaa = vector::empty<u8>();

        vector::push_back(&mut vaa, 1);
        vector::append(&mut vaa, x"00000000");
        vector::push_back(&mut vaa, 1);

        let mut i = 0;
        while (i < 66) {
            vector::push_back(&mut vaa, 0);
            i = i + 1;
        };

        vector::append(&mut vaa, x"00000000"); 
        vector::append(&mut vaa, x"00000000"); 
        vector::append(&mut vaa, x"0002"); 

        let mut i = 0;
        while (i < 32) {
            vector::push_back(&mut vaa, 0);
            i = i + 1;
        };

        vector::append(&mut vaa, x"0000000000000001"); 
        vector::push_back(&mut vaa, 15); 
        vector::push_back(&mut vaa, 3);
        vector::append(&mut vaa, x"0000000000000000000000000000000000000000000000000000000000001388"); 
        vector::append(&mut vaa, x"000000000000000000000000DAC17F958D2EE523A2206206994597C13D831EC7");
        vector::append(&mut vaa, x"0002");

        let parsed = parse_transfer_info(vaa);

        assert!(token_chain(&parsed) == 2, 0);

        let addr = token_address(&parsed);
        assert!(vector::length(&addr) == 32, 1);
        assert!(*vector::borrow(&addr, 31) == 0xC7, 2); 
    }

    #[test]
    #[expected_failure(abort_code = E_INVALID_PAYLOAD_TYPE)]
    fun test_invalid_payload_type() {
        let mut vaa = vector::empty<u8>();

        // VAA Header
        vector::push_back(&mut vaa, 1); // version
        vector::append(&mut vaa, x"00000000"); // guardian_set_index
        vector::push_back(&mut vaa, 0); // sig_count = 0 (no signatures)

        // VAA Body (57 bytes minimum before payload)
        vector::append(&mut vaa, x"00000000"); // timestamp
        vector::append(&mut vaa, x"00000000"); // nonce
        vector::append(&mut vaa, x"0002"); // emitter_chain

        // Emitter address (32 bytes)
        let mut i = 0;
        while (i < 32) {
            vector::push_back(&mut vaa, 0);
            i = i + 1;
        };

        vector::append(&mut vaa, x"0000000000000001"); // sequence
        vector::push_back(&mut vaa, 15); // consistency_level
        vector::push_back(&mut vaa, 1); // WRONG payload type (should be 3)

        // Add minimal payload (even though type is wrong, need enough data for length check)
        // Amount (32 bytes)
        vector::append(&mut vaa, x"0000000000000000000000000000000000000000000000000000000000001388");
        // Token address (32 bytes)
        vector::append(&mut vaa, x"000000000000000000000000DAC17F958D2EE523A2206206994597C13D831EC7");
        // Token chain (2 bytes)
        vector::append(&mut vaa, x"0002");
        // Redeemer (32 bytes)
        let mut i = 0;
        while (i < 32) {
            vector::push_back(&mut vaa, 0);
            i = i + 1;
        };
        // Redeemer chain (2 bytes)
        vector::append(&mut vaa, x"0015");
        // Sender (32 bytes)
        let mut i = 0;
        while (i < 32) {
            vector::push_back(&mut vaa, 0);
            i = i + 1;
        };
        // Payload length (2 bytes)
        vector::append(&mut vaa, x"0000");

        validate_transfer_with_payload(vaa);
    }
}
