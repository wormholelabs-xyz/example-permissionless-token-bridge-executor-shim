import { Chain, Network } from "@wormhole-foundation/sdk-base";

export const DEPLOYMENTS: { [key in Network]?: { [chain in Chain]?: string } } =
  {
    Testnet: {
      Solana: "tbr7Qje6qBzPwfM52csL5KFi8ps5c5vDyiVVBLYVdRf",
      Avalanche: "0xa688da65de0c625bd04174019f6fc81a884b7725",
      Sui: "0xf2bb0f9109d53247bc8abaad2e810e764c2ad7581291a707437a02b58be1e47f",
    },
  };
