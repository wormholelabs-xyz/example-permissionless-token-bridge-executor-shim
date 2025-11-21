import { Transaction } from "@mysten/sui/transactions";
import { SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const CLOCK_ID = "0x6";

export async function transfer(
  client: SuiClient,
  signer: Ed25519Keypair,
  tokenBridgePackageId: string,
  relayerPackageId: string,
  relayerStateId: string,
  wormholeStateId: string,
  tokenBridgeStateId: string,
  coinType: string,
  amount: bigint,
  targetChain: number,
  recipientAddress: number[],
  dstTransferRecipient: string,
  dstExecutionAddress: string,
  messageFee: bigint,
  executorPayment: bigint,
  signedQuoteBytes: Buffer,
  relayInstructions: Buffer,
  nonce: number,
): Promise<string> {
  const sender = signer.toSuiAddress();
  const tx = new Transaction();

  const [transferCoin] = tx.splitCoins(tx.gas, [amount]);
  const [messageFeeCoins] = tx.splitCoins(tx.gas, [messageFee]);
  const [executorPaymentCoin] = tx.splitCoins(tx.gas, [executorPayment]);

  // Create VerifiedAsset by calling state::verified_asset
  // This is a convenience function that internally borrows the token registry
  const [verifiedAsset] = tx.moveCall({
    target: `${tokenBridgePackageId}::state::verified_asset`,
    arguments: [tx.object(tokenBridgeStateId)],
    typeArguments: [coinType],
  });

  tx.moveCall({
    target: `${relayerPackageId}::relayer_transfer::transfer_tokens_with_relay`,
    arguments: [
      tx.object(relayerStateId),
      tx.object(wormholeStateId),
      tx.object(tokenBridgeStateId),
      transferCoin,
      verifiedAsset, // Pass the created VerifiedAsset
      messageFeeCoins,
      executorPaymentCoin,
      tx.object(CLOCK_ID),
      tx.pure.u16(targetChain),
      tx.pure.vector("u8", recipientAddress),
      tx.pure.address(dstTransferRecipient),
      tx.pure.address(sender), // refund_addr
      tx.pure.vector("u8", Array.from(signedQuoteBytes)),
      tx.pure.vector("u8", Array.from(relayInstructions)),
      tx.pure.u32(nonce),
    ],
    typeArguments: [coinType],
  });

  tx.setGasBudget(100_000_000); // 0.1 SUI

  const result = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: {
      showEffects: true,
      showEvents: true,
    },
  });

  return result.digest;
}

/**
 * Redeem a Token Bridge transfer with relay
 *
 * Builds a 4-command PTB following the resolver pattern:
 * 1. parse_and_verify (Wormhole core)
 * 2. verify_only_once (Token Bridge replay protection)
 * 3. authorize_transfer (Token Bridge authorization)
 * 4. execute_vaa_v1 (TB Relayer V4 execution)
 */
export async function redeem(
  client: SuiClient,
  signer: Ed25519Keypair,
  wormholePackageId: string,
  tokenBridgePackageId: string,
  relayerPackageId: string,
  wormholeStateId: string,
  tokenBridgeStateId: string,
  relayerStateId: string,
  coinType: string,
  vaaBytes: Uint8Array,
): Promise<string> {
  const tx = new Transaction();

  // Command 1: parse_and_verify (Wormhole core)
  const [verifiedVaa] = tx.moveCall({
    target: `${wormholePackageId}::vaa::parse_and_verify`,
    arguments: [
      tx.object(wormholeStateId),
      tx.pure.vector("u8", Array.from(vaaBytes)),
      tx.object(CLOCK_ID),
    ],
  });

  // Command 2: verify_only_once (Token Bridge replay protection)
  const [msg] = tx.moveCall({
    target: `${tokenBridgePackageId}::vaa::verify_only_once`,
    arguments: [tx.object(tokenBridgeStateId), verifiedVaa],
  });

  // Command 3: authorize_transfer (Token Bridge authorization)
  const [receipt] = tx.moveCall({
    target: `${tokenBridgePackageId}::complete_transfer_with_payload::authorize_transfer`,
    arguments: [tx.object(tokenBridgeStateId), msg],
    typeArguments: [coinType],
  });

  // Command 4: execute_vaa_v1 (TB Relayer V4 execution)
  tx.moveCall({
    target: `${relayerPackageId}::redeem::execute_vaa_v1`,
    arguments: [tx.object(relayerStateId), receipt],
    typeArguments: [coinType],
  });

  tx.setGasBudget(100_000_000);

  const result = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: {
      showEffects: true,
      showEvents: true,
    },
  });

  return result.digest;
}
