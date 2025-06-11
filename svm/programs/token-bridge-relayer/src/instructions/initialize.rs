declare_program!(executor);

use anchor_lang::{
    prelude::*,
    solana_program::{
        address_lookup_table,
        program::{invoke, invoke_signed},
        sysvar::{clock, SysvarId},
    },
};
use wormhole_anchor_sdk::{token_bridge::program::TokenBridge, wormhole::program::Wormhole};

use crate::state::{RedeemerConfig, SenderConfig, LUT, SEED_LUT_AUTHORITY, SEED_PREFIX_LUT};

use executor::program::Executor;

#[derive(Accounts)]
#[instruction(recent_slot: u64)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        seeds = [SenderConfig::SEED_PREFIX],
        bump,
        space = SenderConfig::MAXIMUM_SIZE,
    )]
    /// Sender Config account, which saves program data useful for other
    /// instructions, specifically for outbound transfers.
    pub sender_config: Account<'info, SenderConfig>,

    #[account(
        init,
        payer = payer,
        seeds = [RedeemerConfig::SEED_PREFIX],
        bump,
        space = RedeemerConfig::MAXIMUM_SIZE,
    )]
    /// Redeemer Config account, which saves program data useful for other
    /// instructions, specifically for inbound transfers.
    pub redeemer_config: Account<'info, RedeemerConfig>,

    #[account(
        seeds = [SEED_LUT_AUTHORITY],
        bump
    )]
    /// CHECK: The seeds constraint enforces that this is the correct account.
    pub authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [authority.key().as_ref(), &recent_slot.to_le_bytes()],
        seeds::program = address_lookup_table::program::id(),
        bump
    )]
    /// CHECK: The seeds constraint enforces that this is the correct account.
    pub lut_address: UncheckedAccount<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + LUT::INIT_SPACE,
        seeds = [SEED_PREFIX_LUT],
        bump
    )]
    pub lut: Account<'info, LUT>,

    #[account(
        address = address_lookup_table::program::id(), 
        executable
    )]
    /// CHECK: address lookup table program (checked by instruction)
    pub lut_program: UncheckedAccount<'info>,

    /// System program.
    pub system_program: Program<'info, System>,
}

pub fn initialize(ctx: Context<Initialize>, recent_slot: u64) -> Result<()> {
    ctx.accounts.sender_config.bump = ctx.bumps.sender_config;
    ctx.accounts.redeemer_config.bump = ctx.bumps.redeemer_config;
    let (ix, lut_address) = address_lookup_table::instruction::create_lookup_table(
        ctx.accounts.authority.key(),
        ctx.accounts.payer.key(),
        recent_slot,
    );

    // just a sanity check, should never be hit, so we don't provide a custom
    // error message
    assert_eq!(lut_address, ctx.accounts.lut_address.key());

    // store the LUT
    ctx.accounts.lut.set_inner(LUT {
        bump: ctx.bumps.lut,
        address: lut_address,
    });

    // NOTE: LUTs can be permissionlessly created (i.e. the authority does
    // not need to sign the transaction). This means that the LUT might
    // already exist (if someone frontran us). However, it's not a problem:
    // AddressLookupTable::create_lookup_table checks if the LUT already
    // exists and does nothing if it does.
    //
    // LUTs can only be created permissionlessly, but only the authority is
    // authorised to actually populate the fields, so we don't have to worry
    // about the frontrunner populating it with junk. The only risk of that would
    // be the LUT being filled to capacity (256 addresses), with no
    // possibility for us to add our own accounts -- no other security impact.
    invoke(
        &ix,
        &[
            ctx.accounts.lut_address.to_account_info(),
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    let entries = vec![
        Wormhole::id(),
        TokenBridge::id(),
        // Pubkey::find_program_address(&[BRIDGE_SEED], &WORMHOLE_PROGRAM_ID).0,
        // Pubkey::find_program_address(&[FEE_COLLECTOR_SEED], &WORMHOLE_PROGRAM_ID).0,
        // emitter,
        // Pubkey::find_program_address(&[SEQUENCE_SEED, emitter.as_ref()], &WORMHOLE_PROGRAM_ID).0,
        // TODO: figure out what else can live here to help transfers AND complete be smaller
        System::id(),
        clock::id(),
        Rent::id(),
        Executor::id(),
    ];

    let ix = address_lookup_table::instruction::extend_lookup_table(
        ctx.accounts.lut_address.key(),
        ctx.accounts.authority.key(),
        Some(ctx.accounts.payer.key()),
        entries,
    );

    invoke_signed(
        &ix,
        &[
            ctx.accounts.lut_address.to_account_info(),
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        &[&[SEED_LUT_AUTHORITY, &[ctx.bumps.authority]]],
    )?;

    Ok(())
}
