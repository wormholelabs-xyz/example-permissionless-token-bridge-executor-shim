import { AnchorProvider, setProvider, Wallet, web3 } from "@coral-xyz/anchor";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { Chain, chainToChainId } from "@wormhole-foundation/sdk-base";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import { DEPLOYMENTS } from ".";
import { fetchEstimate, fetchQuote } from "./executor/fetch";
import { encodeRelayInstructions } from "./executor/relayInstructions";
import { approve, transfer as evmTransfer } from "./evm";
import { transfer as svmTransfer } from "./svm";

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
const GUARDIAN_URL = "https://api.testnet.wormholescan.io";
const EXECUTOR_URL = "http://localhost:3000";

const coreBridgeAddress = new web3.PublicKey(
  "3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5"
);

const connection = new web3.Connection(SOLANA_RPC_URL, "confirmed");

const SOLANA_KEY = envStringRequired(`SOLANA_KEY`);

const payer = web3.Keypair.fromSecretKey(
  SOLANA_KEY.endsWith(".json")
    ? new Uint8Array(require(SOLANA_KEY))
    : bs58.decode(SOLANA_KEY)
);
const provider = new AnchorProvider(connection, new Wallet(payer));
setProvider(provider);

const ETH_KEY = env0xStringRequired(`ETH_KEY`);

const eth_account = privateKeyToAccount(ETH_KEY);
const evm_rpc = "https://avalanche-fuji-c-chain-rpc.publicnode.com";

const addressToBytes32 = (a: `0x${string}`): Uint8Array =>
  new Uint8Array(Buffer.from(a.substring(2).padStart(64, "0"), "hex"));

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

  const quote = await fetchQuote(EXECUTOR_URL, "Solana", "Avalanche");
  const relayInstructions = encodeRelayInstructions([
    { type: "GasInstruction", gasLimit: 250_000n, msgValue: 0n },
  ]);
  const estimate = await fetchEstimate(EXECUTOR_URL, quote, relayInstructions);
  console.log(`EXECUTION ESTIMATE: ${estimate.toString()}`);

  const tx = await svmTransfer(
    1000n,
    token,
    dstChainId,
    addressToBytes32(eth_account.address),
    dstTransferRecipient,
    dstTransferRecipient, // these are the same on EVM
    estimate,
    Buffer.from(quote.substring(2), "hex"),
    Buffer.from(relayInstructions.substring(2), "hex")
  );
  console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);
  console.log(
    `https://wormholescan.io/#/tx/${tx}?network=Testnet&view=overview`
  );
  console.log(
    `http://localhost:3000/v0/status/0001${bs58.decode(tx).toString("hex")}`
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
  const dstTransferRecipient = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("redeemer")],
    dstProgram
  )[0];

  const quote = await fetchQuote(EXECUTOR_URL, "Avalanche", "Solana");
  const relayInstructions = encodeRelayInstructions([
    { type: "GasInstruction", gasLimit: 250_000n, msgValue: 0n },
  ]);
  const estimate = await fetchEstimate(EXECUTOR_URL, quote, relayInstructions);
  console.log(`EXECUTION ESTIMATE: ${estimate.toString()}`);

  // const approvalTx = await approve(
  //   eth_account,
  //   avalancheFuji,
  //   evm_rpc,
  //   srcDeployment as `0x${string}`,
  //   token,
  //   100n
  // );
  // console.log(`https://testnet.snowtrace.io/tx/${approvalTx}?chainid=43113`);

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
    `0x${dstTransferRecipient.toBuffer().toString("hex")}`,
    `0x${dstProgram.toBuffer().toString("hex")}`,
    estimate,
    quote,
    relayInstructions
  );
  console.log(`https://testnet.snowtrace.io/tx/${tx}?chainid=43113`);
  console.log(
    `https://wormholescan.io/#/tx/${tx}?network=Testnet&view=overview`
  );
  console.log(
    `http://localhost:3000/v0/status/0006${tx.substring(2)}0000000000000000000000000000000000000000000000000000000000000007`
  );
}

(async () => {
  // await testSolanaToAvalanche();
  await testAvalancheToSolana();
})();
