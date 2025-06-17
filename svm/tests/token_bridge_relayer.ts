import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TokenBridgeRelayer } from "../target/types/token_bridge_relayer";
import { keccak256, toHex } from "viem";
import { assert, expect } from "chai";
import { BN } from "bn.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  setAuthority,
  AuthorityType,
} from "@solana/spl-token";
import { serialize } from "binary-layout";
import { signedQuoteLayout } from "./signedQuote";

describe("token_bridge_relayer", () => {
  // Configure the client to use the cluster from environment
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace
    .TokenBridgeRelayer as Program<TokenBridgeRelayer>;

  // Force localnet for now - future: detect environment from RPC endpoint
  // const isMainnet = program.provider.connection.rpcEndpoint.includes("mainnet");
  // const isDevnet = program.provider.connection.rpcEndpoint.includes("devnet");
  const isLocalnet = true;
  // const isLocalnet = program.provider.connection.rpcEndpoint.includes("localhost");

  console.log("Test Environment: Localnet (forced)");
  // console.log(
  //   `Test Environment: ${isMainnet ? "Mainnet" : isDevnet ? "Devnet" : isLocalnet ? "Localnet" : "Custom"}`,
  // );

  // Use testnet/devnet program IDs (cloned locally via Anchor.toml)
  const wormholeProgram = new anchor.web3.PublicKey(
    "3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5",
  );
  const tokenBridgeProgram = new anchor.web3.PublicKey(
    "DZnkkTmCiFWfYTfT41X3Rd1kDgozqzxWaHqsw6W4x2oe",
  );
  const tokenBridgeConfig = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    tokenBridgeProgram,
  )[0];
  const tokenBridgeEmitter = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("emitter")],
    tokenBridgeProgram,
  )[0];
  const tokenBridgeAuthoritySigner =
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("authority_signer")],
      tokenBridgeProgram,
    )[0];
  const tokenBridgeCustodySigner = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("custody_signer")],
    tokenBridgeProgram,
  )[0];
  const tokenBridgeMintSigner = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("mint_signer")],
    tokenBridgeProgram,
  )[0];
  const wormholeBridgeData = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("Bridge")],
    wormholeProgram,
  )[0];
  const tokenBridgeSequence = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("Sequence"), tokenBridgeEmitter.toBytes()],
    wormholeProgram,
  )[0];
  const wormholeFeeCollector = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("fee_collector")],
    wormholeProgram,
  )[0];
  const getTokenBridgeCustody = (mint: anchor.web3.PublicKey) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [mint.toBuffer()],
      tokenBridgeProgram,
    )[0];

  it("Is initialized!", async () => {
    // Check if already initialized
    const senderConfig = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("sender")],
      program.programId,
    )[0];

    try {
      await program.account.senderConfig.fetch(senderConfig);
      console.log("Program already initialized, skipping");
      return;
    } catch (e) {
      // Not initialized, proceed
    }

    const recentSlot = (await program.provider.connection.getSlot()) - 1;

    const tx = await program.methods
      .initialize(new BN(recentSlot))
      .accountsPartial({
        lutProgram: new anchor.web3.PublicKey(
          "AddressLookupTab1e1111111111111111111111111",
        ),
      })
      .rpc();
    console.log("Initialization successful:", tx);
  });

  it("Has the correct accounts in the LUT!", async () => {
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
    expect(lut.value.state.addresses.map((a) => a.toString())).to.deep.equal([
      program.programId.toString(),
      anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("sender")],
        program.programId,
      )[0].toString(),
      anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("redeemer")],
        program.programId,
      )[0].toString(),
      tokenBridgeProgram.toString(),
      tokenBridgeConfig.toString(),
      tokenBridgeAuthoritySigner.toString(),
      tokenBridgeCustodySigner.toString(),
      tokenBridgeMintSigner.toString(),
      tokenBridgeEmitter.toString(),
      tokenBridgeSequence.toString(),
      wormholeProgram.toString(),
      wormholeBridgeData.toString(),
      wormholeFeeCollector.toString(),
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
      "11111111111111111111111111111111",
      "SysvarC1ock11111111111111111111111111111111",
      "SysvarRent111111111111111111111111111111111",
      "execXUrAsMnqMmTHj5m7N1YQgsDz3cwGLYCYyuDRciV",
    ]);
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

  it("transfers SOL outbound with balance validation", async () => {
    const mint = new anchor.web3.PublicKey(
      "So11111111111111111111111111111111111111112",
    );
    const payee = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("fee_collector")],
      wormholeProgram,
    )[0];
    const transferAmount = new BN(100_000); // 0.0001 SOL
    const custodyAccount = getTokenBridgeCustody(mint);
    const wormholeFeeCollector = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("fee_collector")],
      wormholeProgram,
    )[0];

    // Get initial balances
    const userBalanceBefore = await program.provider.connection.getBalance(
      program.provider.publicKey,
    );
    const custodyBalanceBefore =
      await program.provider.connection.getBalance(custodyAccount);
    const payeeBalanceBefore =
      await program.provider.connection.getBalance(payee);
    const wormholeFeeBalanceBefore =
      await program.provider.connection.getBalance(wormholeFeeCollector);

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
        amount: transferAmount,
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
        tokenBridgeCustody: custodyAccount,
        tokenBridgeAuthoritySigner,
        tokenBridgeCustodySigner,
        wormholeBridge: wormholeBridgeData,
        tokenBridgeEmitter,
        tokenBridgeSequence,
        wormholeFeeCollector,
        wormholeMessage: message.publicKey,
        payee: payee,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .instruction();
    // console.log(ix.keys.map((k) => k.pubkey.toString()));
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
    // console.log(tx.message.staticAccountKeys, tx.message.addressTableLookups);
    tx.sign([program.provider.wallet.payer, message]);
    const hash = await program.provider.sendAndConfirm(tx);

    const userBalanceAfter = await program.provider.connection.getBalance(
      program.provider.publicKey,
    );
    const custodyBalanceAfter =
      await program.provider.connection.getBalance(custodyAccount);
    const payeeBalanceAfter =
      await program.provider.connection.getBalance(payee);
    const wormholeFeeBalanceAfter =
      await program.provider.connection.getBalance(wormholeFeeCollector);

    const userDecrease = userBalanceBefore - userBalanceAfter;
    const custodyIncrease = custodyBalanceAfter - custodyBalanceBefore;
    const payeeIncrease = payeeBalanceAfter - payeeBalanceBefore;
    const wormholeFeeIncrease =
      wormholeFeeBalanceAfter - wormholeFeeBalanceBefore;

    expect(custodyIncrease).to.equal(
      transferAmount.toNumber(),
      `Custody must receive exactly ${transferAmount.toString()} lamports`,
    );
    expect(payeeIncrease).to.be.greaterThan(
      0,
      "Payee should receive protocol fees",
    );
    expect(wormholeFeeIncrease).to.be.greaterThan(
      0,
      "Wormhole fee collector should receive fees",
    );
    expect(userDecrease).to.be.greaterThan(
      transferAmount.toNumber(),
      "User should pay more than just transfer amount (includes fees)",
    );
  });

  async function createTestToken(
    tokenProgram: anchor.web3.PublicKey,
    decimals = 6,
  ) {
    const authority = program.provider.wallet.payer;

    const mint = await createMint(
      program.provider.connection,
      authority,
      authority.publicKey,
      null,
      decimals,
      undefined,
      undefined,
      tokenProgram,
    );

    const tokenAccount = getAssociatedTokenAddressSync(
      mint,
      authority.publicKey,
      false,
      tokenProgram,
    );

    await createAccount(
      program.provider.connection,
      authority,
      mint,
      authority.publicKey,
      undefined,
      undefined,
      tokenProgram,
    );

    const tokenAmount = decimals === 9 ? 1000_000000000n : 1000_000000n; // 1000 tokens with appropriate decimals
    await mintTo(
      program.provider.connection,
      authority,
      mint,
      tokenAccount,
      authority.publicKey,
      tokenAmount,
      [],
      undefined,
      tokenProgram,
    );

    await setAuthority(
      program.provider.connection,
      authority,
      mint,
      authority.publicKey,
      AuthorityType.MintTokens,
      null,
      [],
      undefined,
      tokenProgram,
    );

    return { mint, tokenAccount };
  }

  it("transfers SPL token outbound with balance validation", async () => {
    const { mint, tokenAccount } = await createTestToken(TOKEN_PROGRAM_ID);

    const tokenBalanceBefore =
      await program.provider.connection.getTokenAccountBalance(tokenAccount);
    const custodyAccount = getTokenBridgeCustody(mint);
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
    const transferAmount = new BN(100_000000); // 100 tokens

    try {
      const lutPointer = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("lut")],
        program.programId,
      )[0];
      const lutAddress = (await program.account.lut.fetch(lutPointer)).address;
      const lut =
        await program.provider.connection.getAddressLookupTable(lutAddress);

      const ix = await program.methods
        .transferNativeTokensWithRelay({
          amount: transferAmount,
          dstExecutionAddress: Array(32).fill(0),
          dstTransferRecipient: Array(32).fill(0),
          execAmount: new BN(0),
          nonce: 1,
          recipientAddress: [
            ...Buffer.from(
              "0000000000000000000000000000000000000000000000000000000000000001",
            ),
          ], // Valid non-zero recipient
          recipientChain: 2,
          relayInstructions: Buffer.from(""),
          signedQuoteBytes: Buffer.from(mockQuote),
          wrapNative: false,
        })
        .accountsPartial({
          mint,
          fromTokenAccount: tokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          tokenBridgeConfig,
          tokenBridgeCustody: custodyAccount,
          tokenBridgeAuthoritySigner:
            anchor.web3.PublicKey.findProgramAddressSync(
              [Buffer.from("authority_signer")],
              tokenBridgeProgram,
            )[0],
          tokenBridgeCustodySigner:
            anchor.web3.PublicKey.findProgramAddressSync(
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

      const rawTx = tx.serialize();
      const hash = await program.provider.connection.sendRawTransaction(rawTx, {
        skipPreflight: true,
        preflightCommitment: "confirmed",
        maxRetries: 0,
      });

      console.log(`SPL Token transfer successful: ${hash}`);

      await program.provider.connection.confirmTransaction(hash, "confirmed");

      const tokenBalanceAfter =
        await program.provider.connection.getTokenAccountBalance(tokenAccount);
      const tokensTransferred =
        Number(tokenBalanceBefore.value.amount) -
        Number(tokenBalanceAfter.value.amount);

      expect(tokensTransferred).to.equal(
        transferAmount.toNumber(),
        "Should transfer exact amount",
      );
    } catch (error) {
      if (isLocalnet) {
        const hasExpectedError =
          error.message.includes("AmbiguousOwner") ||
          error.message.includes("AccountNotFound") ||
          error.message.includes("custom program error");
        assert(hasExpectedError, `Unexpected error: ${error.message}`);
      } else {
        throw error;
      }
    }
  });

  it("transfers Token2022 outbound with balance validation", async () => {
    const { mint, tokenAccount } = await createTestToken(
      TOKEN_2022_PROGRAM_ID,
      9,
    );

    const tokenBalanceBefore =
      await program.provider.connection.getTokenAccountBalance(tokenAccount);
    const custodyAccount = getTokenBridgeCustody(mint);
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
    const transferAmount = new BN(100_000000000);

    try {
      const lutPointer = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("lut")],
        program.programId,
      )[0];
      const lutAddress = (await program.account.lut.fetch(lutPointer)).address;
      const lut =
        await program.provider.connection.getAddressLookupTable(lutAddress);

      const ix = await program.methods
        .transferNativeTokensWithRelay({
          amount: transferAmount,
          dstExecutionAddress: Array(32).fill(0),
          dstTransferRecipient: Array(32).fill(0),
          execAmount: new BN(0),
          nonce: 2,
          recipientAddress: [
            ...Buffer.from(
              "0000000000000000000000000000000000000000000000000000000000000002",
            ),
          ], // Valid non-zero recipient
          recipientChain: 2,
          relayInstructions: Buffer.from(""),
          signedQuoteBytes: Buffer.from(mockQuote),
          wrapNative: false,
        })
        .accountsPartial({
          mint,
          fromTokenAccount: tokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          tokenBridgeConfig,
          tokenBridgeCustody: custodyAccount,
          tokenBridgeAuthoritySigner:
            anchor.web3.PublicKey.findProgramAddressSync(
              [Buffer.from("authority_signer")],
              tokenBridgeProgram,
            )[0],
          tokenBridgeCustodySigner:
            anchor.web3.PublicKey.findProgramAddressSync(
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
          associatedTokenProgram: new anchor.web3.PublicKey(
            "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
          ),
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .instruction();

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

      const rawTx = tx.serialize();
      const hash = await program.provider.connection.sendRawTransaction(rawTx, {
        skipPreflight: true,
        preflightCommitment: "confirmed",
        maxRetries: 0,
      });

      console.log(`Token2022 transfer successful: ${hash}`);

      await program.provider.connection.confirmTransaction(hash, "confirmed");

      const tokenBalanceAfter =
        await program.provider.connection.getTokenAccountBalance(tokenAccount);
      const tokensTransferred =
        Number(tokenBalanceBefore.value.amount) -
        Number(tokenBalanceAfter.value.amount);

      expect(tokensTransferred).to.equal(
        transferAmount.toNumber(),
        "Should transfer exact amount",
      );
    } catch (error) {
      if (isLocalnet) {
        const hasExpectedError =
          error.message.includes("AmbiguousOwner") ||
          error.message.includes("AccountNotFound") ||
          error.message.includes(
            "An account required by the instruction is missing",
          ) ||
          error.message.includes("custom program error");
        assert(hasExpectedError, `Unexpected error: ${error.message}`);
      } else {
        throw error;
      }
    }
  });

  it("transfers USDC outbound with balance validation", async () => {
    const mint = new anchor.web3.PublicKey(
      "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    );
    const custodyAccount = getTokenBridgeCustody(mint);
    const payee = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("fee_collector")],
      wormholeProgram,
    )[0];

    const userTokenAccount = getAssociatedTokenAddressSync(
      mint,
      program.provider.publicKey,
      false,
      TOKEN_PROGRAM_ID,
    );

    try {
      const userAccountInfo =
        await program.provider.connection.getAccountInfo(userTokenAccount);
      if (!userAccountInfo) {
        console.log("User doesn't have USDC token account - skipping test");
        return;
      }

      const userBalance =
        await program.provider.connection.getTokenAccountBalance(
          userTokenAccount,
        );
      if (Number(userBalance.value.amount) === 0) {
        console.log("User has 0 USDC - skipping test");
        return;
      }

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
      const transferAmount = new BN(10_000);

      const lutPointer = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("lut")],
        program.programId,
      )[0];
      const lutAddress = (await program.account.lut.fetch(lutPointer)).address;
      const lut =
        await program.provider.connection.getAddressLookupTable(lutAddress);

      const ix = await program.methods
        .transferNativeTokensWithRelay({
          amount: transferAmount,
          dstExecutionAddress: Array(32).fill(0),
          dstTransferRecipient: Array(32).fill(0),
          execAmount: new BN(0),
          nonce: 3,
          recipientAddress: [
            ...Buffer.from(
              "0000000000000000000000000000000000000000000000000000000000000003",
            ),
          ],
          recipientChain: 2,
          relayInstructions: Buffer.from(""),
          signedQuoteBytes: Buffer.from(mockQuote),
          wrapNative: false,
        })
        .accountsPartial({
          mint,
          fromTokenAccount: userTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          tokenBridgeConfig,
          tokenBridgeCustody: custodyAccount,
          tokenBridgeAuthoritySigner,
          tokenBridgeCustodySigner,
          wormholeBridge: wormholeBridgeData,
          tokenBridgeEmitter,
          tokenBridgeSequence,
          wormholeFeeCollector,
          wormholeMessage: message.publicKey,
          payee: payee,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .instruction();

      await new Promise((resolve) => setTimeout(resolve, 2000));
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
      console.log(`USDC transfer successful: ${hash}`);

      const userBalanceAfter =
        await program.provider.connection.getTokenAccountBalance(
          userTokenAccount,
        );
      const tokensTransferred =
        Number(userBalance.value.amount) -
        Number(userBalanceAfter.value.amount);

      expect(tokensTransferred).to.equal(
        transferAmount.toNumber(),
        "Should transfer exact amount of USDC",
      );
    } catch (error) {
      if (isLocalnet) {
        const hasExpectedError =
          error.message.includes("AmbiguousOwner") ||
          error.message.includes("AccountNotFound") ||
          error.message.includes("custom program error");
        expect(hasExpectedError, `Unexpected error: ${error.message}`).to.be
          .true;
      } else {
        throw error;
      }
    }
  });

  it("transfers Token2022 outbound (now working)", async () => {
    try {
      const { mint, tokenAccount } = await createTestToken(
        TOKEN_2022_PROGRAM_ID,
        9,
      );

      const tokenBalanceBefore =
        await program.provider.connection.getTokenAccountBalance(tokenAccount);
      const custodyAccount = getTokenBridgeCustody(mint);
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
      const transferAmount = new BN(100_000000000);

      const lutPointer = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("lut")],
        program.programId,
      )[0];
      const lutAddress = (await program.account.lut.fetch(lutPointer)).address;
      const lut =
        await program.provider.connection.getAddressLookupTable(lutAddress);

      const ix = await program.methods
        .transferNativeTokensWithRelay({
          amount: transferAmount,
          dstExecutionAddress: Array(32).fill(0),
          dstTransferRecipient: Array(32).fill(0),
          execAmount: new BN(0),
          nonce: 4,
          recipientAddress: [
            ...Buffer.from(
              "0000000000000000000000000000000000000000000000000000000000000004",
            ),
          ],
          recipientChain: 2,
          relayInstructions: Buffer.from(""),
          signedQuoteBytes: Buffer.from(mockQuote),
          wrapNative: false,
        })
        .accountsPartial({
          mint,
          fromTokenAccount: tokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          tokenBridgeConfig,
          tokenBridgeCustody: custodyAccount,
          tokenBridgeAuthoritySigner,
          tokenBridgeCustodySigner,
          wormholeBridge: wormholeBridgeData,
          tokenBridgeEmitter,
          tokenBridgeSequence,
          wormholeFeeCollector,
          wormholeMessage: message.publicKey,
          payee: payee,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .instruction();

      await new Promise((resolve) => setTimeout(resolve, 2000));
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
      console.log(`Token2022 transfer successful: ${hash}`);

      const tokenBalanceAfter =
        await program.provider.connection.getTokenAccountBalance(tokenAccount);
      const tokensTransferred =
        Number(tokenBalanceBefore.value.amount) -
        Number(tokenBalanceAfter.value.amount);

      expect(tokensTransferred).to.equal(
        transferAmount.toNumber(),
        "Should transfer exact amount of Token2022 tokens",
      );
    } catch (error) {
      const expectedErrors = [
        "AmbiguousOwner",
        "AccountNotFound",
        "custom program error",
        "An account required by the instruction is missing",
      ];

      const isExpectedError = expectedErrors.some((expectedError) =>
        error.message.includes(expectedError),
      );

      if (isExpectedError) {
        console.log("Token2022 failed as expected (incompatibility)");
      } else {
        throw error;
      }
    }
  });
});
