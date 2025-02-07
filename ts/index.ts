import { web3 } from "@coral-xyz/anchor";
import { Chain, Network } from "@wormhole-foundation/sdk-base";

export const DEPLOYMENTS: { [key in Network]?: { [chain in Chain]?: string } } =
  {
    Testnet: {
      Solana: "Hsf7mQAy6eSYbqGYqkeTx8smMGF4m6Nn6viGoh9wxiah",
      Avalanche: "0x99d21Ddd334772363EFb63AeA27D6569a7471491",
    },
  };
