// TODO: https://github.com/wormhole-foundation/wormhole-sdk-rs/pull/70
// copied from https://github.com/wormhole-foundation/wormhole-sdk-rs/blob/6a8c0700db65a2e049a01e5767548f59439dbb3f/universal/raw-vaas/src/protocol.rs#L111
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Body<'a>(pub(crate) &'a [u8]);

impl<'a> AsRef<[u8]> for Body<'a> {
    fn as_ref(&self) -> &[u8] {
        self.0
    }
}

impl<'a> TryFrom<&'a [u8]> for Body<'a> {
    type Error = &'static str;

    fn try_from(value: &'a [u8]) -> Result<Self, Self::Error> {
        Self::parse(value)
    }
}

impl<'a> Body<'a> {
    pub fn timestamp(&self) -> u32 {
        u32::from_be_bytes(self.0[0..4].try_into().unwrap())
    }

    pub fn nonce(&self) -> u32 {
        u32::from_be_bytes(self.0[4..8].try_into().unwrap())
    }

    pub fn emitter_chain(&self) -> u16 {
        u16::from_be_bytes(self.0[8..10].try_into().unwrap())
    }

    pub fn emitter_address(&self) -> [u8; 32] {
        self.0[10..42].try_into().unwrap()
    }

    pub fn sequence(&self) -> u64 {
        u64::from_be_bytes(self.0[42..50].try_into().unwrap())
    }

    pub fn consistency_level(&self) -> u8 {
        self.0[50]
    }

    pub fn payload(&self) -> Payload<'a> {
        Payload::parse(if self.0.len() < 51 {
            &[]
        } else {
            &self.0[51..]
        })
    }

    pub fn parse(span: &'a [u8]) -> Result<Self, &'static str> {
        if span.len() < 51 {
            return Err("Body: invalid length. Expected at least 51 bytes.");
        }

        Ok(Self(span))
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Payload<'a>(pub(crate) &'a [u8]);

impl<'a> AsRef<[u8]> for Payload<'a> {
    fn as_ref(&self) -> &[u8] {
        self.0
    }
}

impl<'a> Payload<'a> {
    pub fn parse(span: &'a [u8]) -> Self {
        Self(span)
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

impl<'a> From<&'a [u8]> for Payload<'a> {
    fn from(value: &'a [u8]) -> Self {
        Self::parse(value)
    }
}

impl<'a> From<Payload<'a>> for &'a [u8] {
    fn from(value: Payload<'a>) -> Self {
        value.0
    }
}
