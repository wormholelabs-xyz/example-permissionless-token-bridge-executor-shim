import { web3 } from "@coral-xyz/anchor";
import { Chain, Network } from "@wormhole-foundation/sdk-base";

export const DEPLOYMENTS: { [key in Network]?: { [chain in Chain]?: string } } =
  {
    Testnet: {
      Solana: "tbr7Qje6qBzPwfM52csL5KFi8ps5c5vDyiVVBLYVdRf",
      Avalanche: "0xa688da65de0c625bd04174019f6fc81a884b7725",
    },
  };
