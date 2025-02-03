use anchor_lang::prelude::error_code;

#[error_code]
pub enum TokenBridgeExecutorShim {
    #[msg("ZeroBridgeAmount")]
    ZeroBridgeAmount = 0x0,
    #[msg("InvalidRecipient")]
    InvalidRecipient = 0x1,
}
