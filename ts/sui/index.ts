import { Transaction } from "@mysten/sui/transactions";
import { SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const CLOCK_ID = "0x6";

/**
 * Fetch the Token Bridge's EmitterCap ID from the Token Bridge State.
 * This is needed when initializing the Token Bridge Relayer State.
 *
 * @param client - SuiClient instance
 * @param tokenBridgeStateId - Token Bridge State object ID
 * @returns The Token Bridge EmitterCap ID as a hex string (with 0x prefix)
 *
 * @example
 * ```typescript
 * const emitterAddress = await getTokenBridgeEmitterAddress(client, TOKEN_BRIDGE_STATE_ID);
 * // Use this when calling create_state on the relayer:
 * // sui client call --package $RELAYER_PKG --module state --function create_state \
 * //   --args $INIT_CAP $WORMHOLE_STATE $emitterAddress $RELAYER_PKG
 * ```
 */
export async function getTokenBridgeEmitterAddress(
  client: SuiClient,
  tokenBridgeStateId: string,
): Promise<string> {
  const state = await client.getObject({
    id: tokenBridgeStateId,
    options: { showContent: true },
  });

  if (state.data?.content?.dataType !== "moveObject") {
    throw new Error("Invalid Token Bridge State object");
  }

  const fields = state.data.content.fields as Record<string, unknown>;
  const emitterCap = fields.emitter_cap as Record<string, unknown>;
  const emitterCapFields = emitterCap.fields as Record<string, unknown>;
  const emitterCapId = emitterCapFields.id as Record<string, string>;

  return emitterCapId.id;
}

/**
 * Transfer tokens from Sui to another chain via Token Bridge Relayer V4.
 *
 * @param client - SuiClient instance
 * @param signer - Keypair to sign the transaction
 * @param tokenBridgePackageId - Token Bridge package ID
 * @param relayerPackageId - Token Bridge Relayer V4 package ID
 * @param relayerStateId - Token Bridge Relayer V4 State object ID
 * @param wormholeStateId - Wormhole State object ID
 * @param tokenBridgeStateId - Token Bridge State object ID
 * @param coinType - Full coin type string (e.g., "0x2::sui::SUI")
 * @param amount - Amount to transfer (in base units)
 * @param targetChain - Wormhole chain ID of destination
 * @param recipientAddress - 32-byte recipient address on destination (who receives tokens)
 * @param dstExecutionAddress - Address of the relayer contract on destination chain
 *                              (this is the redeemer that will execute the transfer)
 * @param messageFee - Wormhole message fee (in MIST)
 * @param executorPayment - Payment for Executor relay service (in MIST)
 * @param signedQuoteBytes - Signed quote from Executor
 * @param relayInstructions - Relay instructions for Executor
 * @param nonce - Transaction nonce
 * @returns Transaction digest
 */
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
      verifiedAsset,
      messageFeeCoins,
      executorPaymentCoin,
      tx.object(CLOCK_ID),
      tx.pure.u16(targetChain),
      tx.pure.vector("u8", recipientAddress), // Final recipient on destination
      tx.pure.address(dstExecutionAddress), // Relayer contract that redeems on destination
      tx.pure.address(sender), // Refund address on source chain
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
