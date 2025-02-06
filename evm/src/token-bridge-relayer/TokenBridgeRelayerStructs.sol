// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.17;

abstract contract TokenBridgeRelayerStructs {
    struct TransferWithRelay {
        bytes32 targetRecipient;
    }

    struct InternalTransferParams {
        address token;
        uint8 tokenDecimals;
        uint256 amount;
        uint16 targetChain;
        bytes32 targetRecipient;
        uint32 nonce;
        uint256 wormholeFee;
        bytes32 dstTransferRecipient;
        bytes32 dstExecutionAddress;
        uint256 executionAmount;
        address refundAddr;
    }
}
