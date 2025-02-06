# Anchor

This folder was generated using [Anchor](https://www.anchor-lang.com/) with `anchor init --no-git`.

## Testing

```bash
anchor test
```

## Building

### Tilt

```bash
anchor build -- --no-default-features --features localnet
```

### Wormhole Testnet / Solana Devnet

```bash
anchor build --verifiable -- --no-default-features --features testnet
```

### Mainnet

```bash
anchor build --verifiable
```

## Deploying

### Tilt

See [Tests](#tests)

### Wormhole Testnet / Solana Devnet

```bash
anchor deploy --provider.cluster devnet --provider.wallet ~/.config/solana/your-key.json -p <PROGRAM_NAME>
```

### Mainnet

```bash
anchor deploy --provider.cluster mainnet --provider.wallet ~/.config/solana/your-key.json -p <PROGRAM_NAME>
```

## Upgrading

```
anchor upgrade --provider.cluster <network> --provider.wallet ~/.config/solana/your-key.json --program-id <PROGRAM_ID> target/deploy/<program>.so
```

If you get an error like this

```
Error: Deploying program failed: RPC response error -32002: Transaction simulation failed: Error processing Instruction 0: account data too small for instruction [3 log messages]
```

Don't fret! Just extend the program size.

```
solana program -u <network> -k ~/.config/solana/your-key.json extend <PROGRAM_ID> <ADDITIONAL_BYTES>
```

You can view the current program size with `solana program -u <network> show <PROGRAM_ID>`.

## Changing the Program ID

Build the program with `anchor build`.

Get the newly generated program ID with `solana address -k target/deploy/<program>-keypair.json`.

Update the `declare_id!` macro in [lib.rs](./programs/<program>/src/lib.rs) and the program's address in [Anchor.toml](./Anchor.toml) with the above key.
