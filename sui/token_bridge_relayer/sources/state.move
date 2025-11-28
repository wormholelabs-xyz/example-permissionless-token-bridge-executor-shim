module token_bridge_relayer::state {
    use wormhole::state::{State as WormholeState};
    use wormhole::emitter::{Self, EmitterCap};

    // Otw for package initialization
    public struct STATE has drop {}

    // This is transferred to the deployer and consumed when creating the State
    public struct InitCap has key {
        id: sui::object::UID,
    }

    public struct State has key {
        id: sui::object::UID,
        emitter_cap: EmitterCap,
        /// Token Bridge's emitter address (the EmitterCap ID from Token Bridge State)
        /// Used to tell Executor which VAA to listen for (Token Bridge is the actual emitter)
        /// This must be set during initialization by inspecting the Token Bridge State on-chain
        token_bridge_emitter_address: address,
    }

    // Automatically called and InitCap returned to tx sender to later be used at create_state
    fun init(_otw: STATE, ctx: &mut sui::tx_context::TxContext) {
        sui::transfer::transfer(
            InitCap { id: sui::object::new(ctx) },
            sui::tx_context::sender(ctx)
        );
    }

    /// Create the relayer state. Can only be called once by the deployer who owns the InitCap.
    ///
    /// token_bridge_emitter_address: The Token Bridge's EmitterCap ID (as address).
    /// You can find this by inspecting the Token Bridge State object on-chain:
    /// `sui client object <TOKEN_BRIDGE_STATE_ID> --json | jq '.content.fields.emitter_cap.fields.id.id'`
    /// For Sui testnet: 0x40440411a170b4842ae7dee4f4a7b7a58bc0a98566e998850a7bb87bf5dc05b9
    public fun create_state(
        init_cap: InitCap,
        wormhole_state: &WormholeState,
        token_bridge_emitter_address: address,
        ctx: &mut sui::tx_context::TxContext
    ) {
        //consume
        let InitCap { id } = init_cap;
        sui::object::delete(id);

        let state = State {
            id: sui::object::new(ctx),
            emitter_cap: emitter::new(wormhole_state, ctx),
            token_bridge_emitter_address,
        };

        sui::transfer::share_object(state);
    }

    public fun emitter_cap(self: &State): &EmitterCap {
        &self.emitter_cap
    }

    public fun token_bridge_emitter_address(self: &State): address {
        self.token_bridge_emitter_address
    }
}
