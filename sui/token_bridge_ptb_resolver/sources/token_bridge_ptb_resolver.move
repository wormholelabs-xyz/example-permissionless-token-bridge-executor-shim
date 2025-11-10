// SPDX-License-Identifier: Apache 2

module token_bridge_ptb_resolver::token_bridge_ptb_resolver {
    use sui::package;

    // One-time witness for package initialization
    public struct TOKEN_BRIDGE_PTB_RESOLVER has drop {}

    // Initialize the package and transfer Publisher to deployer
    fun init(otw: TOKEN_BRIDGE_PTB_RESOLVER, ctx: &mut TxContext) {
        package::claim_and_keep(otw, ctx);
    }
}
