import type { CustomConversion, DeriveType, Layout } from "binary-layout";
import { fromBytes, fromHex } from "viem";

export const hexConversion = {
  to: (encoded: Uint8Array) => fromBytes(encoded, "hex"),
  from: (decoded: `0x${string}`) => fromHex(decoded, "bytes"),
} as const satisfies CustomConversion<Uint8Array, `0x${string}`>;
export const dateConversion = {
  to: (encoded: bigint) => new Date(Number(encoded * 1000n)),
  from: (decoded: Date) => BigInt(decoded.getTime()) / 1000n,
} as const satisfies CustomConversion<bigint, Date>;

export const quoteLayout = [
  {
    name: "quote",
    binary: "switch",
    idSize: 4,
    idTag: "prefix",
    layouts: [
      [
        [0x45513031, "EQ01"],
        [
          {
            name: "quoterAddress",
            binary: "bytes",
            size: 20,
            custom: hexConversion,
          },
          {
            name: "payeeAddress",
            binary: "bytes",
            size: 32,
            custom: hexConversion,
          },
          { name: "srcChain", binary: "uint", size: 2 },
          { name: "dstChain", binary: "uint", size: 2 },
          {
            name: "expiryTime",
            binary: "uint",
            size: 8,
            custom: dateConversion,
          },
          { name: "baseFee", binary: "uint", size: 8 },
          { name: "dstGasPrice", binary: "uint", size: 8 },
          { name: "srcPrice", binary: "uint", size: 8 },
          { name: "dstPrice", binary: "uint", size: 8 },
        ],
      ],
    ],
  },
] as const satisfies Layout;

export type Quote = DeriveType<typeof quoteLayout>;

export const signedQuoteLayout = [
  ...quoteLayout,
  { name: "signature", binary: "bytes", size: 65, custom: hexConversion },
] as const satisfies Layout;

export type SignedQuote = DeriveType<typeof signedQuoteLayout>;
