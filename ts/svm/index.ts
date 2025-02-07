import { BN, Program, web3 } from "@coral-xyz/anchor";
import { TokenBridgeRelayer } from "./idls/token_bridge_relayer";
import TokenBridgeRelayerIdl from "./idls/token_bridge_relayer.json";

export async function transfer(
  amount: bigint,
  token: web3.PublicKeyInitData,
  recipientChain: number,
  recipientAddress: Uint8Array,
  dstTransferRecipient: Uint8Array,
  dstExecutionAddress: Uint8Array,
  execAmount: bigint,
  signedQuoteBytes: Buffer,
  relayInstructions: Buffer
) {
  const program = new Program<TokenBridgeRelayer>(
    TokenBridgeRelayerIdl as TokenBridgeRelayer
  );
  const mint = new web3.PublicKey(token);
  const wormholeProgram = new web3.PublicKey(
    "3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5"
  );
  const tokenBridgeProgram = new web3.PublicKey(
    "DZnkkTmCiFWfYTfT41X3Rd1kDgozqzxWaHqsw6W4x2oe"
  );
  const tokenBridgeEmitter = new web3.PublicKey(
    "4yttKWzRoNYS2HekxDfcZYmfQqnVWpKiJ8eydYRuFRgs"
  );
  const messageKeypair = new web3.Keypair();
  return program.methods
    .transferNativeTokensWithRelay({
      amount: new BN(amount),
      recipientChain,
      recipientAddress,
      nonce: 0,
      wrapNative: true,
      dstTransferRecipient,
      dstExecutionAddress,
      execAmount: new BN(execAmount),
      signedQuoteBytes,
      relayInstructions,
    })
    .accountsPartial({
      mint,
      tokenBridgeConfig: web3.PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        tokenBridgeProgram
      )[0],
      tokenBridgeCustody: web3.PublicKey.findProgramAddressSync(
        [mint.toBuffer()],
        tokenBridgeProgram
      )[0],
      tokenBridgeAuthoritySigner: web3.PublicKey.findProgramAddressSync(
        [Buffer.from("authority_signer")],
        tokenBridgeProgram
      )[0],
      tokenBridgeCustodySigner: web3.PublicKey.findProgramAddressSync(
        [Buffer.from("custody_signer")],
        tokenBridgeProgram
      )[0],
      wormholeBridge: new web3.PublicKey(
        "6bi4JGDoRwUs9TYBuvoA7dUVyikTJDrJsJU1ew6KVLiu"
      ),
      wormholeMessage: messageKeypair.publicKey,
      tokenBridgeEmitter,
      tokenBridgeSequence: web3.PublicKey.findProgramAddressSync(
        [Buffer.from("Sequence"), tokenBridgeEmitter.toBytes()],
        wormholeProgram
      )[0],
      wormholeFeeCollector: new web3.PublicKey(
        "7s3a1ycs16d6SNDumaRtjcoyMaTDZPavzgsmS3uUZYWX"
      ),
      payee: new web3.PublicKey(signedQuoteBytes.slice(24, 56)),
      wormholeProgram,
      tokenBridgeProgram,
      clock: web3.SYSVAR_CLOCK_PUBKEY,
      rent: web3.SYSVAR_RENT_PUBKEY,
    })
    .signers([messageKeypair])
    .rpc();
}
