// TODO: these functions belong in an sdk for the executor (where the types can be shared)
import { Chain, chainToChainId } from "@wormhole-foundation/sdk-base";
import axios from "axios";
export async function fetchQuote(
  url: string,
  srcChain: Chain,
  dstChain: Chain,
  relayInstructions: `0x${string}`,
): Promise<{ signedQuote: `0x${string}`; estimatedCost: bigint }> {
  const ret = await axios.post(`${url}/v0/quote`, {
    srcChain: chainToChainId(srcChain),
    dstChain: chainToChainId(dstChain),
    relayInstructions,
  });
  return {
    signedQuote: ret.data.signedQuote,
    estimatedCost: BigInt(ret.data.estimatedCost),
  };
}
