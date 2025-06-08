import { Chain, createPublicClient, createWalletClient, http } from "viem";
import { PrivateKeyAccount } from "viem/accounts";
import { abi } from "./abis/TokenBridgeRelayer.json";

export async function approve(
  account: PrivateKeyAccount,
  chain: Chain,
  rpc: string,
  address: `0x${string}`,
  token: `0x${string}`,
  amount: bigint,
) {
  const publicClient = createPublicClient({
    chain,
    transport: http(rpc),
  });
  const { request } = await publicClient.simulateContract({
    account,
    address: token,
    abi: [
      {
        inputs: [
          {
            internalType: "address",
            name: "guy",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "wad",
            type: "uint256",
          },
        ],
        name: "approve",
        outputs: [
          {
            internalType: "bool",
            name: "",
            type: "bool",
          },
        ],
        stateMutability: "nonpayable",
        type: "function",
      },
    ],
    functionName: "approve",
    args: [address, amount],
  });
  const client = createWalletClient({
    account,
    chain,
    transport: http(rpc),
  });
  return await client.writeContract(request);
}

export async function waitForTransactionReceipt(
  chain: Chain,
  rpc: string,
  hash: `0x${string}`,
) {
  const publicClient = createPublicClient({
    chain,
    transport: http(rpc),
  });
  return publicClient.waitForTransactionReceipt({ hash });
}

export async function transfer(
  account: PrivateKeyAccount,
  chain: Chain,
  rpc: string,
  address: `0x${string}`,
  token: `0x${string}`,
  amount: bigint,
  targetChain: number,
  targetRecipient: `0x${string}`,
  nonce: number,
  dstTransferRecipient: `0x${string}`,
  dstExecutionAddress: `0x${string}`,
  executionAmount: bigint,
  signedQuoteBytes: `0x${string}`,
  relayInstructions: `0x${string}`,
) {
  const publicClient = createPublicClient({
    chain,
    transport: http(rpc),
  });
  const { request } = await publicClient.simulateContract({
    account,
    address,
    abi,
    functionName: "transferTokensWithRelay",
    args: [
      token,
      amount,
      targetChain,
      targetRecipient,
      nonce,
      dstTransferRecipient,
      dstExecutionAddress,
      executionAmount,
      account.address,
      signedQuoteBytes,
      relayInstructions,
    ],
    value: executionAmount, // + wormhole fee
  });
  const client = createWalletClient({
    account,
    chain,
    transport: http(rpc),
  });
  return await client.writeContract(request);
}
