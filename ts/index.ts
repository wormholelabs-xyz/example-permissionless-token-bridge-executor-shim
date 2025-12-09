import { Chain, Network } from "@wormhole-foundation/sdk-base";

export const DEPLOYMENTS: { [key in Network]?: { [chain in Chain]?: string } } =
  {
    Testnet: {
      Solana: "tbr7Qje6qBzPwfM52csL5KFi8ps5c5vDyiVVBLYVdRf",
      Avalanche: "0xa688da65de0c625bd04174019f6fc81a884b7725",
      Sui: "0xb4b86c12d4ee0a813d976fb452b7afb325a2b381d00ccb2e54c5342f5ef2e684",
    },
  };

// Sui-specific deployment constants (Testnet)
export const SUI_TESTNET = {
  // Wormhole core
  wormholeStateId:
    "0x31358d198147da50db32eda2562951d53973a0c0ad5ed738e9b17d88b213d790",

  // Token Bridge
  tokenBridgePackageId:
    "0x562760fc51d90d4ae1835bac3e91e0e6987d3497b06f066941d3e51f6e8d76d0",
  tokenBridgeStateId:
    "0x6fb10cdb7aa299e9a4308752dadecb049ff55a892de92992a1edbd7912b3d6da",

  // Token Bridge Relayer V4
  relayerPackageId:
    "0xb4b86c12d4ee0a813d976fb452b7afb325a2b381d00ccb2e54c5342f5ef2e684",
  relayerStateId:
    "0xae0d664920a60c42c89f1e7d00aee5006f0af4b4464be37c497853728f211d51",
};
