import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TokenBridgeRelayer } from "../target/types/token_bridge_relayer";
import { keccak256 } from "viem";
import { assert, expect } from "chai";

describe("token_bridge_relayer", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace
    .TokenBridgeRelayer as Program<TokenBridgeRelayer>;

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initialize().rpc();
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
    const result = await program.methods.resolveExecuteVaaV1(vaa_body).view();
    const payer = new anchor.web3.PublicKey(
      Buffer.from("payer_00000000000000000000000000"),
    ).toString();
    const mint = new anchor.web3.PublicKey(
      "So11111111111111111111111111111111111111112",
    );
    const env: string = "mainnet";
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
    const expectedResult = {
      accounts: [
        {
          pubkey: payer,
          isWritable: true,
          isSigner: true,
        },
        {
          pubkey: "HPHaVtBHhXAdP1WH9PUV9Adv5M4YxuJSqeXwGzFiovty", // config
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
          pubkey: "2yd7rzAYqovi2pYfwzMzB7JMh9t78y8xeKJHE8PvwPxZ", // tmp_token_account
          isWritable: true,
          isSigner: false,
        },
        {
          pubkey: anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("config")],
            tokenBridgeProgram,
          )[0].toString(), // token_bridge_config
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
          pubkey: anchor.web3.PublicKey.findProgramAddressSync(
            [mint.toBuffer()],
            tokenBridgeProgram,
          )[0].toString(), // token_bridge_custody
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
          pubkey: "11111111111111111111111111111111", // system
          isWritable: false,
          isSigner: false,
        },
        {
          pubkey: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // token
          isWritable: false,
          isSigner: false,
        },
        {
          pubkey: "SysvarRent111111111111111111111111111111111", // rent
          isWritable: false,
          isSigner: false,
        },
      ],
      programId: "Hsf7mQAy6eSYbqGYqkeTx8smMGF4m6Nn6viGoh9wxiah",
      data: "8f51ed856cf1be9d" + vaa_hash,
    };
    const resolvedResult = result.resolved[0][0];
    const firstIx = resolvedResult[0].instructions[0];
    const accts = firstIx.accounts.map((a) => ({
      ...a,
      pubkey: a.pubkey.toString(),
    }));
    expect(accts).to.deep.equal(expectedResult.accounts);
    expect(firstIx.programId.toString()).to.equal(expectedResult.programId);
    expect(firstIx.data.toString("hex")).to.equal(expectedResult.data);
  });
});
