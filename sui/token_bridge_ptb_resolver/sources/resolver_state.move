// SPDX-License-Identifier: Apache 2

module token_bridge_ptb_resolver::resolver_state {
    use std::string::String;

    // Resolver state object
    //
    // Required fields (PTB Resolver spec):
    // - id: Unique identifier for the state object
    // - package_id: Address of this resolver package
    // - module_name: Name of the resolver module ("resolver")
    //
    // Domain-specific fields (TB Relayer V4):
    // - wormhole_state: Wormhole core state object address
    // - token_bridge_state: Token Bridge state object address
    // - relayer_state: Token Bridge Relayer V4 state object address
    public struct State has key, store {
        id: UID,
        package_id: address,
        module_name: String,
        wormhole_state: address,
        token_bridge_state: address,
        relayer_state: address,
    }

    public(package) fun new(
        package_id: address,
        module_name: String,
        wormhole_state: address,
        token_bridge_state: address,
        relayer_state: address,
        ctx: &mut TxContext
    ): State {
        State {
            id: object::new(ctx),
            package_id,
            module_name,
            wormhole_state,
            token_bridge_state,
            relayer_state,
        }
    }

    public fun package_id(self: &State): address {
        self.package_id
    }

    public fun module_name(self: &State): String {
        self.module_name
    }

    public fun wormhole_state(self: &State): address {
        self.wormhole_state
    }

    public fun token_bridge_state(self: &State): address {
        self.token_bridge_state
    }

    public fun relayer_state(self: &State): address {
        self.relayer_state
    }

    #[test_only]
    public fun new_for_testing(
        package_id: address,
        module_name: String,
        wormhole_state: address,
        token_bridge_state: address,
        relayer_state: address,
        ctx: &mut TxContext
    ): State {
        State {
            id: object::new(ctx),
            package_id,
            module_name,
            wormhole_state,
            token_bridge_state,
            relayer_state,
        }
    }

    #[test_only]
    public fun destroy_for_testing(state: State) {
        let State {
            id,
            package_id: _,
            module_name: _,
            wormhole_state: _,
            token_bridge_state: _,
            relayer_state: _,
        } = state;
        object::delete(id);
    }
}
