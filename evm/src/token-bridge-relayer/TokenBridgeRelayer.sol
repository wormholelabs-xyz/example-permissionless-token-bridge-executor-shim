// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.17;

import {IWETH} from "../interfaces/IWETH.sol";
import {IWormhole} from "../interfaces/IWormhole.sol";
import {ITokenBridge} from "../interfaces/ITokenBridge.sol";

import "../libraries/BytesLib.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "example-messaging-executor/evm/src/interfaces/IExecutor.sol";
import "example-messaging-executor/evm/src/interfaces/IVaaV1Receiver.sol";
import "example-messaging-executor/evm/src/libraries/ExecutorMessages.sol";

import "./TokenBridgeRelayerMessages.sol";
import "./TokenBridgeRelayerGetters.sol";

string constant tokenBridgeRelayerVersion = "TokenBridgeRelayer-0.4.0";

/**
 * @title Wormhole Token Bridge Relayer
 * @notice This contract composes on Wormhole's Token Bridge contracts to facilitate
 * one-click transfers of Token Bridge supported assets cross chain.
 */
contract TokenBridgeRelayer is
    TokenBridgeRelayerGetters,
    TokenBridgeRelayerMessages,
    ReentrancyGuard,
    IVaaV1Receiver
{
    using BytesLib for bytes;

    // contract version
    string public constant VERSION = tokenBridgeRelayerVersion;

    // Wormhole chain ID of this contract
    uint16 public immutable chainId;
    // boolean to determine if weth is unwrappable
    bool public immutable unwrapWeth;
    // address of WETH on this chain
    IWETH public immutable weth;
    // address of the Wormhole contract on this chain
    IWormhole public immutable wormhole;
    // address of the Wormhole TokenBridge contract on this chain
    ITokenBridge public immutable tokenBridge;
    bytes32 public immutable tokenBridgeEmitter;
    // address of the Executor contract on this chain
    IExecutor public immutable executor;

    constructor(address tokenBridge_, bool unwrapWeth_, address executor_) {
        assert(tokenBridge_ != address(0));
        assert(executor_ != address(0));

        tokenBridge = ITokenBridge(payable(tokenBridge_));
        tokenBridgeEmitter = bytes32(uint256(uint160(tokenBridge_)));
        weth = tokenBridge.WETH();
        unwrapWeth = unwrapWeth_;

        if (unwrapWeth) {
            assert(address(weth) != address(0));
        }

        chainId = tokenBridge.chainId();
        wormhole = tokenBridge.wormhole();

        executor = IExecutor(payable(executor_));
    }

    /**
     * @notice Emitted when a transfer is completed by the Wormhole token bridge
     * @param emitterChainId Wormhole chain ID of emitter contract on the source chain
     * @param emitterAddress Address (bytes32 zero-left-padded) of emitter on the source chain
     * @param sequence Sequence of the Wormhole message
     */
    event TransferRedeemed(uint16 indexed emitterChainId, bytes32 indexed emitterAddress, uint64 indexed sequence);

    /**
     * @notice Calls Wormhole's Token Bridge contract to emit a contract-controlled
     * transfer. The transfer message includes the target recipient on the destination chain.
     * @param token ERC20 token address to transfer cross chain.
     * @param amount Quantity of tokens to be transferred.
     * @param targetChain Wormhole chain ID of the target blockchain.
     * @param targetRecipient User's wallet address on the target blockchain in bytes32 format
     * (zero-left-padded).
     * @param nonce Wormhole message nonce
     * @param dstTransferRecipient Token Bridge payload 3 recipient
     * @param dstExecutionAddress Executor destination address
     * @param executionAmount msg.value to be sent to the execution payee
     * @param refundAddr Executor refund address on this chain
     * @param signedQuoteBytes Executor signed quote
     * @param relayInstructions Executor relay instructions
     * @return messageSequence Wormhole sequence for emitted TransferTokensWithRelay message.
     */
    function transferTokensWithRelay(
        address token,
        uint256 amount,
        uint16 targetChain,
        bytes32 targetRecipient,
        uint32 nonce,
        bytes32 dstTransferRecipient,
        bytes32 dstExecutionAddress,
        uint256 executionAmount,
        address refundAddr,
        bytes calldata signedQuoteBytes,
        bytes calldata relayInstructions
    ) public payable nonReentrant returns (uint64 messageSequence) {
        // Cache wormhole fee and confirm that the user has passed enough
        // value to cover the wormhole protocol fee.
        uint256 wormholeFee = wormhole.messageFee();
        require(msg.value == wormholeFee + executionAmount, "insufficient value");

        // Cache token decimals, and remove dust from the amount argument. This
        // ensures that the dust is never transferred to this contract.
        uint8 tokenDecimals = getDecimals(token);
        amount = denormalizeAmount(normalizeAmount(amount, tokenDecimals), tokenDecimals);

        // Transfer tokens from user to the this contract, and
        // override amount with actual amount received.
        amount = custodyTokens(token, amount);

        // call the internal _transferTokensWithRelay function
        messageSequence = _transferTokensWithRelay(
            InternalTransferParams({
                token: token,
                tokenDecimals: tokenDecimals,
                amount: amount,
                targetChain: targetChain,
                targetRecipient: targetRecipient,
                nonce: nonce,
                wormholeFee: wormholeFee,
                dstTransferRecipient: dstTransferRecipient,
                dstExecutionAddress: dstExecutionAddress,
                executionAmount: executionAmount,
                refundAddr: refundAddr
            }),
            signedQuoteBytes,
            relayInstructions
        );
    }

    /**
     * @notice Wraps Ether and calls Wormhole's Token Bridge contract to emit
     * a contract-controlled transfer. The transfer message includes an arbitrary
     * payload with instructions for how to handle relayer payments on the target
     * contract and the quantity of tokens to convert into native assets for the user.
     * @param targetChain Wormhole chain ID of the target blockchain.
     * @param targetRecipient User's wallet address on the target blockchain in bytes32 format
     * (zero-left-padded).
     * @param nonce Wormhole message nonce
     * @return messageSequence Wormhole sequence for emitted TransferTokensWithRelay message.
     */
    function wrapAndTransferEthWithRelay(
        uint16 targetChain,
        bytes32 targetRecipient,
        uint32 nonce,
        bytes32 dstTransferRecipient,
        bytes32 dstExecutionAddress,
        uint256 executionAmount,
        address refundAddr,
        bytes calldata signedQuoteBytes,
        bytes calldata relayInstructions
    ) public payable returns (uint64 messageSequence) {
        require(unwrapWeth, "WETH functionality not supported");

        // Cache wormhole fee and confirm that the user has passed enough
        // value to cover the wormhole protocol fee.
        uint256 wormholeFee = wormhole.messageFee();
        uint256 fees = wormholeFee + executionAmount;
        require(msg.value > fees, "insufficient value");

        // remove the wormhole protocol fee and execution payment from the amount
        uint256 amount = msg.value - fees;

        // refund dust
        uint256 dust = amount - denormalizeAmount(normalizeAmount(amount, 18), 18);
        if (dust > 0) {
            payable(msg.sender).transfer(dust);
        }

        // remove dust from amount and cache WETH
        uint256 amountLessDust = amount - dust;

        // deposit into the WETH contract
        weth.deposit{value: amountLessDust}();

        // call the internal _transferTokensWithRelay function
        messageSequence = _transferTokensWithRelay(
            InternalTransferParams({
                token: address(weth),
                tokenDecimals: 18,
                amount: amountLessDust,
                targetChain: targetChain,
                targetRecipient: targetRecipient,
                nonce: nonce,
                wormholeFee: wormholeFee,
                dstTransferRecipient: dstTransferRecipient,
                dstExecutionAddress: dstExecutionAddress,
                executionAmount: executionAmount,
                refundAddr: refundAddr
            }),
            signedQuoteBytes,
            relayInstructions
        );
    }

    function _transferTokensWithRelay(
        InternalTransferParams memory params,
        bytes calldata signedQuoteBytes,
        bytes calldata relayInstructions
    ) internal returns (uint64 messageSequence) {
        // sanity check function arguments
        require(params.targetRecipient != bytes32(0), "targetRecipient cannot be bytes32(0)");

        /**
         * Cache the normalized amount and verify that it's nonzero.
         * The token bridge performs the same operation before encoding
         * the amount in the `TransferWithPayload` message.
         */
        uint256 normalizedAmount = normalizeAmount(params.amount, params.tokenDecimals);
        require(normalizedAmount > 0, "normalized amount must be > 0");

        /**
         * Encode instructions (TransferWithRelay) to send with the token transfer.
         * The `targetRecipient` address is in bytes32 format (zero-left-padded) to
         * support non-evm smart contracts that have addresses that are longer
         * than 20 bytes.
         *
         * We normalize the relayerFee and toNativeTokenAmount to support
         * non-evm smart contracts that can only handle uint64.max values.
         */
        bytes memory messagePayload =
            encodeTransferWithRelay(TransferWithRelay({targetRecipient: params.targetRecipient}));

        // approve the token bridge to spend the specified tokens
        SafeERC20.safeApprove(IERC20(params.token), address(tokenBridge), params.amount);

        /**
         * Call `transferTokensWithPayload` method on the token bridge and pay
         * the Wormhole network fee. The token bridge will emit a Wormhole
         * message with an encoded `TransferWithPayload` struct (see the
         * ITokenBridge.sol interface file in this repo).
         */
        messageSequence = tokenBridge.transferTokensWithPayload{value: params.wormholeFee}(
            params.token, params.amount, params.targetChain, params.dstTransferRecipient, params.nonce, messagePayload
        );

        executor.requestExecution{value: params.executionAmount}(
            params.targetChain,
            params.dstExecutionAddress,
            params.refundAddr,
            signedQuoteBytes,
            ExecutorMessages.makeVAAv1Request(chainId, tokenBridgeEmitter, messageSequence),
            relayInstructions
        );
    }

    /**
     * @notice Calls Wormhole's Token Bridge contract to complete token transfers. Takes
     * custody of the wrapped (or released) tokens and sends the tokens to the target recipient.
     * It pays the fee recipient in the minted token denomination. If requested by the user,
     * it will perform a swap with the off-chain relayer to provide the user with native assets.
     * If the `token` being transferred is WETH, the contract will unwrap native assets and send
     * the transferred amount to the recipient and pay the fee recipient in native assets.
     * @dev reverts if:
     * - the transferred token is not accepted by this contract
     * - the transferred token is not attested on this blockchain's Token Bridge contract
     * - the emitter of the transfer message is not registered with this contract
     * - the relayer fails to provide enough native assets to facilitate a native swap
     * - the recipient attempts to swap native assets when performing a self redemption
     * @param encodedTransferMessage Attested `TransferWithPayload` wormhole message.
     */
    function executeVAAv1(bytes calldata encodedTransferMessage) public payable {
        // complete the transfer by calling the token bridge
        (bytes memory payload, uint256 amount, address token) = _completeTransfer(encodedTransferMessage);

        // parse the payload into the `TransferWithRelay` struct
        TransferWithRelay memory transferWithRelay = decodeTransferWithRelay(payload);

        // cache the recipient address and unwrap weth flag
        address recipient = bytes32ToAddress(transferWithRelay.targetRecipient);

        // transfer the full amount to the recipient
        if (token == address(weth) && unwrapWeth) {
            // withdraw weth and send to the recipient
            weth.withdraw(amount);
            payable(recipient).transfer(amount);
        } else {
            SafeERC20.safeTransfer(IERC20(token), recipient, amount);
        }
    }

    function _completeTransfer(bytes memory encodedTransferMessage) internal returns (bytes memory, uint256, address) {
        /**
         * parse the encoded Wormhole message
         *
         * SECURITY: This message not been verified by the Wormhole core layer yet.
         * The encoded payload can only be trusted once the message has been verified
         * by the Wormhole core contract. In this case, the message will be verified
         * by a call to the token bridge contract in subsequent actions.
         */
        IWormhole.VM memory parsedMessage = wormhole.parseVM(encodedTransferMessage);

        /**
         * The amount encoded in the payload could be incorrect,
         * since fee-on-transfer tokens are supported by the token bridge.
         *
         * NOTE: The token bridge truncates the encoded amount for any token
         * with decimals greater than 8. This is to support blockchains that
         * cannot handle transfer amounts exceeding max(uint64).
         */
        address localTokenAddress = fetchLocalAddressFromTransferMessage(parsedMessage.payload);

        // check balance before completing the transfer
        uint256 balanceBefore = getBalance(localTokenAddress);

        /**
         * Call `completeTransferWithPayload` on the token bridge. This
         * method acts as a reentrancy protection since it does not allow
         * transfers to be redeemed more than once.
         */
        bytes memory transferPayload = tokenBridge.completeTransferWithPayload(encodedTransferMessage);

        // compute and save the balance difference after completing the transfer
        uint256 amountReceived = getBalance(localTokenAddress) - balanceBefore;

        // parse the wormhole message payload into the `TransferWithPayload` struct
        ITokenBridge.TransferWithPayload memory transfer = tokenBridge.parseTransferWithPayload(transferPayload);

        // emit event with information about the TransferWithPayload message
        emit TransferRedeemed(parsedMessage.emitterChainId, parsedMessage.emitterAddress, parsedMessage.sequence);

        return (transfer.payload, amountReceived, localTokenAddress);
    }

    /**
     * @notice Parses the encoded address and chainId from a `TransferWithPayload`
     * message. Finds the address of the wrapped token contract if the token is not
     * native to this chain.
     * @param payload Encoded `TransferWithPayload` message
     * @return localAddress Address of the encoded (bytes32 format) token address on
     * this chain.
     */
    function fetchLocalAddressFromTransferMessage(bytes memory payload) public view returns (address localAddress) {
        // parse the source token address and chainId
        bytes32 sourceAddress = payload.toBytes32(33);
        uint16 tokenChain = payload.toUint16(65);

        // Fetch the wrapped address from the token bridge if the token
        // is not from this chain.
        if (tokenChain != chainId) {
            // identify wormhole token bridge wrapper
            localAddress = tokenBridge.wrappedAsset(tokenChain, sourceAddress);
            require(localAddress != address(0), "token not attested");
        } else {
            // return the encoded address if the token is native to this chain
            localAddress = bytes32ToAddress(sourceAddress);
        }
    }

    function custodyTokens(address token, uint256 amount) internal returns (uint256) {
        // query own token balance before transfer
        uint256 balanceBefore = getBalance(token);

        // deposit tokens
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, address(this), amount);

        // return the balance difference
        return getBalance(token) - balanceBefore;
    }

    function bytes32ToAddress(bytes32 address_) internal pure returns (address) {
        require(bytes12(address_) == 0, "invalid EVM address");
        return address(uint160(uint256(address_)));
    }

    // necessary for receiving native assets
    receive() external payable {}
}
