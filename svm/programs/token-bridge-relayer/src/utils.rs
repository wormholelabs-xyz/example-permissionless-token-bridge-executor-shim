use crate::OUR_CHAIN;

pub fn valid_foreign_address(chain: u16, address: &[u8; 32]) -> bool {
    chain != 0 && chain != OUR_CHAIN && *address != [0; 32]
}
