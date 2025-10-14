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
    }

    // Automatically called and InitCap returned to tx sender to later be used at create_state
    fun init(_otw: STATE, ctx: &mut sui::tx_context::TxContext) {
        sui::transfer::transfer(
            InitCap { id: sui::object::new(ctx) },
            sui::tx_context::sender(ctx)
        );
    }

    // Can only be called once by the deployer who owns the InitCap
    public fun create_state(
        init_cap: InitCap,
        wormhole_state: &WormholeState,
        ctx: &mut sui::tx_context::TxContext
    ) {
        //consume
        let InitCap { id } = init_cap;
        sui::object::delete(id);

        let state = State {
            id: sui::object::new(ctx),
            emitter_cap: emitter::new(wormhole_state, ctx),
        };

        sui::transfer::share_object(state);
    }

    public fun emitter_cap(self: &State): &EmitterCap {
        &self.emitter_cap
    }
}
