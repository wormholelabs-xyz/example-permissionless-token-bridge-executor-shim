// SPDX-License-Identifier: Apache 2

// Token Bridge Relayer V4 Resolver
//
// Main resolver module that implements the resolve_vaa function following
// the PTB Resolver specification.
//
// This resolver builds a 4-command PTB for Token Bridge Relayer V4 redemption:
// 1. parse_and_verify (Wormhole core)
// 2. verify_only_once (Token Bridge replay protection)
// 3. authorize_transfer (Token Bridge authorization)
// 4. execute_vaa_v1 (TB Relayer V4 execution)
module token_bridge_ptb_resolver::resolver {
    use std::string;
    use sui_ptb_resolver::ptb_types;
    use sui::bcs;
    use token_bridge_ptb_resolver::resolver_state::{Self, State};
    use token_bridge_ptb_resolver::vaa_parser;

    // Coin type is empty or invalid
    const E_INVALID_COIN_TYPE: u64 = 0;
    // Wormhole package address could not be resolved
    const E_INVALID_WORMHOLE_PACKAGE: u64 = 1;
    // Token Bridge package address could not be resolved
    const E_INVALID_TOKEN_BRIDGE_PACKAGE: u64 = 2;
    // Coin type not found in Token Bridge registry
    const E_COIN_TYPE_NOT_FOUND: u64 = 3;
    // Relayer package address could not be resolved
    const E_INVALID_RELAYER_PACKAGE: u64 = 4;

    public fun resolve_vaa(
        resolver_state: &State,
        vaa_bytes: vector<u8>,
        discovered_data_bytes: vector<u8>
    ) {
        vaa_parser::validate_transfer_with_payload(vaa_bytes);

        let mut builder = ptb_types::create_ptb_builder(discovered_data_bytes);

        let wormhole_package: Option<address> = builder.request_package_lookup(
            resolver_state::wormhole_state(resolver_state),
            string::utf8(b"CurrentPackage"),
            string::utf8(b"package"),
            string::utf8(b"wormhole_package")
        );

        let token_bridge_package: Option<address> = builder.request_package_lookup(
            resolver_state::token_bridge_state(resolver_state),
            string::utf8(b"CurrentPackage"),
            string::utf8(b"package"),
            string::utf8(b"token_bridge_package")
        );

        // TB Relayer V4 stores package_id directly in State struct (not as dynamic field)
        // Use request_object_field_lookup to read the struct field directly
        let relayer_package_bytes: Option<vector<u8>> = builder.request_object_field_lookup(
            resolver_state::relayer_state(resolver_state),
            string::utf8(b"package_id"),
            ptb_types::lookup_value_type_address(),
            string::utf8(b"relayer_package")
        );

        // Convert bytes to address option
        let relayer_package: Option<address> = if (relayer_package_bytes.is_some()) {
            let bytes = *option::borrow(&relayer_package_bytes);
            option::some(sui::address::from_bytes(bytes))
        } else {
            option::none()
        };

        // Discover coin type only if token bridge package is available
        let mut coin_type: Option<vector<u8>> = option::none();

        if (token_bridge_package.is_some()) {
            let parsed_transfer = vaa_parser::parse_transfer_info(vaa_bytes);

            // Build structured key for coin type lookup
            let key_fields = build_coin_type_structured_key(
                vaa_parser::token_address(&parsed_transfer),
                vaa_parser::token_chain(&parsed_transfer)
            );

            let token_bridge_pkg = *option::borrow(&token_bridge_package);

            // Construct the key type string: 0xPACKAGE::token_registry::CoinTypeKey
            let mut key_type_string = string::utf8(b"0x");
            string::append(&mut key_type_string, sui::address::to_string(token_bridge_pkg));
            string::append(&mut key_type_string, string::utf8(b"::token_registry::CoinTypeKey"));

            coin_type = builder.request_table_item_lookup(
                resolver_state::token_bridge_state(resolver_state),
                string::utf8(b"token_registry.coin_types"),
                option::none(),          
                option::some(key_fields), 
                key_type_string,         
                string::utf8(b"coin_type")
            );
        };

        if (builder.has_pending_lookups()) {
            let lookups = builder.get_lookups_for_resolution();
            let result = ptb_types::create_needs_offchain_result(lookups);
            ptb_types::emit_resolver_event(&result);
            return
        };

        // All lookups resolved - validate we have required data
        assert!(wormhole_package.is_some(), E_INVALID_WORMHOLE_PACKAGE);
        assert!(token_bridge_package.is_some(), E_INVALID_TOKEN_BRIDGE_PACKAGE);
        assert!(relayer_package.is_some(), E_INVALID_RELAYER_PACKAGE);
        assert!(coin_type.is_some(), E_COIN_TYPE_NOT_FOUND);

        // Coin type needs 0x prefix
        let coin_type_str = string::utf8(*option::borrow(&coin_type));
        let mut full_coin_type = string::utf8(b"0x");
        string::append(&mut full_coin_type, coin_type_str);

        build_redemption_ptb(
            &mut builder,
            vaa_bytes,
            *option::borrow(&wormhole_package),
            *option::borrow(&token_bridge_package),
            *option::borrow(&relayer_package),
            full_coin_type,
            resolver_state
        );
    }

    fun build_redemption_ptb(
        builder: &mut ptb_types::PTBBuilder,
        vaa_bytes: vector<u8>,
        wormhole_package: address,
        token_bridge_package: address,
        relayer_package: address,
        coin_type: string::String,
        resolver_state: &State
    ) {
        assert!(!string::is_empty(&coin_type), E_INVALID_COIN_TYPE);

        // IMPORTANT: Use add_pure_input_raw_bytes instead of add_pure_input to avoid double BCS encoding
        // The VAA bytes are already in the correct format and should not be BCS-encoded again
        let vaa_input = builder.add_pure_input_raw_bytes(vaa_bytes);

        let clock = builder.add_object_input(
            ptb_types::create_object_ref(@0x6, 0, vector::empty())
        );

        let wormhole_state = builder.add_object_input(
            ptb_types::create_object_ref(
                resolver_state::wormhole_state(resolver_state),
                0,
                vector::empty()
            )
        );

        let token_bridge_state = builder.add_object_input(
            ptb_types::create_object_ref(
                resolver_state::token_bridge_state(resolver_state),
                0,
                vector::empty()
            )
        );

        let relayer_state = builder.add_object_input(
            ptb_types::create_object_ref(
                resolver_state::relayer_state(resolver_state),
                0,
                vector::empty()
            )
        );

        // Command 1: parse_and_verify (Wormhole core)
        let verified_vaa = builder.add_move_call(
            wormhole_package,
            string::utf8(b"vaa"),
            string::utf8(b"parse_and_verify"),
            vector::empty(),
            vector[
                ptb_types::input_handle_to_argument(&wormhole_state),
                ptb_types::input_handle_to_argument(&vaa_input),
                ptb_types::input_handle_to_argument(&clock)
            ]
        );

        // Command 2: verify_only_once (Token Bridge replay protection)
        let msg = builder.add_move_call(
            token_bridge_package,
            string::utf8(b"vaa"),
            string::utf8(b"verify_only_once"),
            vector::empty(),
            vector[
                ptb_types::input_handle_to_argument(&token_bridge_state),
                ptb_types::command_result_to_argument(&verified_vaa)
            ]
        );

        // Command 3: authorize_transfer (Token Bridge authorization)
        let coin_type_tag = ptb_types::create_type_tag(*string::as_bytes(&coin_type));
        let receipt = builder.add_move_call(
            token_bridge_package,
            string::utf8(b"complete_transfer_with_payload"),
            string::utf8(b"authorize_transfer"),
            vector[coin_type_tag],
            vector[
                ptb_types::input_handle_to_argument(&token_bridge_state),
                ptb_types::command_result_to_argument(&msg)
            ]
        );

        // Command 4: execute_vaa_v1 (TB Relayer V4 execution)
        builder.add_move_call(
            relayer_package,
            string::utf8(b"redeem"),
            string::utf8(b"execute_vaa_v1"),
            vector[coin_type_tag],
            vector[
                ptb_types::input_handle_to_argument(&relayer_state),
                ptb_types::command_result_to_argument(&receipt)
            ]
        );

        builder.add_required_object(resolver_state::wormhole_state(resolver_state));
        builder.add_required_object(resolver_state::token_bridge_state(resolver_state));
        builder.add_required_object(resolver_state::relayer_state(resolver_state));
        builder.add_required_type(coin_type);

        let instruction_groups = builder.finalize_builder();
        let result = ptb_types::create_resolved_result(instruction_groups);
        ptb_types::emit_resolver_event(&result);
    }

    // The key matches: token_registry::CoinTypeKey { addr, chain }
    fun build_coin_type_structured_key(
        token_address: vector<u8>,
        token_chain: u16
    ): vector<ptb_types::StructField> {
        let mut fields = vector::empty();

        vector::push_back(&mut fields, ptb_types::create_struct_field(
            b"addr",
            token_address
        ));

        vector::push_back(&mut fields, ptb_types::create_struct_field(
            b"chain",
            bcs::to_bytes(&token_chain)
        ));

        fields
    }
}
