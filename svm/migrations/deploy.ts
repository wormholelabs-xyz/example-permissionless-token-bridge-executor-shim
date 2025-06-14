// Migrations are an early feature. Currently, they're nothing more than this
// single deploy script that's invoked from the CLI, injecting a provider
// configured from the workspace's Anchor.toml.

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TokenBridgeRelayer } from "../target/types/token_bridge_relayer";

module.exports = async function (provider) {
  // Configure client to use the provider.
  anchor.setProvider(provider);

  // Add your deploy script here.
  const program = anchor.workspace
    .TokenBridgeRelayer as Program<TokenBridgeRelayer>;

  const recentSlot = (await program.provider.connection.getSlot()) - 1;
  program.methods
    .initialize(new anchor.BN(recentSlot))
    .rpc({ commitment: "confirmed" });
};
