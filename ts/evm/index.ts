import { Chain, createPublicClient, createWalletClient, http } from "viem";
import { PrivateKeyAccount } from "viem/accounts";
import { abi } from "./abis/TokenBridgeRelayer.json";

async function transfer(
  account: PrivateKeyAccount,
  chain: Chain,
  rpc: string,
  address: `0x${string}`
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
    args: [],
  });
  const client = createWalletClient({
    account,
    chain,
    transport: http(rpc),
  });
  return await client.writeContract(request);
}
