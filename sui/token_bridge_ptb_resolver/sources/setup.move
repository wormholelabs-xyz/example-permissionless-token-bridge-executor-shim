// SPDX-License-Identifier: Apache 2

module token_bridge_ptb_resolver::setup {
    use sui::package::{Self, Publisher};
    use token_bridge_ptb_resolver::resolver_state;
    use token_bridge_ptb_resolver::token_bridge_ptb_resolver::TOKEN_BRIDGE_PTB_RESOLVER;

    // Error codes
    const E_INVALID_PUBLISHER: u64 = 0;

    // Create and share the State object
    //
    // This entry function is called after package deployment to initialize
    // the resolver state. Only the package owner (holder of Publisher) can call this.
    // Example:
    // ```
    // sui client call --package $PKG \
    //   --module setup \
    //   --function create_state \
    //   --args $PUBLISHER $PKG "resolver" $WORMHOLE_STATE $TB_STATE $RELAYER_STATE
    // ```
    public fun create_state(
        publisher: &Publisher,
        // states from PTB Resolver spec
        package_id: address,
        module_name: vector<u8>,
        // domain specific data
        wormhole_state: address,
        token_bridge_state: address,
        relayer_state: address,
        ctx: &mut TxContext
    ) {
        // Verify that the publisher is for this package
        assert!(
            package::from_package<TOKEN_BRIDGE_PTB_RESOLVER>(publisher),
            E_INVALID_PUBLISHER
        );

        let resolver_state = resolver_state::new(
            package_id,
            std::string::utf8(module_name),
            wormhole_state,
            token_bridge_state,
            relayer_state,
            ctx
        );

        sui::transfer::public_share_object(resolver_state);
    }
}
