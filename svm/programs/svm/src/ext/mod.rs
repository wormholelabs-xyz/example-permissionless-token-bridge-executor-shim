const REQ_VAA_V1: &'static [u8; 4] = b"ERV1";

pub fn make_vaa_v1_request(chain: u16, address: [u8; 32], sequence: u64) -> Vec<u8> {
    let mut out = Vec::with_capacity({
        4 // type
        + 2 // chain
        + 32 // address
        + 8 // sequence
    });
    out.extend_from_slice(REQ_VAA_V1);
    out.extend_from_slice(&chain.to_be_bytes());
    out.extend_from_slice(&address);
    out.extend_from_slice(&sequence.to_be_bytes());
    out
}
