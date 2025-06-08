// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.19;

import {TokenBridgeRelayer, tokenBridgeRelayerVersion} from "../src/token-bridge-relayer/TokenBridgeRelayer.sol";
import "forge-std/Script.sol";

// DeployTokenBridgeRelayer is a forge script to deploy the TokenBridgeRelayer contract. Use ./sh/deployTokenBridgeRelayer.sh to invoke this.
// e.g. anvil
// EVM_CHAIN_ID=31337 MNEMONIC=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 OUR_CHAIN_ID=2 ./sh/deployTokenBridgeRelayer.sh
// e.g. anvil --fork-url https://ethereum-rpc.publicnode.com
// EVM_CHAIN_ID=1 MNEMONIC=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 OUR_CHAIN_ID=2 ./sh/deployTokenBridgeRelayer.sh
contract DeployTokenBridgeRelayer is Script {
    function test() public {} // Exclude this from coverage report.

    function dryRun(address tokenBridge, bool unwrapWeth, address executor) public {
        _deploy(tokenBridge, unwrapWeth, executor);
    }

    function run(address tokenBridge, bool unwrapWeth, address executor) public returns (address deployedAddress) {
        vm.startBroadcast();
        (deployedAddress) = _deploy(tokenBridge, unwrapWeth, executor);
        vm.stopBroadcast();
    }

    function _deploy(address tokenBridge, bool unwrapWeth, address executor)
        internal
        returns (address deployedAddress)
    {
        bytes32 salt = keccak256(abi.encodePacked(tokenBridgeRelayerVersion));
        TokenBridgeRelayer tokenBridgeRelayer = new TokenBridgeRelayer{salt: salt}(tokenBridge, unwrapWeth, executor);

        return (address(tokenBridgeRelayer));
    }
}
