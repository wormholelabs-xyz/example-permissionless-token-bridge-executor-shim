// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.17;

import "../libraries/BytesLib.sol";

import "./TokenBridgeRelayerStructs.sol";

abstract contract TokenBridgeRelayerMessages is TokenBridgeRelayerStructs {
    using BytesLib for bytes;

    /**
     * @notice Encodes the TransferWithRelay struct into bytes.
     * @param transfer TransferWithRelay struct.
     * @return encoded TransferWithRelay struct encoded into bytes.
     */
    function encodeTransferWithRelay(TransferWithRelay memory transfer) public pure returns (bytes memory encoded) {
        encoded = abi.encodePacked(transfer.targetRecipient);
    }

    /**
     * @notice Decodes an encoded `TransferWithRelay` struct.
     * @dev reverts if:
     * - the length of the payload has an unexpected length
     * @param encoded Encoded `TransferWithRelay` struct.
     * @return transfer `TransferTokenRelay` struct.
     */
    function decodeTransferWithRelay(bytes memory encoded) public pure returns (TransferWithRelay memory transfer) {
        uint256 index = 0;

        // recipient of the transferred tokens and native assets
        transfer.targetRecipient = encoded.toBytes32(index);
        index += 32;

        require(index == encoded.length, "invalid message length");
    }
}
