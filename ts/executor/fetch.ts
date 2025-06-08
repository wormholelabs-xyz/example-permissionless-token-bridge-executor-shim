// TODO: these functions belong in an sdk for the executor (where the types can be shared)
import { Chain, chainToChainId } from "@wormhole-foundation/sdk-base";
import axios from "axios";
export async function fetchQuote(
  url: string,
  srcChain: Chain,
  dstChain: Chain,
): Promise<`0x${string}`> {
  const ret = await axios.get(
    `${url}/v0/quote/${chainToChainId(srcChain)}/${chainToChainId(dstChain)}`,
  );
  return ret.data.signedQuote;
}
export async function fetchEstimate(
  url: string,
  quote: `0x${string}`,
  relayInstructions: `0x${string}`,
): Promise<bigint> {
  const ret = await axios.get(
    `${url}/v0/estimate/${quote}/${relayInstructions}/`,
  );
  return BigInt(ret.data.estimate);
}
