# Token Bridge Relayer V4 PTB Resolver

A [Sui PTB Resolver](https://github.com/wormhole-foundation/example-native-token-transfers/tree/main/sui/sui_ptb_resolver) implementation for Wormhole Token Bridge Relayer V4 (TB Relayer V4). This resolver enables **gas-free discovery** of cross-chain token bridge redemptions on Sui, building complete Programmable Transaction Blocks (PTBs) for permissionless relay execution.

## What is a PTB Resolver?

PTB Resolvers are a novel pattern for building complex Programmable Transaction Blocks on Sui through **iterative offchain data discovery**. Instead of requiring upfront knowledge of all package addresses, coin types, and object references, resolvers:

1.  **Discover data incrementally** - Request package addresses, table lookups, and type information through dry-run execution

2.  **Build PTBs dynamically** - Construct transaction commands as data becomes available

3.  **Enable gas-free discovery** - All lookups happen offchain via RPC, only the final PTB execution costs gas

4.  **Support permissionless relaying** - Anyone can execute the final PTB without special permissions

Learn more about the PTB Resolver pattern:

- **Framework**: https://github.com/wormholelabs-xyz/sui-ptb-resolver/tree/main/sui_ptb_resolver

- **TypeScript SDK**: [@wormhole-labs/sui-ptb-resolver](https://www.npmjs.com/package/@wormhole-labs/sui-ptb-resolver)

## What This Resolver Does

This resolver handles **Token Bridge Relayer V4 redemption** on Sui. Given a Wormhole VAA (Verifiable Action Approval) containing a `transfer_with_payload` message (payload type 3), it:

1.  **Validates** the VAA is a Token Bridge Relayer V4 message

2.  **Discovers** required package addresses (Wormhole core, Token Bridge)

3.  **Looks up** the coin type from the Token Bridge registry using structured table queries

4.  **Builds** a 4-command PTB for complete redemption:

- `parse_and_verify` - Verifies VAA signatures (Wormhole core)

- `verify_only_once` - Prevents replay attacks (Token Bridge)

- `authorize_transfer` - Creates `RedeemerReceipt` (Token Bridge)

- `execute_vaa_v1` - Executes the transfer and sends coins to recipient (TB Relayer V4)

### State Design

The `State` object stores:

**Required fields** (PTB Resolver spec):

- `package_id` - Address of this resolver package

- `module_name` - Name of the resolver module ("resolver")

**Domain-specific fields** (TB Relayer V4):

- `wormhole_state` - Wormhole core state object address

- `token_bridge_state` - Token Bridge state object address

- `relayer_state` - Token Bridge Relayer V4 state object address

- `relayer_package` - Token Bridge Relayer V4 package address

## VAA Structure

This resolver expects Token Bridge `transfer_with_payload` VAAs (payload type 3):

```

VAA Header:

- version: 1 byte

- guardian_set_index: 4 bytes

- signature_count: 1 byte

- signatures: 66 bytes × signature_count

- timestamp: 4 bytes

- nonce: 4 bytes

- emitter_chain: 2 bytes

- emitter_address: 32 bytes

- sequence: 8 bytes

- consistency_level: 1 byte



TransferWithPayload Payload:

- payload_type: 1 byte (= 3)

- amount: 32 bytes (u256)

- token_address: 32 bytes

- token_chain: 2 bytes

- redeemer: 32 bytes

- redeemer_chain: 2 bytes

- sender: 32 bytes

- payload_length: 2 bytes

- payload: variable bytes

```

The resolver:

1. Validates `payload_type == 3`

2. Extracts `token_address` and `token_chain` for coin type lookup

3. The `payload` field contains the TB Relayer V4 message with recipient address

## Dependencies

- **Sui Framework**: `framework/mainnet`

- **sui_ptb_resolver**: https://github.com/wormholelabs-xyz/sui-ptb-resolver/tree/main/sui_ptb_resolver

- **Wormhole**: `sui/mainnet` branch

- **Token Bridge**: `sui/mainnet` branch

- **Token Bridge Relayer V4**: https://github.com/wormholelabs-xyz/example-permissionless-token-bridge-executor-shim/tree/main/sui

## Resources

- **PTB Resolver Framework**: https://github.com/wormholelabs-xyz/sui-ptb-resolver/tree/main/sui_ptb_resolver

- **TypeScript SDK**: [@wormhole-labs/sui-ptb-resolver](https://www.npmjs.com/package/@wormhole-labs/sui-ptb-resolver)

- **Wormhole Docs**: https://docs.wormhole.com

- **Sui Move Docs**: https://docs.sui.io/concepts/sui-move-concepts

## License

Apache 2.0

## Acknowledgments

Built using the [Sui PTB Resolver](https://github.com/wormholelabs-xyz/sui-ptb-resolver) framework by Wormhole Foundation.
