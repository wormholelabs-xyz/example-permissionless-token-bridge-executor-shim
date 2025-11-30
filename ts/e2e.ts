import { AnchorProvider, setProvider, Wallet, web3 } from "@coral-xyz/anchor";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { Chain, chainToChainId } from "@wormhole-foundation/sdk-base";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import { DEPLOYMENTS } from ".";
import { fetchQuote } from "./executor/fetch";
import { encodeRelayInstructions } from "./executor/relayInstructions";
import {
  approve,
  transfer as evmTransfer,
  waitForTransactionReceipt,
} from "./evm";
import { redeem, transfer as svmTransfer } from "./svm";
import { SolanaWormholeCore } from "@wormhole-foundation/sdk-solana-core";
import { deserialize } from "@wormhole-foundation/sdk-definitions";

const envStringRequired = (name: string): string => {
  let s = process.env[name];
  if (!s) {
    throw new Error(`${name} is required!`);
  }
  return s;
};

const env0xStringRequired = (name: string): `0x${string}` => {
  // check hex regex?
  let s = envStringRequired(name);
  if (!s.startsWith("0x")) {
    throw new Error(`${name} must start with 0x!`);
  }
  return s as `0x${string}`;
};

const SOLANA_RPC_URL = "https://api.devnet.solana.com";
const EXECUTOR_URL = "http://localhost:3000";

const connection = new web3.Connection(SOLANA_RPC_URL, "confirmed");

const SOLANA_KEY = envStringRequired(`SVM_KEY`);

const payer = web3.Keypair.fromSecretKey(
  SOLANA_KEY.endsWith(".json")
    ? new Uint8Array(require(SOLANA_KEY))
    : bs58.decode(SOLANA_KEY),
);
const provider = new AnchorProvider(connection, new Wallet(payer));
setProvider(provider);

const ETH_KEY = env0xStringRequired(`EVM_KEY`);

const eth_account = privateKeyToAccount(ETH_KEY);
const evm_rpc = "https://avalanche-fuji-c-chain-rpc.publicnode.com";

const addressToBytes32 = (a: `0x${string}`): number[] => [
  ...Buffer.from(a.substring(2).padStart(64, "0"), "hex"),
];

async function testSolanaToAvalanche() {
  const token = "So11111111111111111111111111111111111111112";

  const dstChain: Chain = "Avalanche";
  const dstChainId = chainToChainId(dstChain);
  const dstDeployment = DEPLOYMENTS.Testnet?.Avalanche;
  if (!dstDeployment) {
    throw new Error(`No deployment on ${dstChain}`);
  }
  // TODO: sdk magic for this
  const dstTransferRecipient = addressToBytes32(dstDeployment as `0x${string}`);

  const relayInstructions = encodeRelayInstructions([
    { type: "GasInstruction", gasLimit: 250_000n, msgValue: 0n },
  ]);
  const { signedQuote: quote, estimatedCost: estimate } = await fetchQuote(
    EXECUTOR_URL,
    "Solana",
    "Avalanche",
    relayInstructions,
  );
  console.log(`EXECUTION ESTIMATE: ${estimate.toString()}`);

  const { transaction, signers } = await svmTransfer(
    1000n,
    token,
    dstChainId,
    addressToBytes32(eth_account.address),
    dstTransferRecipient,
    dstTransferRecipient, // these are the same on EVM
    estimate,
    Buffer.from(quote.substring(2), "hex"),
    Buffer.from(relayInstructions.substring(2), "hex"),
  );

  transaction.sign([payer, ...signers]);
  const tx = await connection.sendTransaction(transaction);

  console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);
  console.log(
    `https://wormholescan.io/#/tx/${tx}?network=Testnet&view=overview`,
  );
  console.log(
    `https://wormholelabs-xyz.github.io/executor-explorer/#/chain/1/tx/${tx}?endpoint=${encodeURIComponent(
      EXECUTOR_URL,
    )}`,
  );
}

async function testAvalancheToSolana() {
  const token = "0xb10563644a6AB8948ee6d7f5b0a1fb15AaEa1E03";

  const srcDeployment = DEPLOYMENTS.Testnet?.Avalanche;
  if (!srcDeployment) {
    throw new Error(`No deployment on Avalanche`);
  }
  const dstChain: Chain = "Solana";
  const dstChainId = chainToChainId(dstChain);
  const dstDeployment = DEPLOYMENTS.Testnet?.Solana;
  if (!dstDeployment) {
    throw new Error(`No deployment on ${dstChain}`);
  }
  // TODO: sdk magic for this
  const dstProgram = new web3.PublicKey(dstDeployment);

  const relayInstructions = encodeRelayInstructions([
    {
      type: "GasInstruction",
      gasLimit: 1000000n,
      msgValue: 5001n * 5n + 1200000n + 3100000n + 1500000n + 2942120n, // TODO: better values
    },
  ]);
  const { signedQuote: quote, estimatedCost: estimate } = await fetchQuote(
    EXECUTOR_URL,
    "Avalanche",
    "Solana",
    relayInstructions,
  );
  console.log(`EXECUTION ESTIMATE: ${estimate.toString()}`);

  const approvalTx = await approve(
    eth_account,
    avalancheFuji,
    evm_rpc,
    srcDeployment as `0x${string}`,
    token,
    100n,
  );
  console.log(`https://testnet.snowtrace.io/tx/${approvalTx}?chainid=43113`);
  console.log(`waiting for approval confirmation...`);
  await waitForTransactionReceipt(avalancheFuji, evm_rpc, approvalTx);

  const tx = await evmTransfer(
    eth_account,
    avalancheFuji,
    evm_rpc,
    srcDeployment as `0x${string}`,
    token,
    100n,
    dstChainId,
    `0x${payer.publicKey.toBuffer().toString("hex")}`,
    0,
    `0x${dstProgram.toBuffer().toString("hex")}`,
    `0x${dstProgram.toBuffer().toString("hex")}`,
    estimate,
    quote,
    relayInstructions,
  );
  console.log(`https://testnet.snowtrace.io/tx/${tx}?chainid=43113`);
  console.log(
    `https://wormholescan.io/#/tx/${tx}?network=Testnet&view=overview`,
  );
  console.log(
    `https://wormholelabs-xyz.github.io/executor-explorer/#/chain/6/tx/${tx}?endpoint=${encodeURIComponent(
      EXECUTOR_URL,
    )}`,
  );
}

async function testDirectSolanaRedeem() {
  // https://wormholescan.io/#/tx/0x3b06d6ae92cf1cc6312df9412be81c4cf3c1a70dad4f42a8d524db2c2f53350f?network=Testnet&view=overview
  const VAA = deserialize(
    "Uint8Array",
    Buffer.from(
      "AQAAAAABAO8QSEQuF9qjEd5b1jfzw2U7RriEkFuA5/CeMMEi7nwmQK+GW/RS+/8SbQMl9i6iB07xp/i0e+Ps3cRif5PyNhoBZ6fepAAAAAAABgAAAAAAAAAAAAAAAGHkTlBspWWebAu6m2eFhvotcpdWAAAAAAAASnsBAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKBpuIV/6rgYT7aH9jRhjANdrEOdwa6ztVmKDwAAAAAAEAAfq1IUF37mqrWWu1nwOFOzFjvJQmSYsTI/5rVHHDSJFeAAEAAAAAAAAAAAAAAACZ0h3dM0dyNj77Y66ifWVpp0cUkYNxi37Ilhe3BAaF4BvcygMhQCKYDarpE0Dgw/hAwAXv",
      "base64",
    ),
  );
  console.log(Buffer.from(VAA.hash).toString("hex"));
  const token = "So11111111111111111111111111111111111111112";
  const wh = new SolanaWormholeCore("Testnet", "Solana", connection, {
    coreBridge: "3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5",
  });
  const txs = wh.verifyMessage(payer.publicKey, VAA);
  for await (const tx of txs) {
    console.log("sending tx...");
    const sig = await provider.sendAndConfirm(
      tx.transaction.transaction,
      tx.transaction.signers,
      { commitment: "confirmed" },
    );
    console.log(`https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  }
  console.log("redeeming...");
  const tx = await redeem(
    payer.publicKey,
    [...VAA.hash],
    token,
    chainToChainId(VAA.emitterChain),
    VAA.emitterAddress.toUint8Array(),
    VAA.sequence,
  );
  console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);
}

async function testSuiToAvalanche() {
  const { transfer: suiTransfer } = await import("./sui");
  const { Ed25519Keypair } = await import("@mysten/sui/keypairs/ed25519");
  const { SuiClient, getFullnodeUrl } = await import("@mysten/sui/client");

  const privateKey = process.env.SUI_PRIVATE_KEY;
  if (!privateKey) {
    console.log("Skipping Sui to Avalanche test - SUI_PRIVATE_KEY not set");
    return;
  }

  const keypair = Ed25519Keypair.fromSecretKey(privateKey);

  console.log(`Sui sender address: ${keypair.toSuiAddress()}`);

  const client = new SuiClient({ url: getFullnodeUrl("testnet") });

  // Sui deployment addresses
  const suiDeployment = DEPLOYMENTS.Testnet?.Sui;
  if (!suiDeployment) {
    throw new Error("No Sui deployment");
  }

  const dstChain: Chain = "Avalanche";
  const dstChainId = chainToChainId(dstChain);
  const dstDeployment = DEPLOYMENTS.Testnet?.Avalanche;
  if (!dstDeployment) {
    throw new Error("No deployment on Avalanche");
  }

  const relayInstructions = encodeRelayInstructions([
    { type: "GasInstruction", gasLimit: 250_000n, msgValue: 0n },
  ]);

  const { signedQuote: quote, estimatedCost: estimate } = await fetchQuote(
    EXECUTOR_URL,
    "Sui",
    "Avalanche",
    relayInstructions,
  );
  console.log(`EXECUTION ESTIMATE: ${estimate.toString()}`);

  // Transfer 0.001 SUI to Avalanche
  const amount = 1_000_000n; // 0.001 SUI in MIST
  const messageFee = 0n;

  const digest = await suiTransfer(
    client,
    keypair,
    "0x562760fc51d90d4ae1835bac3e91e0e6987d3497b06f066941d3e51f6e8d76d0", // tokenBridgePackageId - Testnet
    suiDeployment, // relayerPackageId
    "0x5205122e46cec8dc99ef25ac6d222dc44e3634230e98407c3d61b18d3c6223f7", // relayerStateId
    "0x31358d198147da50db32eda2562951d53973a0c0ad5ed738e9b17d88b213d790", // wormholeStateId
    "0x6fb10cdb7aa299e9a4308752dadecb049ff55a892de92992a1edbd7912b3d6da", // tokenBridgeStateId
    "0x2::sui::SUI", // coinType
    amount,
    dstChainId,
    addressToBytes32(eth_account.address),
    dstDeployment as `0x${string}`,
    messageFee,
    estimate,
    Buffer.from(quote.substring(2), "hex"),
    Buffer.from(relayInstructions.substring(2), "hex"),
    0, // nonce
  );

  console.log(`https://suiscan.xyz/testnet/tx/${digest}`);
  console.log(
    `https://wormholescan.io/#/tx/${digest}?network=Testnet&view=overview`,
  );
  console.log(
    `https://wormholelabs-xyz.github.io/executor-explorer/#/chain/21/tx/${digest}?endpoint=${encodeURIComponent(
      EXECUTOR_URL,
    )}`,
  );
}

(async () => {
  await testSolanaToAvalanche();
  await testAvalancheToSolana();
  await testSuiToAvalanche();
  // await testDirectSolanaRedeem();
})();
