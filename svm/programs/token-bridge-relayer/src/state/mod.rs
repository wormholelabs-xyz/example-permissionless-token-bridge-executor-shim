mod lut;
pub use lut::*;

mod redeemer_config;
pub use redeemer_config::*;

mod sender_config;
pub use sender_config::*;

/// AKA `b"tmp"`.
pub const SEED_PREFIX_TMP: &[u8; 3] = b"tmp";
/// AKA `b"lut"`
pub const SEED_PREFIX_LUT: &[u8; 3] = b"lut";
/// AKA `b"lut_authority"`
pub const SEED_LUT_AUTHORITY: &[u8; 13] = b"lut_authority";
