# Permissionless Token Bridge Relayer

## Objective

Replace the custom off-chain [Token Bridge Relayers](https://github.com/wormhole-foundation/example-token-bridge-relayer/tree/main) with a solution that reuses the new [Executor](https://github.com/wormholelabs-xyz/example-messaging-executor) infrastructure.

## Background

The existing Token Bridge Relayer design requires an administrator to run an off-chain price oracle to submit price updates on-chain to each Token Bridge Relayer contract. It also requires a specialized off-chain relayer to relay the requests. Fees are taken in the tokens being transferred along with an option to drop off native gas on the destination chain in exchange for part of the transferred tokens. The Token Bridge Relayer only supports a subset of tokens, and each token must be explicitly supported by the administrator.

## Goals

- Use Executor in place of this custom relaying mechanism.
- Require minimal-to-no custom off-chain code. Any code to solve this problem should be re-usable by any integrator, not specific to a given deployment.
- Require as little permission-ed functionality as possible.
- This approach should at least work for EVM, Solana, Aptos, and Sui.
- Relative ease of integration into Connect.
- Support relaying arbitrary tokens.
- Pay fees in native gas.

## Non-Goals

- _Guaranteed_ delivery or _guaranteed_ gas drop-off.
- On-chain integration.
- Pay fees in transferred tokens.

## Overview

Fork the Token Bridge Relayer contracts and remove everything related to relaying, fees, and gas drop-off, using Executor in its place.

1. Keep the existing logic around transferWithPayload / payload 3, in order to maintain native-unwrapping guarantees.
2. Request execution for the resulting VAA ID to a corresponding contract on the destination chain, specified by the caller.

No special off-chain Executor code is necessary, as the destination shim should conform to the applicable Executor API [TBD].

[Relay instructions](https://github.com/wormholelabs-xyz/example-messaging-executor/blob/main/evm/src/libraries/RelayInstructions.sol#L4), e.g. gas estimation and requesting gas drop-off would be handled client-side.

## Detailed Design

### Technical Details

#### On-Chain

The following is explained in terms of the EVM contracts, but the same principles apply elsewhere. Provide an immutable contract, which contains the following functionality.

1. In order to support a permissionless contract and the required Executor parameters, the function would take a combination of the existing Token Bridge Relayer [`transferTokensWithRelay`](https://github.com/wormhole-foundation/example-token-bridge-relayer/blob/d9d17254dae48c985fe6b58e2987e2135d1e8c65/evm/src/token-bridge-relayer/TokenBridgeRelayer.sol#L99C14-L99C37) and Executor [`requestExecution`](https://github.com/wormholelabs-xyz/example-messaging-executor/blob/57c49d9ad7c410b9a7f938e07a5444f07872159d/evm/src/Executor.sol#L22) functions. `toNativeTokenAmount` can be omitted since this is using Executor, and `requestBytes` will be formed on-chain. The payload 3 recipient and destination address for Executor can be provided by the caller, in order to keep this contract permissionless. This might look like:

   ```solidity
   function transferTokensWithRelay(
     address token,
     uint256 amount,
     uint16  targetChain,
     bytes32 targetRecipient,
     uint32  nonce,
     bytes32 dstTransferRecipient, // token bridge payload 3 recipient
     bytes32 dstExecutionAddress,  // executor destination address
     address refundAddr,
     bytes calldata signedQuoteBytes,
     bytes calldata relayInstructions
   ) public payable nonReentrant notPaused returns (uint64 messageSequence)
   ```

2. Call `transferTokensWithPayload` on the Token Bridge, passing through user designated tokens. This returns a sequence number. The transfer payload will vary from the existing Token Bridge Relayer contracts, in that it will only contain the `targetRecipient`.
3. Request execution to the destination chain and the specified destination execution address for the resulting VAA ID using [`makeVAAV1Request`](https://github.com/wormholelabs-xyz/example-messaging-executor/blob/57c49d9ad7c410b9a7f938e07a5444f07872159d/evm/src/libraries/ExecutorMessages.sol#L36) and [`requestExecution`](https://github.com/wormholelabs-xyz/example-messaging-executor/blob/main/evm/src/Executor.sol#L22).

#### Off-Chain

No specialized off-chain code should be necessary.

### Protocol Integration

This requires no protocol changes beyond the explorer changes already recommended for Executor.

### API / database schema

N/A

## Caveats

The front-end / integrator will need to specify a valid destination shim contract in order for the relay to be successful. This is potentially less-risky than being controlled by a contract-side administrator, in that it carries no greater risk than the existing mappings provided in Connect / the SDK, whereas a contract administrator could maliciously redirect funds from an already deployed SDK/UI.

## Alternatives Considered

1. Request execution for the resulting VAA ID to the registered endpoint for the destination chain and augment the off-chain relayer code of Executor to override the receiving contract and function call for a given destination chain and address pair. This would require additionally complexity in the off-chain code and make it more difficult to maintain a universal relaying specification.
2. Add a new request type to indicate that this relay should be handled with custom Token Bridge logic. Unfortunately, this does not add significant value and would still require the same changes of this design or alternate 1.

It should be noted that the provided design and these alternatives are **not** mutually exclusive. They can co-exist, though it may be easier on the ecosystem if there was one canonical approach with the most simplistic off-chain expectations.

## Security Considerations

The on-chain portion of this design is permission-less. The handling of Token Bridge executions in this way does not prohibit others from deploying their own contracts which re-use this approach or following any approach which adheres to the spec.

Unlike many payload 3 integrations, this one can be done permissionlessly (without cross-registering) because the encoded payload only contains untrusted content - the `targetRecipient`.

## Test Plan

This is most easily tested with the testnet deployment of the Token Bridge and a running Executor against testnet. It should be ensured that a deployment can successfully send and receive the native fee paying token (e.g. ETH, SOL), a native token (e.g. ERC-20, SPL), and a wrapped token.

## Performance Impact

This approach allows for the relaying of arbitrary Token Bridge tokens by paying the Executor in native gas. It can do this with a slight increase in on-chain complexity (primarily, one additional call stack) without the addition of any off-chain complexity.

When compared to the existing Token Bridge Relayer, instead of admin-defined fees and native gas rates per specified token, it allows for an end-user choice of relay provider and arbitrary token transfers.

⚠ **This software is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
implied. See the License for the specific language governing permissions and limitations under the License.** Or plainly
spoken - this is a very complex piece of software which targets a bleeding-edge, experimental smart contract runtime.
Mistakes happen, and no matter how hard you try and whether you pay someone to audit it, it may eat your tokens, set
your printer on fire or startle your cat. Cryptocurrencies are a high-risk investment, no matter how fancy.
