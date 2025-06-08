import { BN, Program, web3 } from "@coral-xyz/anchor";
import { TokenBridgeRelayer } from "./idls/token_bridge_relayer";
import TokenBridgeRelayerIdl from "./idls/token_bridge_relayer.json";

export async function transfer(
  amount: bigint,
  token: web3.PublicKeyInitData,
  recipientChain: number,
  recipientAddress: number[],
  dstTransferRecipient: number[],
  dstExecutionAddress: number[],
  execAmount: bigint,
  signedQuoteBytes: Buffer,
  relayInstructions: Buffer,
) {
  const program = new Program<TokenBridgeRelayer>(
    TokenBridgeRelayerIdl as TokenBridgeRelayer,
  );
  const mint = new web3.PublicKey(token);
  const wormholeProgram = new web3.PublicKey(
    "3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5",
  );
  const tokenBridgeProgram = new web3.PublicKey(
    "DZnkkTmCiFWfYTfT41X3Rd1kDgozqzxWaHqsw6W4x2oe",
  );
  const tokenBridgeEmitter = new web3.PublicKey(
    "4yttKWzRoNYS2HekxDfcZYmfQqnVWpKiJ8eydYRuFRgs",
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
        tokenBridgeProgram,
      )[0],
      tokenBridgeCustody: web3.PublicKey.findProgramAddressSync(
        [mint.toBuffer()],
        tokenBridgeProgram,
      )[0],
      tokenBridgeAuthoritySigner: web3.PublicKey.findProgramAddressSync(
        [Buffer.from("authority_signer")],
        tokenBridgeProgram,
      )[0],
      tokenBridgeCustodySigner: web3.PublicKey.findProgramAddressSync(
        [Buffer.from("custody_signer")],
        tokenBridgeProgram,
      )[0],
      wormholeBridge: new web3.PublicKey(
        "6bi4JGDoRwUs9TYBuvoA7dUVyikTJDrJsJU1ew6KVLiu",
      ),
      wormholeMessage: messageKeypair.publicKey,
      tokenBridgeEmitter,
      tokenBridgeSequence: web3.PublicKey.findProgramAddressSync(
        [Buffer.from("Sequence"), tokenBridgeEmitter.toBytes()],
        wormholeProgram,
      )[0],
      wormholeFeeCollector: new web3.PublicKey(
        "7s3a1ycs16d6SNDumaRtjcoyMaTDZPavzgsmS3uUZYWX",
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

export async function redeem(
  recipient: web3.PublicKey,
  vaa_hash: number[],
  token: web3.PublicKeyInitData,
  emitterChain: number,
  emitterAddress: Buffer | Uint8Array | string,
  sequence: bigint | number,
) {
  const program = new Program<TokenBridgeRelayer>(
    TokenBridgeRelayerIdl as TokenBridgeRelayer,
  );
  const mint = new web3.PublicKey(token);
  const wormholeProgram = new web3.PublicKey(
    "3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5",
  );
  const tokenBridgeProgram = new web3.PublicKey(
    "DZnkkTmCiFWfYTfT41X3Rd1kDgozqzxWaHqsw6W4x2oe",
  );
  // required for claim derivation
  const address =
    typeof emitterAddress == "string"
      ? Buffer.from(emitterAddress, "hex")
      : Buffer.from(emitterAddress);
  if (address.length != 32) {
    throw Error("address.length != 32");
  }
  const sequenceSerialized = Buffer.alloc(8);
  sequenceSerialized.writeBigUInt64BE(
    typeof sequence == "number" ? BigInt(sequence) : sequence,
  );
  return program.methods
    .completeNativeTransferWithRelay(vaa_hash)
    .accountsPartial({
      mint,
      recipient,
      tokenBridgeConfig: web3.PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        tokenBridgeProgram,
      )[0],
      vaa: web3.PublicKey.findProgramAddressSync(
        [Buffer.from("PostedVAA"), Buffer.from(vaa_hash)],
        wormholeProgram,
      )[0],
      tokenBridgeClaim: web3.PublicKey.findProgramAddressSync(
        [
          address,
          (() => {
            const buf = Buffer.alloc(2);
            buf.writeUInt16BE(emitterChain as number);
            return buf;
          })(),
          sequenceSerialized,
        ],
        tokenBridgeProgram,
      )[0],
      tokenBridgeForeignEndpoint: web3.PublicKey.findProgramAddressSync(
        [
          (() => {
            const buf = Buffer.alloc(2);
            buf.writeUInt16BE(emitterChain as number);
            return buf;
          })(),
          address,
        ],
        tokenBridgeProgram,
      )[0],
      tokenBridgeCustody: web3.PublicKey.findProgramAddressSync(
        [mint.toBuffer()],
        tokenBridgeProgram,
      )[0],
      tokenBridgeCustodySigner: web3.PublicKey.findProgramAddressSync(
        [Buffer.from("custody_signer")],
        tokenBridgeProgram,
      )[0],
      wormholeProgram,
      tokenBridgeProgram,
      rent: web3.SYSVAR_RENT_PUBKEY,
    })
    .rpc();
}
