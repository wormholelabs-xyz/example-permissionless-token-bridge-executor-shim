mod redeemer_config;
pub use redeemer_config::*;

mod sender_config;
pub use sender_config::*;

/// AKA `b"tmp"`.
pub const SEED_PREFIX_TMP: &[u8; 3] = b"tmp";
