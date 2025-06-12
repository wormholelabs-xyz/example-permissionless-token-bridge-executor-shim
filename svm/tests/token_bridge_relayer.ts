import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TokenBridgeRelayer } from "../target/types/token_bridge_relayer";
import { keccak256, toHex } from "viem";
import { assert, expect } from "chai";
import { BN } from "bn.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { serialize } from "binary-layout";
import { signedQuoteLayout } from "./signedQuote";

describe("token_bridge_relayer", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace
    .TokenBridgeRelayer as Program<TokenBridgeRelayer>;

  const env: string = "testnet";
  const wormholeProgram = new anchor.web3.PublicKey(
    env === "mainnet"
      ? "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth"
      : "3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5",
  );
  const tokenBridgeProgram = new anchor.web3.PublicKey(
    env === "mainnet"
      ? "wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb"
      : "DZnkkTmCiFWfYTfT41X3Rd1kDgozqzxWaHqsw6W4x2oe",
  );
  const tokenBridgeConfig = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    tokenBridgeProgram,
  )[0];
  const tokenBridgeEmitter = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("emitter")],
    tokenBridgeProgram,
  )[0];
  const getTokenBridgeCustody = (mint: anchor.web3.PublicKey) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [mint.toBuffer()],
      tokenBridgeProgram,
    )[0];

  it("Is initialized!", async () => {
    const recentSlot = (await program.provider.connection.getSlot()) - 1;
    const tx = await program.methods.initialize(new BN(recentSlot)).rpc();
    console.log("Your transaction signature", tx);
  });

  it("Returns execute instruction!", async () => {
    // https://wormholescan.io/#/tx/0x3b06d6ae92cf1cc6312df9412be81c4cf3c1a70dad4f42a8d524db2c2f53350f?network=Testnet&view=advanced
    const vaa = Buffer.from(
      "AQAAAAABAO8QSEQuF9qjEd5b1jfzw2U7RriEkFuA5/CeMMEi7nwmQK+GW/RS+/8SbQMl9i6iB07xp/i0e+Ps3cRif5PyNhoBZ6fepAAAAAAABgAAAAAAAAAAAAAAAGHkTlBspWWebAu6m2eFhvotcpdWAAAAAAAASnsBAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKBpuIV/6rgYT7aH9jRhjANdrEOdwa6ztVmKDwAAAAAAEAAfq1IUF37mqrWWu1nwOFOzFjvJQmSYsTI/5rVHHDSJFeAAEAAAAAAAAAAAAAAACZ0h3dM0dyNj77Y66ifWVpp0cUkYNxi37Ilhe3BAaF4BvcygMhQCKYDarpE0Dgw/hAwAXv",
      "base64",
    );
    const sigStart = 6;
    const numSigners = vaa[5];
    const sigLength = 66;
    const vaa_body = vaa.subarray(sigStart + sigLength * numSigners);
    const vaa_hash = keccak256(`0x${vaa_body.toString("hex")}`).substring(2);
    const mint = new anchor.web3.PublicKey(
      "So11111111111111111111111111111111111111112",
    );
    const lutPointerAddress = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("lut")],
      program.programId,
    )[0];
    const lutPointer = await program.account.lut.fetch(lutPointerAddress);
    const first_result = await program.methods
      .resolveExecuteVaaV1(vaa_body)
      .view();
    expect("missing" in first_result).to.be.true;
    expect(first_result.missing?.[0]?.accounts?.[0]?.toString()).to.eq(
      mint.toString(),
    );
    expect(first_result.missing?.[0]?.accounts?.[1]?.toString()).to.eq(
      lutPointerAddress.toString(),
    );
    const result = await program.methods
      .resolveExecuteVaaV1(vaa_body)
      .remainingAccounts([
        {
          pubkey: mint,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: lutPointerAddress,
          isSigner: false,
          isWritable: false,
        },
      ])
      .view();
    const payer = new anchor.web3.PublicKey(
      Buffer.from("payer_00000000000000000000000000"),
    ).toString();

    const expectedResult = {
      accounts: [
        {
          pubkey: payer,
          isWritable: true,
          isSigner: true,
        },
        {
          pubkey: anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("redeemer")],
            program.programId,
          )[0].toString(), // redeemer config
          isWritable: false,
          isSigner: false,
        },
        {
          pubkey: mint.toString(),
          isWritable: false,
          isSigner: false,
        },
        {
          pubkey: "5k8RqwaRTTjVmctNxQgCeK8gzYjcmjvzBc3qyaUr1fCm", // recipient_token_account
          isWritable: true,
          isSigner: false,
        },
        {
          pubkey: "9r6q2iEg4MBevjC8reaLmQUDxueF3vabUoqDkZ2LoAYe", // recipient
          isWritable: true,
          isSigner: false,
        },
        {
          pubkey: "CJhdEE6bczcuVeU1m36B54oTnQYbY38rYQ1UDFCM1iY6", // tmp_token_account
          isWritable: true,
          isSigner: false,
        },
        {
          pubkey: tokenBridgeConfig.toString(),
          isWritable: false,
          isSigner: false,
        },
        {
          // pubkey: anchor.web3.PublicKey.findProgramAddressSync(
          //   [Buffer.from("PostedVAA"), Buffer.from(vaa_hash, "hex")],
          //   wormholeProgram
          // )[0].toString(), // vaa
          pubkey: new anchor.web3.PublicKey(
            Buffer.from("posted_vaa_000000000000000000000"),
          ).toString(),
          isWritable: false,
          isSigner: false,
        },
        {
          pubkey: anchor.web3.PublicKey.findProgramAddressSync(
            [
              Buffer.from(
                "00000000000000000000000061e44e506ca5659e6c0bba9b678586fa2d729756",
                "hex",
              ),
              (() => {
                const buf = Buffer.alloc(2);
                buf.writeUInt16BE(6);
                return buf;
              })(),
              (() => {
                const buf = Buffer.alloc(8);
                buf.writeBigInt64BE(BigInt("19067"));
                return buf;
              })(),
            ],
            tokenBridgeProgram,
          )[0].toString(), // token_bridge_claim
          isWritable: true,
          isSigner: false,
        },
        {
          pubkey: anchor.web3.PublicKey.findProgramAddressSync(
            [
              (() => {
                const buf = Buffer.alloc(2);
                buf.writeUInt16BE(6);
                return buf;
              })(),
              Buffer.from(
                "00000000000000000000000061e44e506ca5659e6c0bba9b678586fa2d729756",
                "hex",
              ),
            ],
            tokenBridgeProgram,
          )[0].toString(), // token_bridge_foreign_endpoint
          isWritable: false,
          isSigner: false,
        },
        {
          pubkey: getTokenBridgeCustody(mint).toString(), // token_bridge_custody
          isWritable: true,
          isSigner: false,
        },
        {
          pubkey: anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("custody_signer")],
            tokenBridgeProgram,
          )[0].toString(), // token_bridge_custody_signer
          isWritable: false,
          isSigner: false,
        },
        {
          pubkey: wormholeProgram.toString(),
          isWritable: false,
          isSigner: false,
        },
        {
          pubkey: tokenBridgeProgram.toString(),
          isWritable: false,
          isSigner: false,
        },
        {
          pubkey: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // token
          isWritable: false,
          isSigner: false,
        },
        {
          pubkey: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", // associated token
          isWritable: false,
          isSigner: false,
        },
        {
          pubkey: "11111111111111111111111111111111", // system
          isWritable: false,
          isSigner: false,
        },
        {
          pubkey: "SysvarRent111111111111111111111111111111111", // rent
          isWritable: false,
          isSigner: false,
        },
      ],
      programId: "tbr7Qje6qBzPwfM52csL5KFi8ps5c5vDyiVVBLYVdRf",
      data: "8f51ed856cf1be9d" + vaa_hash,
    };
    const resolvedResult = result.resolved[0][0];
    expect(resolvedResult[0].addressLookupTables[0].toString()).to.equal(
      lutPointer.address.toString(),
    );
    const firstIx = resolvedResult[0].instructions[0];
    const accts = firstIx.accounts.map((a) => ({
      ...a,
      pubkey: a.pubkey.toString(),
    }));
    expect(accts).to.deep.equal(expectedResult.accounts);
    expect(firstIx.programId.toString()).to.equal(expectedResult.programId);
    expect(firstIx.data.toString("hex")).to.equal(expectedResult.data);
  });

  it("transfers SOL outbound", async () => {
    const mint = new anchor.web3.PublicKey(
      "So11111111111111111111111111111111111111112",
    );
    const payee = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("fee_collector")],
      wormholeProgram,
    )[0];
    const mockQuote = serialize(signedQuoteLayout, {
      quote: {
        baseFee: 0n,
        dstChain: 2,
        dstGasPrice: 100n,
        dstPrice: 100n,
        expiryTime: new Date("2200-01-01T00:00:00"),
        payeeAddress: toHex(payee.toBuffer()),
        prefix: "EQ01",
        quoterAddress: "0x0000000000000000000000000000000000000000",
        srcChain: 1,
        srcPrice: 100n,
      },
      signature:
        "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    });
    const message = new anchor.web3.Keypair();
    const ix = await program.methods
      .transferNativeTokensWithRelay({
        amount: new BN(10),
        dstExecutionAddress: [
          ...Buffer.from(
            "0000000000000000000000000000000000000000000000000000000000000000",
          ),
        ],
        dstTransferRecipient: [
          ...Buffer.from(
            "0000000000000000000000000000000000000000000000000000000000000000",
          ),
        ],
        execAmount: new BN(0),
        nonce: 0,
        recipientAddress: [
          ...Buffer.from(
            "0000000000000000000000000000000000000000000000000000000000000000",
          ),
        ],
        recipientChain: 2,
        relayInstructions: Buffer.from(""),
        signedQuoteBytes: Buffer.from(mockQuote),
        wrapNative: true,
      })
      .accountsPartial({
        mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenBridgeConfig,
        tokenBridgeCustody: getTokenBridgeCustody(mint),
        tokenBridgeAuthoritySigner:
          anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("authority_signer")],
            tokenBridgeProgram,
          )[0],
        tokenBridgeCustodySigner: anchor.web3.PublicKey.findProgramAddressSync(
          [Buffer.from("custody_signer")],
          tokenBridgeProgram,
        )[0],
        wormholeBridge: anchor.web3.PublicKey.findProgramAddressSync(
          [Buffer.from("Bridge")],
          wormholeProgram,
        )[0],
        tokenBridgeEmitter,
        tokenBridgeSequence: anchor.web3.PublicKey.findProgramAddressSync(
          [Buffer.from("Sequence"), tokenBridgeEmitter.toBytes()],
          wormholeProgram,
        )[0],
        wormholeFeeCollector: anchor.web3.PublicKey.findProgramAddressSync(
          [Buffer.from("fee_collector")],
          wormholeProgram,
        )[0],
        wormholeMessage: message.publicKey,
        payee: payee,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .instruction();
    // wait for lut to warm up
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const lutPointer = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("lut")],
      program.programId,
    )[0];
    const lutAddress = (await program.account.lut.fetch(lutPointer)).address;
    const lut =
      await program.provider.connection.getAddressLookupTable(lutAddress);
    if (!lut.value) {
      throw new Error("LUT was null, did you initialize?");
    }
    const { blockhash } =
      await program.provider.connection.getLatestBlockhash();
    const messageV0 = new anchor.web3.TransactionMessage({
      payerKey: program.provider.publicKey,
      instructions: [
        anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
          units: 1_000_000,
        }),
        ix,
      ],
      recentBlockhash: blockhash,
    }).compileToV0Message([lut.value]);
    const tx = new anchor.web3.VersionedTransaction(messageV0);
    tx.sign([program.provider.wallet.payer, message]);
    const hash = await program.provider.sendAndConfirm(tx);
    console.log(
      `submitted transfer legacy tx: http://explorer.solana.com/tx/${hash}?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899`,
    );
    // TODO: check the receipt and ensure the accurate token balances changed
  });
});
