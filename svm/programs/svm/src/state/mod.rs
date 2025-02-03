mod foreign_contract;
pub use foreign_contract::*;

mod sender_config;
pub use sender_config::*;

/// AKA `b"tmp"`.
pub const SEED_PREFIX_TMP: &[u8; 3] = b"tmp";
