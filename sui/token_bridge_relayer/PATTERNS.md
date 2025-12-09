# Integration Patterns: PTB vs Move Wrapper

This document explains the two integration patterns for the Sui Token Bridge Relayer v4 and why each exists.

## What is v4?

Version 4 (v4) refers to this simplified Token Bridge Relayer protocol that:

- Uses **Executor** for permissionless relay infrastructure (handles fees, gas, delivery)
- Has a **minimal 32-byte payload** (just recipient address)
- Removes relayer fees, native swaps, and state checks from v2
- Leverages Wormhole Token Bridge with payload type 3 (transfer_with_payload)

---

## Pattern 1: Direct PTB Composition

### What It Is

Build the Executor request **in TypeScript PTB**, just like Portal/Connect does in `executor.ts`.

### How It Works

```typescript
// Step 1: Prepare the Token Bridge transfer
const [preparedTransfer, dust] = tx.moveCall({
  target: `${tokenBridgeId}::transfer_tokens_with_payload::prepare_transfer`,
  arguments: [
    tx.object(emitterCapId), // Your EmitterCap
    tx.object(assetInfoId), // VerifiedAsset
    coin, // Coin to transfer
    tx.pure.u16(targetChain),
    tx.pure.vector("u8", recipientAddress),
    tx.pure.vector("u8", payload), // Your 32-byte payload
    tx.pure.u32(nonce),
  ],
  typeArguments: [coinType],
});

// Handle dust (optional - return to sender)
tx.transferObjects([dust!], tx.pure.address(senderAddress));

// Step 2: Complete the Token Bridge transfer (returns MessageTicket)
const [messageTicket] = tx.moveCall({
  target: `${tokenBridgeId}::transfer_tokens_with_payload::transfer_tokens_with_payload`,
  arguments: [tx.object(tokenBridgeStateId), preparedTransfer!],
});

// Step 3: Publish message to Wormhole (returns sequence)
const [sequence] = tx.moveCall({
  target: `${wormholeId}::publish_message::publish_message`,
  arguments: [
    tx.object(wormholeStateId),
    messageFee, // SUI coin for message fee
    messageTicket!,
    tx.object(CLOCK_ID),
  ],
});

// Step 4: Build Executor request IN PTB (not in Move!)
const [requestBytes] = tx.moveCall({
  target: `${executorRequestsId}::executor_requests::make_vaa_v1_request`,
  arguments: [
    tx.pure.u16(21), // Sui chain ID
    tx.pure.vector("u8", emitterAddress), // Your emitter address
    sequence!, // Use the returned sequence
  ],
});

// Step 5: Request execution via Executor
tx.moveCall({
  target: `${executorId}::executor::request_execution`,
  arguments: [
    executorPayment, // SUI coin for executor fee
    tx.object(CLOCK_ID),
    tx.pure.u16(targetChain),
    tx.pure.address(dstExecutionAddress),
    tx.pure.address(refundAddress),
    tx.pure.vector("u8", signedQuote),
    requestBytes!,
    tx.pure.vector("u8", relayInstructions),
  ],
});
```

**Note:** Pattern 1 requires managing the full Token Bridge flow yourself. Most developers should use Pattern 2 (Move wrapper) for simplicity.

### Advantages

- **No wrapper deployment needed** - Use Token Bridge directly
- **No cross-package dependencies** - Only need Executor and Token Bridge packages
- **Maximum flexibility** - Full control over the PTB
- **Follows established patterns** - Matches Portal/Connect architecture
- **Future-proof** - Easy to update if Executor changes

---

## Pattern 2: Move Wrapper (Recommended)

### What It Is

Use our `relayer_transfer.move` wrapper that builds the Executor request **inside Move**.

### How It Works

```move
// In relayer_transfer.move
public fun transfer_tokens_with_relay<C>(/* ... */): u64 {
    // 1. Prepare and complete Token Bridge transfer
    let (prepared_transfer, dust) = transfer_tokens_with_payload::prepare_transfer<C>(
        emitter_cap,
        asset_info,
        coins,
        target_chain,
        recipient_bytes,
        payload,
        nonce
    );

    let message_ticket = transfer_tokens_with_payload::transfer_tokens_with_payload(
        token_bridge_state,
        prepared_transfer
    );

    // 2. Publish to Wormhole and get sequence
    let sequence = publish_message::publish_message(
        wormhole_state,
        message_fee,
        message_ticket,
        clock
    );

    // 3. Build request INSIDE Move (not in PTB)
    let request_bytes = executor_requests::make_vaa_v1_request(
        CHAIN_ID,
        emitter_address,
        sequence
    );

    // 4. Request execution
    executor::request_execution(
        executor_payment,
        clock,
        target_chain,
        dst_execution_address,
        refund_addr,
        signed_quote,
        request_bytes,
        relay_instructions
    );

    sequence
}
```

Then in TypeScript:

```typescript
// Single function call - everything handled inside Move!
tx.moveCall({
  target: `${packageId}::relayer_transfer::transfer_tokens_with_relay`,
  arguments: [
    tx.object(relayerStateId), // Our relayer's State (shared object)
    tx.object(wormholeStateId), // Wormhole state
    tx.object(tokenBridgeStateId), // Token Bridge state
    coin,
    tx.object(assetInfoId),
    messageFee, // SUI coin for Wormhole message fee
    executorCoin, // SUI coin for Executor payment
    tx.object(CLOCK_ID),
    tx.pure.u16(targetChain),
    tx.pure.vector("u8", recipientBytes),
    tx.pure.address(dstExecutionAddress),
    tx.pure.address(refundAddress),
    tx.pure.vector("u8", signedQuote),
    tx.pure.vector("u8", relayInstructions),
    tx.pure.u32(nonce),
  ],
  typeArguments: [coinType],
});
```

### Advantages

- **Simpler PTB** - One function call instead of three
- **Encapsulated logic** - All logic in one place
- **Less boilerplate** - Don't need to extract values in TypeScript

### Trade-offs

- **Requires deployment** - Must deploy our wrapper contract
- **Cross-package dependency** - Depends on `executor_requests` package
- **Less flexible** - Can't customize the integration

---

## Redemption Pattern

### How Redemption Works

When tokens arrive on the destination chain, they must be redeemed. There are **two ways** to redeem:

#### Option 1: Automatic via Executor (Recommended)

The Executor relayer network automatically calls our redemption function:

```move
// In redeem.move
public fun execute_vaa_v1<C>(
    relayer_state: &State,
    receipt: complete_transfer_with_payload::RedeemerReceipt<C>
) {
    // 1. Complete Token Bridge transfer (validates VAA, mints/releases tokens)
    let (coins, transfer_payload, _emitter_chain) =
        complete_transfer_with_payload::redeem_coin<C>(
            emitter_cap,
            receipt
        );

    // 2. Parse the 32-byte payload to get recipient
    let payload_bytes = transfer_with_payload::payload(&transfer_payload);
    let relay_msg = message::deserialize(payload_bytes);
    let recipient = external_address::to_address(
        message::recipient(&relay_msg)
    );

    // 3. Transfer ALL tokens to recipient (no fee deduction)
    sui::transfer::public_transfer(coins, recipient);
}
```

**Key Points:**

- Called automatically by Executor relayer (you paid for this on source chain)
- Receives a `RedeemerReceipt` from Token Bridge authorization
- Transfers 100% of tokens to recipient (no fees deducted)
- Fees were already handled by Executor in native gas

#### Option 2: Manual via Portal SDK

If Executor fails or for standard Token Bridge transfers without Executor, users can redeem manually using the Portal SDK:

```typescript
// Use standard Token Bridge complete_transfer_with_payload
// This bypasses our execute_vaa_v1 function entirely
// See Portal SDK documentation for details
```

### When to Use Each Option

| Scenario              | Redemption Method    | Notes                                    |
| --------------------- | -------------------- | ---------------------------------------- |
| Normal flow           | Automatic (Executor) | Default - happens automatically          |
| Executor down         | Manual (Portal SDK)  | Fallback if Executor network unavailable |
| Standard Token Bridge | Manual (Portal SDK)  | For transfers not using our relayer      |
| Testing               | Either               | Both work, manual gives more control     |

---

## Complete Flow Diagram

```
Source Chain (Sui)
  │
  ├─> 1. User calls transfer_tokens_with_relay (Pattern 2)
  │      OR builds PTB manually (Pattern 1)
  │
  ├─> 2. Token Bridge: prepare + transfer + publish
  │      └─> Emits VAA with 32-byte payload
  │
  └─> 3. Executor: request_execution
         └─> Pays for cross-chain delivery

         ↓ Cross-chain relay ↓

Destination Chain (any chain)
  │
  └─> 4. Executor relayer calls execute_vaa_v1
         ├─> Validates VAA
         ├─> Mints/releases tokens
         └─> Sends 100% to recipient
```

---

## Summary

- **Pattern 1**: Full control, more complex PTB (5 steps)
- **Pattern 2**: Simple, one Move call (recommended)
- **Redemption**: Automatic via Executor, manual via Portal as fallback
