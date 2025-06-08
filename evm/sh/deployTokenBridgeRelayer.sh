#!/bin/bash

#
# This script deploys the TokenBridgeRelayer contract.
# Usage: RPC_URL= MNEMONIC= EVM_CHAIN_ID= TOKEN_BRIDGE= UNWRAP_WETH= EXECUTOR= ./sh/deployTokenBridgeRelayer.sh

[[ -z $TOKEN_BRIDGE ]] && { echo "Missing TOKEN_BRIDGE"; exit 1; }
[[ -z $UNWRAP_WETH ]] && { echo "Missing UNWRAP_WETH"; exit 1; }
[[ -z $EXECUTOR ]] && { echo "Missing EXECUTOR"; exit 1; }

if [ "${RPC_URL}X" == "X" ]; then
  RPC_URL=http://localhost:8545
fi

if [ "${MNEMONIC}X" == "X" ]; then
  MNEMONIC=0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d
fi

if [ "${EVM_CHAIN_ID}X" == "X" ]; then
  EVM_CHAIN_ID=1337
fi

forge script ./script/DeployTokenBridgeRelayer.s.sol:DeployTokenBridgeRelayer \
	--sig "run(address, bool, address)" $TOKEN_BRIDGE $UNWRAP_WETH $EXECUTOR \
	--rpc-url "$RPC_URL" \
	--private-key "$MNEMONIC" \
	--broadcast ${FORGE_ARGS}

returnInfo=$(cat ./broadcast/DeployTokenBridgeRelayer.s.sol/$EVM_CHAIN_ID/run-latest.json)

DEPLOYED_ADDRESS=$(jq -r '.returns.deployedAddress.value' <<< "$returnInfo")
echo "Deployed TokenBridgeRelayer address: $DEPLOYED_ADDRESS"
