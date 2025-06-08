/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/token_bridge_relayer.json`.
 */
export type TokenBridgeRelayer = {
  address: "tbr7Qje6qBzPwfM52csL5KFi8ps5c5vDyiVVBLYVdRf";
  metadata: {
    name: "tokenBridgeRelayer";
    version: "0.4.0";
    spec: "0.1.0";
    description: "Created with Anchor";
  };
  instructions: [
    {
      name: "completeNativeTransferWithRelay";
      docs: [
        "This instruction is used to redeem token transfers from foreign emitters.",
        "It takes custody of the released native tokens and sends the tokens to the",
        "encoded `recipient`.  If the token being transferred is WSOL, the contract",
        "will unwrap the WSOL and send the lamports to the recipient.",
        "",
        "# Arguments",
        "",
        "* `ctx` - `CompleteNativeWithRelay` context",
        "* `vaa_hash` - Hash of the VAA that triggered the transfer",
      ];
      discriminator: [143, 81, 237, 133, 108, 241, 190, 157];
      accounts: [
        {
          name: "payer";
          docs: [
            "Payer will pay Wormhole fee to transfer tokens and create temporary",
            "token account.",
          ];
          writable: true;
          signer: true;
        },
        {
          name: "config";
          docs: [
            "Redeemer Config account. Acts as the Token Bridge redeemer, which signs",
            "for the complete transfer instruction. Read-only.",
          ];
          pda: {
            seeds: [
              {
                kind: "const";
                value: [114, 101, 100, 101, 101, 109, 101, 114];
              },
            ];
          };
        },
        {
          name: "mint";
          docs: [
            "Mint info. This is the SPL token that will be bridged over from the",
            "foreign contract. This must match the token address specified in the",
            "signed Wormhole message. Read-only.",
          ];
        },
        {
          name: "recipientTokenAccount";
          docs: [
            "Recipient associated token account. The recipient authority check",
            "is necessary to ensure that the recipient is the intended recipient",
            "of the bridged tokens. Mutable.",
          ];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "recipient";
              },
              {
                kind: "const";
                value: [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169,
                ];
              },
              {
                kind: "account";
                path: "mint";
              },
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: "recipient";
          docs: [
            "transaction. This instruction verifies that the recipient key",
            "passed in this context matches the intended recipient in the vaa.",
          ];
          writable: true;
        },
        {
          name: "tmpTokenAccount";
          docs: [
            "Program's temporary token account. This account is created before the",
            "instruction is invoked to temporarily take custody of the payer's",
            "tokens. When the tokens are finally bridged in, the tokens will be",
            "transferred to the destination token accounts. This account will have",
            "zero balance and can be closed.",
          ];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [116, 109, 112];
              },
              {
                kind: "account";
                path: "mint";
              },
            ];
          };
        },
        {
          name: "tokenBridgeConfig";
        },
        {
          name: "vaa";
          docs: [
            "Verified Wormhole message account. The Wormhole program verified",
            "signatures and posted the account data here. Read-only.",
          ];
          pda: {
            seeds: [
              {
                kind: "const";
                value: [80, 111, 115, 116, 101, 100, 86, 65, 65];
              },
              {
                kind: "arg";
                path: "vaaHash";
              },
            ];
            program: {
              kind: "account";
              path: "wormholeProgram";
            };
          };
        },
        {
          name: "tokenBridgeClaim";
          docs: [
            "is true if the bridged assets have been claimed. If the transfer has",
            "not been redeemed, this account will not exist yet.",
            "",
            "NOTE: The Token Bridge program's claim account is only initialized when",
            "a transfer is redeemed (and the boolean value `true` is written as",
            "its data).",
            "",
            "The Token Bridge program will automatically fail if this transfer",
            "is redeemed again. But we choose to short-circuit the failure as the",
            "first evaluation of this instruction.",
          ];
          writable: true;
        },
        {
          name: "tokenBridgeForeignEndpoint";
          docs: [
            "endpoint per chain, but the PDA allows for multiple endpoints for each",
            "chain! We store the proper endpoint for the emitter chain.",
          ];
        },
        {
          name: "tokenBridgeCustody";
          docs: ["account that holds this mint's balance."];
          writable: true;
        },
        {
          name: "tokenBridgeCustodySigner";
        },
        {
          name: "wormholeProgram";
          address: "3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5";
        },
        {
          name: "tokenBridgeProgram";
          address: "DZnkkTmCiFWfYTfT41X3Rd1kDgozqzxWaHqsw6W4x2oe";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
        {
          name: "tokenProgram";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
        {
          name: "rent";
        },
      ];
      args: [
        {
          name: "vaaHash";
          type: {
            array: ["u8", 32];
          };
        },
      ];
    },
    {
      name: "completeWrappedTransferWithRelay";
      docs: [
        "This instruction is used to redeem token transfers from foreign emitters.",
        "It takes custody of the minted wrapped tokens and sends the tokens to the",
        "encoded `recipient`.",
        "",
        "# Arguments",
        "",
        "* `ctx` - `CompleteWrappedWithRelay` context",
        "* `vaa_hash` - Hash of the VAA that triggered the transfer",
      ];
      discriminator: [174, 44, 4, 91, 81, 201, 235, 255];
      accounts: [
        {
          name: "payer";
          docs: [
            "Payer will pay Wormhole fee to transfer tokens and create temporary",
            "token account.",
          ];
          writable: true;
          signer: true;
        },
        {
          name: "config";
          docs: [
            "Redeemer Config account. Acts as the Token Bridge redeemer, which signs",
            "for the complete transfer instruction. Read-only.",
          ];
          pda: {
            seeds: [
              {
                kind: "const";
                value: [114, 101, 100, 101, 101, 109, 101, 114];
              },
            ];
          };
        },
        {
          name: "tokenBridgeWrappedMint";
          docs: [
            "Token Bridge wrapped mint info. This is the SPL token that will be",
            "bridged from the foreign contract. The wrapped mint PDA must agree",
            "with the native token's metadata in the wormhole message. Mutable.",
          ];
          writable: true;
        },
        {
          name: "recipientTokenAccount";
          docs: [
            "Recipient associated token account. The recipient authority check",
            "is necessary to ensure that the recipient is the intended recipient",
            "of the bridged tokens. Mutable.",
          ];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "recipient";
              },
              {
                kind: "const";
                value: [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169,
                ];
              },
              {
                kind: "account";
                path: "tokenBridgeWrappedMint";
              },
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: "recipient";
          docs: [
            "transaction. This instruction verifies that the recipient key",
            "passed in this context matches the intended recipient in the vaa.",
          ];
          writable: true;
        },
        {
          name: "tmpTokenAccount";
          docs: [
            "Program's temporary token account. This account is created before the",
            "instruction is invoked to temporarily take custody of the payer's",
            "tokens. When the tokens are finally bridged in, the tokens will be",
            "transferred to the destination token accounts. This account will have",
            "zero balance and can be closed.",
          ];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [116, 109, 112];
              },
              {
                kind: "account";
                path: "tokenBridgeWrappedMint";
              },
            ];
          };
        },
        {
          name: "tokenBridgeWrappedMeta";
          docs: [
            "about the token from its native chain:",
            "* Wormhole Chain ID",
            "* Token's native contract address",
            "* Token's native decimals",
          ];
        },
        {
          name: "tokenBridgeConfig";
        },
        {
          name: "vaa";
          docs: [
            "Verified Wormhole message account. The Wormhole program verified",
            "signatures and posted the account data here. Read-only.",
          ];
          pda: {
            seeds: [
              {
                kind: "const";
                value: [80, 111, 115, 116, 101, 100, 86, 65, 65];
              },
              {
                kind: "arg";
                path: "vaaHash";
              },
            ];
            program: {
              kind: "account";
              path: "wormholeProgram";
            };
          };
        },
        {
          name: "tokenBridgeClaim";
          docs: [
            "is true if the bridged assets have been claimed. If the transfer has",
            "not been redeemed, this account will not exist yet.",
            "",
            "NOTE: The Token Bridge program's claim account is only initialized when",
            "a transfer is redeemed (and the boolean value `true` is written as",
            "its data).",
            "",
            "The Token Bridge program will automatically fail if this transfer",
            "is redeemed again. But we choose to short-circuit the failure as the",
            "first evaluation of this instruction.",
          ];
          writable: true;
        },
        {
          name: "tokenBridgeForeignEndpoint";
          docs: [
            "endpoint per chain, but the PDA allows for multiple endpoints for each",
            "chain! We store the proper endpoint for the emitter chain.",
          ];
        },
        {
          name: "tokenBridgeMintAuthority";
        },
        {
          name: "wormholeProgram";
          address: "3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5";
        },
        {
          name: "tokenBridgeProgram";
          address: "DZnkkTmCiFWfYTfT41X3Rd1kDgozqzxWaHqsw6W4x2oe";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
        {
          name: "tokenProgram";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
        {
          name: "rent";
        },
      ];
      args: [
        {
          name: "vaaHash";
          type: {
            array: ["u8", 32];
          };
        },
      ];
    },
    {
      name: "initialize";
      docs: [
        "Permissionlessly initializes the sender config PDA. This avoids having to re-derive the bump in later instructions.",
      ];
      discriminator: [175, 175, 109, 31, 13, 152, 155, 237];
      accounts: [
        {
          name: "payer";
          writable: true;
          signer: true;
        },
        {
          name: "senderConfig";
          docs: [
            "Sender Config account, which saves program data useful for other",
            "instructions, specifically for outbound transfers.",
          ];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [115, 101, 110, 100, 101, 114];
              },
            ];
          };
        },
        {
          name: "redeemerConfig";
          docs: [
            "Redeemer Config account, which saves program data useful for other",
            "instructions, specifically for inbound transfers.",
          ];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [114, 101, 100, 101, 101, 109, 101, 114];
              },
            ];
          };
        },
        {
          name: "systemProgram";
          docs: ["System program."];
          address: "11111111111111111111111111111111";
        },
      ];
      args: [];
    },
    {
      name: "resolveExecuteVaaV1";
      docs: [
        "This instruction returns the instruction for execution based on a v1 VAA",
        "# Arguments",
        "",
        "* `ctx` - `ResolveExecuteVaaV1` context",
        "* `vaa_body` - Body of the VAA for execution",
      ];
      discriminator: [148, 184, 169, 222, 207, 8, 154, 127];
      accounts: [];
      args: [
        {
          name: "vaaBody";
          type: "bytes";
        },
      ];
      returns: {
        defined: {
          name: "resolver";
          generics: [
            {
              kind: "type";
              type: {
                defined: {
                  name: "instructionGroups";
                };
              };
            },
          ];
        };
      };
    },
    {
      name: "transferNativeTokensWithRelay";
      docs: [
        "This instruction is used to transfer native tokens from Solana to a",
        "foreign blockchain. If the user is transferring native SOL,",
        "the contract will automatically wrap the lamports into a WSOL.",
        "",
        "# Arguments",
        "",
        "* `ctx` - `TransferNativeWithRelay` context",
        "* `amount` - Amount of tokens to send",
        "* `recipient_chain` - Chain ID of the target chain",
        "* `recipient_address` - Address of the target wallet on the target chain",
        "* `nonce` - Nonce of Wormhole message",
        "* `wrap_native` - Whether to wrap native SOL",
        "* `dst_transfer_recipient` - Token Bridge payload 3 recipient",
        "* `dst_execution_address` - Executor destination address",
        "* `exec_amount` - Amount of lamports to pay the execution payee",
        "* `signed_quote_bytes` - Executor signed quote",
        "* `relay_instructions` - Executor relay instructions",
      ];
      discriminator: [70, 101, 60, 125, 91, 218, 58, 204];
      accounts: [
        {
          name: "payer";
          docs: [
            "Payer will pay Wormhole fee to transfer tokens and create temporary",
            "token account.",
          ];
          writable: true;
          signer: true;
        },
        {
          name: "config";
          docs: [
            "Sender Config account. Acts as the signer for the Token Bridge token",
            "transfer. Read-only.",
          ];
          pda: {
            seeds: [
              {
                kind: "const";
                value: [115, 101, 110, 100, 101, 114];
              },
            ];
          };
        },
        {
          name: "mint";
          docs: [
            "Mint info. This is the SPL token that will be bridged over to the",
            "foreign contract. Mutable.",
          ];
          writable: true;
        },
        {
          name: "fromTokenAccount";
          docs: [
            "Payer's associated token account. We may want to make this a generic",
            "token account in the future.",
          ];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "payer";
              },
              {
                kind: "const";
                value: [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169,
                ];
              },
              {
                kind: "account";
                path: "mint";
              },
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: "tmpTokenAccount";
          docs: [
            "Program's temporary token account. This account is created before the",
            "instruction is invoked to temporarily take custody of the payer's",
            "tokens. When the tokens are finally bridged out, the token account",
            "will have zero balance and can be closed.",
          ];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [116, 109, 112];
              },
              {
                kind: "account";
                path: "mint";
              },
            ];
          };
        },
        {
          name: "tokenBridgeConfig";
        },
        {
          name: "tokenBridgeCustody";
          docs: [
            "account that holds this mint's balance. This account needs to be",
            "unchecked because a token account may not have been created for this",
            "mint yet. Mutable.",
          ];
          writable: true;
        },
        {
          name: "tokenBridgeAuthoritySigner";
        },
        {
          name: "tokenBridgeCustodySigner";
        },
        {
          name: "wormholeBridge";
          writable: true;
        },
        {
          name: "wormholeMessage";
          docs: [
            "tokens transferred in this account for our program. Mutable.",
          ];
          writable: true;
          signer: true;
        },
        {
          name: "tokenBridgeEmitter";
        },
        {
          name: "tokenBridgeSequence";
          writable: true;
        },
        {
          name: "wormholeFeeCollector";
          writable: true;
        },
        {
          name: "payee";
          writable: true;
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
        {
          name: "tokenProgram";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
        {
          name: "wormholeProgram";
          address: "3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5";
        },
        {
          name: "tokenBridgeProgram";
          address: "DZnkkTmCiFWfYTfT41X3Rd1kDgozqzxWaHqsw6W4x2oe";
        },
        {
          name: "executorProgram";
          address: "execXUrAsMnqMmTHj5m7N1YQgsDz3cwGLYCYyuDRciV";
        },
        {
          name: "clock";
        },
        {
          name: "rent";
        },
      ];
      args: [
        {
          name: "args";
          type: {
            defined: {
              name: "transferNativeTokensWithRelayArgs";
            };
          };
        },
      ];
    },
    {
      name: "transferWrappedTokensWithRelay";
      docs: [
        "This instruction is used to transfer wrapped tokens from Solana to a",
        "foreign blockchain. This instruction should only be called",
        "when the user is transferring a wrapped token.",
        "",
        "# Arguments",
        "",
        "* `ctx` - `TransferWrappedWithRelay` context",
        "* `amount` - Amount of tokens to send",
        "* `recipient_chain` - Chain ID of the target chain",
        "* `recipient_address` - Address of the target wallet on the target chain",
        "* `nonce` - Nonce of Wormhole message",
        "* `dst_transfer_recipient` - Token Bridge payload 3 recipient",
        "* `dst_execution_address` - Executor destination address",
        "* `exec_amount` - Amount of lamports to pay the execution payee",
        "* `signed_quote_bytes` - Executor signed quote",
        "* `relay_instructions` - Executor relay instructions",
      ];
      discriminator: [25, 63, 69, 217, 250, 9, 127, 122];
      accounts: [
        {
          name: "payer";
          docs: [
            "Payer will pay Wormhole fee to transfer tokens and create temporary",
            "token account.",
          ];
          writable: true;
          signer: true;
        },
        {
          name: "config";
          docs: [
            "Sender Config account. Acts as the Token Bridge sender PDA. Mutable.",
          ];
          pda: {
            seeds: [
              {
                kind: "const";
                value: [115, 101, 110, 100, 101, 114];
              },
            ];
          };
        },
        {
          name: "tokenBridgeWrappedMint";
          docs: [
            "Token Bridge wrapped mint info. This is the SPL token that will be",
            "bridged to the foreign contract. The wrapped mint PDA must agree",
            "with the native token's metadata. Mutable.",
          ];
          writable: true;
        },
        {
          name: "fromTokenAccount";
          docs: [
            "Payer's associated token account. We may want to make this a generic",
            "token account in the future.",
          ];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "payer";
              },
              {
                kind: "const";
                value: [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169,
                ];
              },
              {
                kind: "account";
                path: "tokenBridgeWrappedMint";
              },
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: "tmpTokenAccount";
          docs: [
            "Program's temporary token account. This account is created before the",
            "instruction is invoked to temporarily take custody of the payer's",
            "tokens. When the tokens are finally bridged out, the token account",
            "will have zero balance and can be closed.",
          ];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [116, 109, 112];
              },
              {
                kind: "account";
                path: "tokenBridgeWrappedMint";
              },
            ];
          };
        },
        {
          name: "tokenBridgeWrappedMeta";
          docs: [
            "about the token from its native chain:",
            "* Wormhole Chain ID",
            "* Token's native contract address",
            "* Token's native decimals",
          ];
        },
        {
          name: "tokenBridgeConfig";
        },
        {
          name: "tokenBridgeAuthoritySigner";
        },
        {
          name: "wormholeBridge";
          writable: true;
        },
        {
          name: "wormholeMessage";
          docs: [
            "tokens transferred in this account for our program. Mutable.",
          ];
          writable: true;
          signer: true;
        },
        {
          name: "tokenBridgeEmitter";
        },
        {
          name: "tokenBridgeSequence";
          writable: true;
        },
        {
          name: "wormholeFeeCollector";
          writable: true;
        },
        {
          name: "payee";
          writable: true;
        },
        {
          name: "wormholeProgram";
          address: "3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5";
        },
        {
          name: "tokenBridgeProgram";
          address: "DZnkkTmCiFWfYTfT41X3Rd1kDgozqzxWaHqsw6W4x2oe";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
        {
          name: "tokenProgram";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
        {
          name: "executorProgram";
          address: "execXUrAsMnqMmTHj5m7N1YQgsDz3cwGLYCYyuDRciV";
        },
        {
          name: "clock";
        },
        {
          name: "rent";
        },
      ];
      args: [
        {
          name: "args";
          type: {
            defined: {
              name: "transferWrappedTokensWithRelayArgs";
            };
          };
        },
      ];
    },
  ];
  accounts: [
    {
      name: "redeemerConfig";
      discriminator: [187, 195, 13, 200, 41, 129, 85, 191];
    },
    {
      name: "senderConfig";
      discriminator: [0, 241, 220, 77, 167, 128, 79, 152];
    },
  ];
  errors: [
    {
      code: 6000;
      name: "invalidWormholeBridge";
      msg: "invalidWormholeBridge";
    },
    {
      code: 6001;
      name: "invalidWormholeFeeCollector";
      msg: "invalidWormholeFeeCollector";
    },
    {
      code: 6002;
      name: "ownerOnly";
      msg: "ownerOnly";
    },
    {
      code: 6003;
      name: "outboundTransfersPaused";
      msg: "outboundTransfersPaused";
    },
    {
      code: 6004;
      name: "ownerOrAssistantOnly";
      msg: "ownerOrAssistantOnly";
    },
    {
      code: 6005;
      name: "notPendingOwner";
      msg: "notPendingOwner";
    },
    {
      code: 6006;
      name: "alreadyTheOwner";
      msg: "alreadyTheOwner";
    },
    {
      code: 6007;
      name: "alreadyTheAssistant";
      msg: "alreadyTheAssistant";
    },
    {
      code: 6008;
      name: "alreadyTheFeeRecipient";
      msg: "alreadyTheFeeRecipient";
    },
    {
      code: 6009;
      name: "bumpNotFound";
      msg: "bumpNotFound";
    },
    {
      code: 6010;
      name: "failedToMakeImmutable";
      msg: "failedToMakeImmutable";
    },
    {
      code: 6011;
      name: "invalidForeignContract";
      msg: "invalidForeignContract";
    },
    {
      code: 6012;
      name: "zeroBridgeAmount";
      msg: "zeroBridgeAmount";
    },
    {
      code: 6013;
      name: "invalidToNativeAmount";
      msg: "invalidToNativeAmount";
    },
    {
      code: 6014;
      name: "nativeMintRequired";
      msg: "nativeMintRequired";
    },
    {
      code: 6015;
      name: "swapsNotAllowedForNativeMint";
      msg: "swapsNotAllowedForNativeMint";
    },
    {
      code: 6016;
      name: "invalidTokenBridgeConfig";
      msg: "invalidTokenBridgeConfig";
    },
    {
      code: 6017;
      name: "invalidTokenBridgeAuthoritySigner";
      msg: "invalidTokenBridgeAuthoritySigner";
    },
    {
      code: 6018;
      name: "invalidTokenBridgeCustodySigner";
      msg: "invalidTokenBridgeCustodySigner";
    },
    {
      code: 6019;
      name: "invalidTokenBridgeEmitter";
      msg: "invalidTokenBridgeEmitter";
    },
    {
      code: 6020;
      name: "invalidTokenBridgeSequence";
      msg: "invalidTokenBridgeSequence";
    },
    {
      code: 6021;
      name: "invalidRecipient";
      msg: "invalidRecipient";
    },
    {
      code: 6022;
      name: "invalidTransferToChain";
      msg: "invalidTransferToChain";
    },
    {
      code: 6023;
      name: "invalidTransferTokenChain";
      msg: "invalidTransferTokenChain";
    },
    {
      code: 6024;
      name: "invalidPrecision";
      msg: "invalidPrecision";
    },
    {
      code: 6025;
      name: "invalidTransferToAddress";
      msg: "invalidTransferToAddress";
    },
    {
      code: 6026;
      name: "alreadyRedeemed";
      msg: "alreadyRedeemed";
    },
    {
      code: 6027;
      name: "invalidTokenBridgeForeignEndpoint";
      msg: "invalidTokenBridgeForeignEndpoint";
    },
    {
      code: 6028;
      name: "invalidTokenBridgeMintAuthority";
      msg: "invalidTokenBridgeMintAuthority";
    },
    {
      code: 6029;
      name: "invalidPublicKey";
      msg: "invalidPublicKey";
    },
    {
      code: 6030;
      name: "zeroSwapRate";
      msg: "zeroSwapRate";
    },
    {
      code: 6031;
      name: "tokenNotRegistered";
      msg: "tokenNotRegistered";
    },
    {
      code: 6032;
      name: "chainNotRegistered";
      msg: "chainNotRegistered";
    },
    {
      code: 6033;
      name: "tokenAlreadyRegistered";
      msg: "tokenAlreadyRegistered";
    },
    {
      code: 6034;
      name: "feeCalculationError";
      msg: "tokenFeeCalculationError";
    },
    {
      code: 6035;
      name: "invalidSwapCalculation";
      msg: "invalidSwapCalculation";
    },
    {
      code: 6036;
      name: "insufficientFunds";
      msg: "insufficientFunds";
    },
    {
      code: 6037;
      name: "failedToParseVaaBody";
      msg: "failedToParseVaaBody";
    },
  ];
  types: [
    {
      name: "instructionGroup";
      type: {
        kind: "struct";
        fields: [
          {
            name: "instructions";
            type: {
              vec: {
                defined: {
                  name: "serializableInstruction";
                };
              };
            };
          },
          {
            name: "addressLookupTables";
            type: {
              vec: "pubkey";
            };
          },
        ];
      };
    },
    {
      name: "instructionGroups";
      type: {
        kind: "struct";
        fields: [
          {
            vec: {
              defined: {
                name: "instructionGroup";
              };
            };
          },
        ];
      };
    },
    {
      name: "missingAccounts";
      type: {
        kind: "struct";
        fields: [
          {
            name: "accounts";
            type: {
              vec: "pubkey";
            };
          },
          {
            name: "addressLookupTables";
            type: {
              vec: "pubkey";
            };
          },
        ];
      };
    },
    {
      name: "redeemerConfig";
      type: {
        kind: "struct";
        fields: [
          {
            name: "bump";
            docs: ["PDA bump."];
            type: "u8";
          },
        ];
      };
    },
    {
      name: "resolver";
      generics: [
        {
          kind: "type";
          name: "t";
        },
      ];
      type: {
        kind: "enum";
        variants: [
          {
            name: "resolved";
            fields: [
              {
                generic: "t";
              },
            ];
          },
          {
            name: "missing";
            fields: [
              {
                defined: {
                  name: "missingAccounts";
                };
              },
            ];
          },
          {
            name: "account";
            fields: [];
          },
        ];
      };
    },
    {
      name: "senderConfig";
      type: {
        kind: "struct";
        fields: [
          {
            name: "bump";
            docs: ["PDA bump."];
            type: "u8";
          },
        ];
      };
    },
    {
      name: "serializableAccountMeta";
      type: {
        kind: "struct";
        fields: [
          {
            name: "pubkey";
            type: "pubkey";
          },
          {
            name: "isSigner";
            type: "bool";
          },
          {
            name: "isWritable";
            type: "bool";
          },
        ];
      };
    },
    {
      name: "serializableInstruction";
      type: {
        kind: "struct";
        fields: [
          {
            name: "programId";
            type: "pubkey";
          },
          {
            name: "accounts";
            type: {
              vec: {
                defined: {
                  name: "serializableAccountMeta";
                };
              };
            };
          },
          {
            name: "data";
            type: "bytes";
          },
        ];
      };
    },
    {
      name: "transferNativeTokensWithRelayArgs";
      type: {
        kind: "struct";
        fields: [
          {
            name: "amount";
            type: "u64";
          },
          {
            name: "recipientChain";
            type: "u16";
          },
          {
            name: "recipientAddress";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "nonce";
            type: "u32";
          },
          {
            name: "wrapNative";
            type: "bool";
          },
          {
            name: "dstTransferRecipient";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "dstExecutionAddress";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "execAmount";
            type: "u64";
          },
          {
            name: "signedQuoteBytes";
            type: "bytes";
          },
          {
            name: "relayInstructions";
            type: "bytes";
          },
        ];
      };
    },
    {
      name: "transferWrappedTokensWithRelayArgs";
      type: {
        kind: "struct";
        fields: [
          {
            name: "amount";
            type: "u64";
          },
          {
            name: "recipientChain";
            type: "u16";
          },
          {
            name: "recipientAddress";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "nonce";
            type: "u32";
          },
          {
            name: "dstTransferRecipient";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "dstExecutionAddress";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "execAmount";
            type: "u64";
          },
          {
            name: "signedQuoteBytes";
            type: "bytes";
          },
          {
            name: "relayInstructions";
            type: "bytes";
          },
        ];
      };
    },
  ];
};
