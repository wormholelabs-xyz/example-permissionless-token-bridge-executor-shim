// TODO: https://github.com/wormhole-foundation/wormhole-sdk-rs/pull/70
// copied from https://github.com/wormhole-foundation/wormhole-sdk-rs/blob/6a8c0700db65a2e049a01e5767548f59439dbb3f/universal/raw-vaas/src/payloads/token_bridge/payloads.rs
use std::borrow::Cow;

use crate::protocol::Payload;

/// A token bridge payload, with type flag
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct TokenBridgePayload<'a> {
    span: &'a [u8],

    message: TokenBridgeMessage<'a>,
}

impl<'a> AsRef<[u8]> for TokenBridgePayload<'a> {
    fn as_ref(&self) -> &[u8] {
        self.span
    }
}

impl<'a> TryFrom<Payload<'a>> for TokenBridgePayload<'a> {
    type Error = &'static str;

    fn try_from(payload: Payload<'a>) -> Result<Self, &'static str> {
        Self::parse(payload.0)
    }
}

impl<'a> TokenBridgePayload<'a> {
    pub fn span(&self) -> &[u8] {
        self.span
    }

    pub fn message(&self) -> TokenBridgeMessage<'a> {
        self.message
    }

    pub fn parse(span: &'a [u8]) -> Result<Self, &'static str> {
        if span.is_empty() {
            return Err("TokenBridgePayload span too short. Need at least 1 byte");
        }

        let message = TokenBridgeMessage::parse(span)?;

        Ok(Self { span, message })
    }
}

/// The non-type-flag contents
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum TokenBridgeMessage<'a> {
    Transfer(Transfer<'a>),
    Attestation(Attestation<'a>),
    TransferWithMessage(TransferWithMessage<'a>),
}

impl<'a> TryFrom<Payload<'a>> for TokenBridgeMessage<'a> {
    type Error = &'static str;

    fn try_from(payload: Payload<'a>) -> Result<Self, &'static str> {
        Self::parse(payload.0)
    }
}

impl AsRef<[u8]> for TokenBridgeMessage<'_> {
    fn as_ref(&self) -> &[u8] {
        match self {
            Self::Transfer(inner) => inner.as_ref(),
            Self::Attestation(inner) => inner.as_ref(),
            Self::TransferWithMessage(inner) => inner.as_ref(),
        }
    }
}

impl<'a> TokenBridgeMessage<'a> {
    pub fn span(&self) -> &[u8] {
        self.as_ref()
    }

    pub fn transfer(&self) -> Option<&Transfer> {
        match self {
            TokenBridgeMessage::Transfer(inner) => Some(inner),
            _ => None,
        }
    }

    pub fn to_transfer_unchecked(self) -> Transfer<'a> {
        match self {
            TokenBridgeMessage::Transfer(inner) => inner,
            _ => panic!("TokenBridgeMessage is not Transfer"),
        }
    }

    pub fn attestation(&self) -> Option<&Attestation> {
        match self {
            TokenBridgeMessage::Attestation(inner) => Some(inner),
            _ => None,
        }
    }

    pub fn to_attestation_unchecked(self) -> Attestation<'a> {
        match self {
            TokenBridgeMessage::Attestation(inner) => inner,
            _ => panic!("TokenBridgeMessage is not Attestation"),
        }
    }

    pub fn transfer_with_message(&self) -> Option<&TransferWithMessage> {
        match self {
            TokenBridgeMessage::TransferWithMessage(inner) => Some(inner),
            _ => None,
        }
    }

    pub fn to_transfer_with_message_unchecked(self) -> TransferWithMessage<'a> {
        match self {
            TokenBridgeMessage::TransferWithMessage(inner) => inner,
            _ => panic!("TokenBridgeMessage is not TransferWithMessage"),
        }
    }

    pub fn parse(span: &'a [u8]) -> Result<Self, &'static str> {
        if span.is_empty() {
            return Err("TokenBridgeMessage span too short. Need at least 1 byte");
        }

        match span[0] {
            1 => Ok(Self::Transfer(Transfer::parse(&span[1..])?)),
            2 => Ok(Self::Attestation(Attestation::parse(&span[1..])?)),
            3 => Ok(Self::TransferWithMessage(TransferWithMessage::parse(
                &span[1..],
            )?)),
            _ => Err("Unknown TokenBridgeMessage type"),
        }
    }
}

/// A token bridge transfer
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Transfer<'a>(&'a [u8]);

impl<'a> AsRef<[u8]> for Transfer<'a> {
    fn as_ref(&self) -> &[u8] {
        self.0
    }
}

impl<'a> Transfer<'a> {
    pub fn amount(&self) -> [u8; 32] {
        self.0[..32].try_into().unwrap()
    }

    pub fn token_address(&self) -> [u8; 32] {
        self.0[32..64].try_into().unwrap()
    }

    pub fn token_chain(&self) -> u16 {
        u16::from_be_bytes(self.0[64..66].try_into().unwrap())
    }

    pub fn recipient(&self) -> [u8; 32] {
        self.0[66..98].try_into().unwrap()
    }

    pub fn recipient_chain(&self) -> u16 {
        u16::from_be_bytes(self.0[98..100].try_into().unwrap())
    }

    pub fn relayer_fee(&self) -> [u8; 32] {
        self.0[100..132].try_into().unwrap()
    }

    pub fn parse(span: &'a [u8]) -> Result<Self, &'static str> {
        if span.len() < 132 {
            return Err("Transfer span too short. Need exactly 132 bytes");
        }

        Ok(Self(&span[..132]))
    }
}

/// A token bridge attestation
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Attestation<'a>(&'a [u8]);

impl<'a> AsRef<[u8]> for Attestation<'a> {
    fn as_ref(&self) -> &[u8] {
        self.0
    }
}

impl<'a> TryFrom<&'a [u8]> for Attestation<'a> {
    type Error = &'static str;

    fn try_from(span: &'a [u8]) -> Result<Self, &'static str> {
        Self::parse(span)
    }
}

impl<'a> Attestation<'a> {
    pub fn token_address(&self) -> [u8; 32] {
        self.0[..32].try_into().unwrap()
    }

    pub fn token_chain(&self) -> u16 {
        u16::from_be_bytes(self.0[32..34].try_into().unwrap())
    }

    pub fn decimals(&self) -> u8 {
        self.0[34]
    }

    pub fn symbol(&self) -> Cow<'a, str> {
        let idx = &self.0[35..67]
            .iter()
            .rposition(|x| *x != 0)
            .map(|i| i + 1)
            .unwrap_or_default();
        String::from_utf8_lossy(&self.0[35..35 + idx])
    }

    pub fn name(&self) -> Cow<'a, str> {
        let idx = &self.0[67..99]
            .iter()
            .rposition(|x| *x != 0)
            .map(|i| i + 1)
            .unwrap_or_default();
        String::from_utf8_lossy(&self.0[67..67 + idx])
    }

    pub fn parse(span: &'a [u8]) -> Result<Self, &'static str> {
        if span.len() < 99 {
            return Err("Attestation span too short. Need exactly 99 bytes");
        }

        Ok(Self(&span[..99]))
    }
}

/// A token bridge transfer with message
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct TransferWithMessage<'a>(&'a [u8]);

impl<'a> AsRef<[u8]> for TransferWithMessage<'a> {
    fn as_ref(&self) -> &[u8] {
        self.0
    }
}

impl<'a> TryFrom<&'a [u8]> for TransferWithMessage<'a> {
    type Error = &'static str;

    fn try_from(span: &'a [u8]) -> Result<Self, &'static str> {
        Self::parse(span)
    }
}

impl<'a> TransferWithMessage<'a> {
    pub fn amount(&self) -> [u8; 32] {
        self.0[..32].try_into().unwrap()
    }

    pub fn token_address(&self) -> [u8; 32] {
        self.0[32..64].try_into().unwrap()
    }

    pub fn token_chain(&self) -> u16 {
        u16::from_be_bytes(self.0[64..66].try_into().unwrap())
    }

    pub fn redeemer(&self) -> [u8; 32] {
        self.0[66..98].try_into().unwrap()
    }

    pub fn redeemer_chain(&self) -> u16 {
        u16::from_be_bytes(self.0[98..100].try_into().unwrap())
    }

    pub fn sender(&self) -> [u8; 32] {
        self.0[100..132].try_into().unwrap()
    }

    pub fn payload(&'a self) -> Payload<'a> {
        Payload::parse(&self.0[132..])
    }

    pub fn parse(span: &'a [u8]) -> Result<Self, &'static str> {
        if span.len() < 132 {
            return Err("TransferWithMessage span too short. Need at least 132 bytes");
        }

        Ok(Self(span))
    }
}
