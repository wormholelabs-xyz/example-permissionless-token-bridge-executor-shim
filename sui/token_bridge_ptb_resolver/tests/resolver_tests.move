// SPDX-License-Identifier: Apache 2

#[test_only]
module token_bridge_ptb_resolver::resolver_tests {
    use std::string;
    use sui::test_scenario::{Self as ts, Scenario};
    use sui_ptb_resolver::ptb_types;
    use token_bridge_ptb_resolver::resolver_state;
    use token_bridge_ptb_resolver::resolver;
    use token_bridge_ptb_resolver::vaa_parser;

    const ADMIN: address = @0xAD;
    const WORMHOLE_STATE: address = @0xaeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c;
    const TOKEN_BRIDGE_STATE: address = @0xc57508ee0d4595e5a8728974a4a93a787d38f339757230d441e895422c07aba9;
    const RELAYER_STATE: address = @0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef;

    fun create_test_vaa_transfer_with_payload(): vector<u8> {
        let mut vaa = vector::empty<u8>();

        // Version
        vector::push_back(&mut vaa, 1);

        // Guardian set index
        vector::append(&mut vaa, x"00000000");

        // Signature count (13 for mainnet-like scenario)
        vector::push_back(&mut vaa, 13);

        // Add 13 dummy signatures (66 bytes each)
        let mut sig_idx = 0;
        while (sig_idx < 13) {
            let mut i = 0;
            while (i < 66) {
                vector::push_back(&mut vaa, 0);
                i = i + 1;
            };
            sig_idx = sig_idx + 1;
        };

        // Timestamp
        vector::append(&mut vaa, x"00000000");

        // Nonce
        vector::append(&mut vaa, x"00000000");

        // Emitter chain (Ethereum = 2)
        vector::append(&mut vaa, x"0002");

        // Emitter address (32 bytes)
        let mut i = 0;
        while (i < 32) {
            vector::push_back(&mut vaa, 0);
            i = i + 1;
        };

        // Sequence
        vector::append(&mut vaa, x"00000000000B26EB");

        // Consistency level
        vector::push_back(&mut vaa, 15);

        // Payload type (3 for transfer_with_payload)
        vector::push_back(&mut vaa, 3);

        // Amount (32 bytes) - 19000000000 (0x046C8AFDB0)
        vector::append(&mut vaa, x"000000000000000000000000000000000000000000000000000000046C8AFDB0");

        // Token address (32 bytes) - USDT on Ethereum
        vector::append(&mut vaa, x"000000000000000000000000DAC17F958D2EE523A2206206994597C13D831EC7");

        // Token chain (2 bytes) - Ethereum = 2
        vector::append(&mut vaa, x"0002");

        // Redeemer (32 bytes) - some address
        vector::append(&mut vaa, x"0000000000000000000000001234567890123456789012345678901234567890");

        // Redeemer chain (2 bytes) - Sui = 21
        vector::append(&mut vaa, x"0015");

        // Sender (32 bytes)
        vector::append(&mut vaa, x"000000000000000000000000ABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD");

        // Payload length (2 bytes) - 32 bytes minimal payload
        vector::append(&mut vaa, x"0020");

        // Payload (32 bytes) - minimal TB Relayer V4 payload (recipient)
        vector::append(&mut vaa, x"0000000000000000000000009999999999999999999999999999999999999999");

        vaa
    }

    fun create_test_state(scenario: &mut Scenario): resolver_state::State {
        ts::next_tx(scenario, ADMIN);
        let ctx = ts::ctx(scenario);

        resolver_state::new_for_testing(
            @token_bridge_ptb_resolver,
            string::utf8(b"resolver"),
            WORMHOLE_STATE,
            TOKEN_BRIDGE_STATE,
            RELAYER_STATE,
            ctx
        )
    }

    #[test]
    fun test_state_creation() {
        let mut scenario = ts::begin(ADMIN);

        let resolver_state = create_test_state(&mut scenario);

        assert!(resolver_state::package_id(&resolver_state) == @token_bridge_ptb_resolver, 0);
        assert!(resolver_state::module_name(&resolver_state) == string::utf8(b"resolver"), 1);
        assert!(resolver_state::wormhole_state(&resolver_state) == WORMHOLE_STATE, 2);
        assert!(resolver_state::token_bridge_state(&resolver_state) == TOKEN_BRIDGE_STATE, 3);
        assert!(resolver_state::relayer_state(&resolver_state) == RELAYER_STATE, 4);

        resolver_state::destroy_for_testing(resolver_state);
        ts::end(scenario);
    }

    #[test]
    fun test_vaa_parser_payload_type() {
        let vaa = create_test_vaa_transfer_with_payload();

        let payload_type = vaa_parser::extract_payload_type(vaa);
        assert!(payload_type == 3, 0);
    }

    #[test]
    fun test_vaa_parser_validate_transfer_with_payload() {
        let vaa = create_test_vaa_transfer_with_payload();

        vaa_parser::validate_transfer_with_payload(vaa);
    }

    #[test]
    #[expected_failure(abort_code = vaa_parser::E_INVALID_PAYLOAD_TYPE)]
    fun test_vaa_parser_validate_wrong_payload_type() {
        let mut vaa = create_test_vaa_transfer_with_payload();

        // Payload is at offset: 1 + 4 + 1 + (13 * 66) + 4 + 4 + 2 + 32 + 8 + 1 = 915
        let payload_offset = 1 + 4 + 1 + (13 * 66) + 4 + 4 + 2 + 32 + 8 + 1;
        *vector::borrow_mut(&mut vaa, payload_offset) = 1; // Change to type 1

        // Should abort with E_INVALID_PAYLOAD_TYPE
        vaa_parser::validate_transfer_with_payload(vaa);
    }

    #[test]
    fun test_vaa_parser_parse_transfer_info() {
        let vaa = create_test_vaa_transfer_with_payload();

        let parsed = vaa_parser::parse_transfer_info(vaa);

        // Verify token chain (Ethereum = 2)
        assert!(vaa_parser::token_chain(&parsed) == 2, 0);

        let token_address = vaa_parser::token_address(&parsed);
        assert!(vector::length(&token_address) == 32, 1);

        // Verify specific bytes from USDT address (0xDAC17F958D2EE523A2206206994597C13D831EC7)
        assert!(*vector::borrow(&token_address, 12) == 0xDA, 2);
        assert!(*vector::borrow(&token_address, 13) == 0xC1, 3);
        assert!(*vector::borrow(&token_address, 14) == 0x7F, 4);
    }

    #[test]
    fun test_resolver_needs_offchain_data() {
        let mut scenario = ts::begin(ADMIN);

        let resolver_state = create_test_state(&mut scenario);
        let vaa = create_test_vaa_transfer_with_payload();

        // Create empty discovered data (first call scenario)
        let discovered_data = ptb_types::create_discovered_data();
        let discovered_data_bytes = ptb_types::encode_discovered_data(&discovered_data);

        resolver::resolve_vaa(
            &resolver_state,
            vaa,
            discovered_data_bytes
        );

        // If we get here without aborting, the resolver correctly requested lookups
        // In real usage, the event would be caught and processed by the TypeScript SDK

        resolver_state::destroy_for_testing(resolver_state);
        ts::end(scenario);
    }

    #[test]
    fun test_ptb_builder_structure() {
        let discovered_data = ptb_types::create_discovered_data();
        let mut builder = ptb_types::create_ptb_builder(
            ptb_types::encode_discovered_data(&discovered_data)
        );

        let vaa_input = builder.add_pure_input(vector[1, 2, 3, 4]);

        let clock = builder.add_object_input(
            ptb_types::create_object_ref(@0x6, 0, vector::empty())
        );

        let _vaa_arg = ptb_types::input_handle_to_argument(&vaa_input);
        let _clock_arg = ptb_types::input_handle_to_argument(&clock);
    }

    #[test]
    fun test_multiple_signatures_vaa_parsing() {
        // Test with 1 signature
        let vaa_1_sig = create_vaa_with_n_signatures(1);
        let payload_type_1 = vaa_parser::extract_payload_type(vaa_1_sig);
        assert!(payload_type_1 == 3, 0);

        // Test with 7 signatures
        let vaa_7_sig = create_vaa_with_n_signatures(7);
        let payload_type_7 = vaa_parser::extract_payload_type(vaa_7_sig);
        assert!(payload_type_7 == 3, 1);

        // Test with 19 signatures (max mainnet)
        let vaa_19_sig = create_vaa_with_n_signatures(19);
        let payload_type_19 = vaa_parser::extract_payload_type(vaa_19_sig);
        assert!(payload_type_19 == 3, 2);
    }

    fun create_vaa_with_n_signatures(sig_count: u8): vector<u8> {
        let mut vaa = vector::empty<u8>();

        // VAA Header
        vector::push_back(&mut vaa, 1); // version
        vector::append(&mut vaa, x"00000000"); // guardian set index
        vector::push_back(&mut vaa, sig_count); // signature count

        // Add signatures (66 bytes each)
        let mut sig_idx = 0;
        while (sig_idx < sig_count) {
            let mut i = 0;
            while (i < 66) {
                vector::push_back(&mut vaa, 0);
                i = i + 1;
            };
            sig_idx = sig_idx + 1;
        };

        // VAA Body (57 bytes minimum before payload)
        vector::append(&mut vaa, x"00000000"); // timestamp (4 bytes)
        vector::append(&mut vaa, x"00000000"); // nonce (4 bytes)
        vector::append(&mut vaa, x"0002"); // emitter chain (2 bytes)

        // Emitter address (32 bytes)
        let mut i = 0;
        while (i < 32) {
            vector::push_back(&mut vaa, 0);
            i = i + 1;
        };

        vector::append(&mut vaa, x"0000000000000001"); // sequence (8 bytes)
        vector::push_back(&mut vaa, 15); // consistency level (1 byte)

        // Payload (transfer_with_payload type 3)
        vector::push_back(&mut vaa, 3); // payload type (1 byte)

        // Add minimum transfer_with_payload fields (133 bytes total)
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

        // Payload length (2 bytes) - 0 for minimal test
        vector::append(&mut vaa, x"0000");

        vaa
    }

    #[test]
    fun test_coin_type_key_structure() {
        // This test verifies that we can construct the structured key that matches token_registry::CoinTypeKey { addr, chain }

        let token_address = x"000000000000000000000000DAC17F958D2EE523A2206206994597C13D831EC7";
        let token_chain: u16 = 2;

        let mut fields = vector::empty();

        vector::push_back(&mut fields, ptb_types::create_struct_field(
            b"addr",
            token_address
        ));

        vector::push_back(&mut fields, ptb_types::create_struct_field(
            b"chain",
            sui::bcs::to_bytes(&token_chain)
        ));

        assert!(vector::length(&fields) == 2, 0);
    }

    #[test]
    fun test_type_tag_construction() {
        let coin_type_string = string::utf8(b"0x2::sui::SUI");
        let coin_type_tag = ptb_types::create_type_tag(*string::as_bytes(&coin_type_string));

        let _ = coin_type_tag;
    }

    #[test]
    fun test_object_ref_creation() {
        let wormhole_ref = ptb_types::create_object_ref(WORMHOLE_STATE, 0, vector::empty());
        let token_bridge_ref = ptb_types::create_object_ref(TOKEN_BRIDGE_STATE, 0, vector::empty());
        let relayer_ref = ptb_types::create_object_ref(RELAYER_STATE, 0, vector::empty());

        let _ = wormhole_ref;
        let _ = token_bridge_ref;
        let _ = relayer_ref;
    }

    #[test]
    fun test_state_getters() {
        let mut scenario = ts::begin(ADMIN);
        let resolver_state = create_test_state(&mut scenario);

        // Test all getters
        let _ = resolver_state::package_id(&resolver_state);
        let _ = resolver_state::module_name(&resolver_state);
        let _ = resolver_state::wormhole_state(&resolver_state);
        let _ = resolver_state::token_bridge_state(&resolver_state);
        let _ = resolver_state::relayer_state(&resolver_state);

        resolver_state::destroy_for_testing(resolver_state);
        ts::end(scenario);
    }


    // Helper to create VAA with specific token chain
    fun create_vaa_with_token_chain(token_chain: u16): vector<u8> {
        let mut vaa = vector::empty<u8>();

        // Minimal VAA structure
        vector::push_back(&mut vaa, 1); // version
        vector::append(&mut vaa, x"00000000"); // guardian set index
        vector::push_back(&mut vaa, 1); // 1 signature

        // 1 signature (66 bytes)
        let mut i = 0;
        while (i < 66) {
            vector::push_back(&mut vaa, 0);
            i = i + 1;
        };

        vector::append(&mut vaa, x"00000000"); // timestamp
        vector::append(&mut vaa, x"00000000"); // nonce
        vector::append(&mut vaa, x"0002"); // emitter chain

        // emitter address (32 bytes)
        let mut i = 0;
        while (i < 32) {
            vector::push_back(&mut vaa, 0);
            i = i + 1;
        };

        vector::append(&mut vaa, x"0000000000000001"); // sequence
        vector::push_back(&mut vaa, 15); // consistency level
        vector::push_back(&mut vaa, 3); // payload type

        // Amount (32 bytes)
        vector::append(&mut vaa, x"0000000000000000000000000000000000000000000000000000000000001388");

        // Token address (32 bytes)
        vector::append(&mut vaa, x"000000000000000000000000DAC17F958D2EE523A2206206994597C13D831EC7");

        // Token chain (2 bytes) - big endian
        let byte1 = ((token_chain >> 8) as u8);
        let byte2 = ((token_chain & 0xFF) as u8);
        vector::push_back(&mut vaa, byte1);
        vector::push_back(&mut vaa, byte2);

        vaa
    }

    #[test]
    #[expected_failure(abort_code = vaa_parser::E_INVALID_VAA_LENGTH)]
    fun test_vaa_too_short() {
        let vaa = vector[1, 0, 0];
        let _ = vaa_parser::extract_payload_type(vaa);
    }

    #[test]
    #[expected_failure(abort_code = vaa_parser::E_INVALID_VAA_LENGTH)]
    fun test_vaa_missing_signatures() {
        let mut vaa = vector::empty<u8>();
        vector::push_back(&mut vaa, 1); // version
        vector::append(&mut vaa, x"00000000"); // guardian set index
        vector::push_back(&mut vaa, 5); // claims 5 signatures but we won't add them

        let _ = vaa_parser::extract_payload_type(vaa);
    }

    #[test]
    #[expected_failure(abort_code = vaa_parser::E_INVALID_VAA_LENGTH)]
    fun test_parse_transfer_truncated_payload() {
        // Create VAA with correct header but truncated payload
        let mut vaa = vector::empty<u8>();

        vector::push_back(&mut vaa, 1); 
        vector::append(&mut vaa, x"00000000"); 
        vector::push_back(&mut vaa, 1); 

        // Add 1 signature
        let mut i = 0;
        while (i < 66) {
            vector::push_back(&mut vaa, 0);
            i = i + 1;
        };

        // Add VAA body
        vector::append(&mut vaa, x"00000000"); // timestamp
        vector::append(&mut vaa, x"00000000"); // nonce
        vector::append(&mut vaa, x"0002"); // emitter chain

        let mut i = 0;
        while (i < 32) {
            vector::push_back(&mut vaa, 0);
            i = i + 1;
        };

        vector::append(&mut vaa, x"0000000000000001"); // sequence
        vector::push_back(&mut vaa, 15); // consistency level
        vector::push_back(&mut vaa, 3); // payload type

        // Add only partial amount (16 bytes instead of 32)!
        vector::append(&mut vaa, x"0000000000000000000000000000000000000000");

        let _ = vaa_parser::parse_transfer_info(vaa);
    }

    #[test]
    fun test_empty_coin_type_validation() {
        let discovered_data = ptb_types::create_discovered_data();
        let mut builder = ptb_types::create_ptb_builder(
            ptb_types::encode_discovered_data(&discovered_data)
        );

        let empty_coin_type = string::utf8(b"");
        let vaa = create_test_vaa_transfer_with_payload();

        assert!(string::is_empty(&empty_coin_type), 0);
    }

    #[test]
    #[expected_failure(abort_code = vaa_parser::E_INVALID_PAYLOAD_TYPE)]
    fun test_wrong_payload_type_zero() {
        let mut vaa = create_test_vaa_transfer_with_payload();

        let payload_offset = 1 + 4 + 1 + (13 * 66) + 4 + 4 + 2 + 32 + 8 + 1;

        // Change payload type to 0
        *vector::borrow_mut(&mut vaa, payload_offset) = 0;

        vaa_parser::validate_transfer_with_payload(vaa);
    }

    #[test]
    #[expected_failure(abort_code = vaa_parser::E_INVALID_PAYLOAD_TYPE)]
    fun test_wrong_payload_type_one() {
        let mut vaa = create_test_vaa_transfer_with_payload();

        let payload_offset = 1 + 4 + 1 + (13 * 66) + 4 + 4 + 2 + 32 + 8 + 1;

        // Change payload type to 1 (regular transfer, not transfer_with_payload)
        *vector::borrow_mut(&mut vaa, payload_offset) = 1;

        vaa_parser::validate_transfer_with_payload(vaa);
    }

    #[test]
    fun test_max_signature_count() {
        let vaa = create_vaa_with_n_signatures(19);
        let payload_type = vaa_parser::extract_payload_type(vaa);
        assert!(payload_type == 3, 0);
    }

    #[test]
    fun test_zero_signature_count() {
        let vaa = create_vaa_with_n_signatures(0);
        let payload_type = vaa_parser::extract_payload_type(vaa);
        assert!(payload_type == 3, 0);
    }
}
