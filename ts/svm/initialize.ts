import {
  AnchorProvider,
  BN,
  Program,
  setProvider,
  Wallet,
  web3,
} from "@coral-xyz/anchor";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { TokenBridgeRelayer } from "./idls/token_bridge_relayer";
import TokenBridgeRelayerIdl from "./idls/token_bridge_relayer.json";

const SVM_RPC_URL = "https://api.devnet.solana.com";

const connection = new web3.Connection(SVM_RPC_URL, "confirmed");

const SVM_KEY = process.env.SVM_KEY;
if (!SVM_KEY) {
  throw new Error("SVM_KEY is required!");
}

const payer = web3.Keypair.fromSecretKey(
  SVM_KEY.endsWith(".json")
    ? new Uint8Array(require(SVM_KEY))
    : bs58.decode(SVM_KEY),
);

const provider = new AnchorProvider(connection, new Wallet(payer));
setProvider(provider);

const program = new Program<TokenBridgeRelayer>(
  TokenBridgeRelayerIdl as TokenBridgeRelayer,
);

const recentSlot = (await program.provider.connection.getSlot()) - 1;
const tx = await program.methods.initialize(new BN(recentSlot)).rpc();

console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);
