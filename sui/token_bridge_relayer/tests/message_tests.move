// SPDX-License-Identifier: Apache 2

#[test_only]
module token_bridge_relayer::message_tests {
    use token_bridge_relayer::message::{Self};
    use wormhole::external_address::{Self};

    #[test]
    fun test_new() {
        let recipient_addr = @0x000000000000000000000000beFA429d57cD18b7F8A4d91A2da9AB4AF05d0FBe;
        let recipient = external_address::from_address(recipient_addr);

        let msg = message::new(recipient);
        assert!(message::recipient(&msg) == recipient, 0);
    }

    #[test]
    fun test_serialize() {
        let recipient_addr = @0x000000000000000000000000beFA429d57cD18b7F8A4d91A2da9AB4AF05d0FBe;
        let recipient = external_address::from_address(recipient_addr);

        let msg = message::new(recipient);
        let serialized = message::serialize(msg);

        assert!(vector::length(&serialized) == 32, 0);
    }

    #[test]
    fun test_deserialize() {
        let bytes = x"000000000000000000000000beFA429d57cD18b7F8A4d91A2da9AB4AF05d0FBe";

        let msg = message::deserialize(bytes);
        let recipient = message::recipient(&msg);

        let expected_addr = @0x000000000000000000000000beFA429d57cD18b7F8A4d91A2da9AB4AF05d0FBe;
        let expected_recipient = external_address::from_address(expected_addr);

        assert!(recipient == expected_recipient, 0);
    }

    #[test]
    fun test_round_trip() {
        let original_addr = @0x000000000000000000000000beFA429d57cD18b7F8A4d91A2da9AB4AF05d0FBe;
        let original_recipient = external_address::from_address(original_addr);

        let msg = message::new(original_recipient);
        let serialized = message::serialize(msg);
        let deserialized = message::deserialize(serialized);

        assert!(message::recipient(&deserialized) == original_recipient, 0);
    }

    #[test]
    fun test_full_32_byte_address() {
        let full_addr = @0x7E00000000000000000000000000000000000000000000000000000000000001;
        let recipient = external_address::from_address(full_addr);

        let msg = message::new(recipient);
        let serialized = message::serialize(msg);

        assert!(vector::length(&serialized) == 32, 0);

        let deserialized = message::deserialize(serialized);
        assert!(message::recipient(&deserialized) == recipient, 0);
    }

    #[test]
    #[expected_failure(abort_code = message::E_INVALID_PAYLOAD_LENGTH)]
    fun test_deserialize_invalid_length() {
        let invalid_bytes = x"beFA429d57cD18b7F8A4d91A2da9AB4AF05d0FBe";
        message::deserialize(invalid_bytes);
    }

    #[test]
    fun test_sui_native_address() {
        let sui_addr = @0x0000000000000000000000000000000000000000000000000000000000000001;
        let recipient = external_address::from_address(sui_addr);

        let msg = message::new(recipient);
        let serialized = message::serialize(msg);
        let deserialized = message::deserialize(serialized);

        assert!(message::recipient(&deserialized) == recipient, 0);
    }

    #[test]
    fun test_ethereum_style_address() {
        let eth_addr = @0x000000000000000000000000742d35Cc6634C0532925a3b844Bc9e7595f0bEb;
        let recipient = external_address::from_address(eth_addr);

        let msg = message::new(recipient);
        let serialized = message::serialize(msg);
        let deserialized = message::deserialize(serialized);

        assert!(message::recipient(&deserialized) == recipient, 0);
    }

    #[test]
    fun test_solana_style_address() {
        // Test with a Solana-style address (32 bytes, typically high entropy)
        let sol_addr = @0x3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c;
        let recipient = external_address::from_address(sol_addr);

        let msg = message::new(recipient);
        let serialized = message::serialize(msg);
        let deserialized = message::deserialize(serialized);

        assert!(message::recipient(&deserialized) == recipient, 0);
    }

    #[test]
    fun test_max_address() {
        // Test with maximum possible address value
        let max_addr = @0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;
        let recipient = external_address::from_address(max_addr);

        let msg = message::new(recipient);
        let serialized = message::serialize(msg);
        let deserialized = message::deserialize(serialized);

        assert!(message::recipient(&deserialized) == recipient, 0);
    }

    #[test]
    fun test_zero_address() {
        // Test with zero address (edge case)
        let zero_addr = @0x0000000000000000000000000000000000000000000000000000000000000000;
        let recipient = external_address::from_address(zero_addr);

        let msg = message::new(recipient);
        let serialized = message::serialize(msg);
        let deserialized = message::deserialize(serialized);

        assert!(message::recipient(&deserialized) == recipient, 0);
    }
}
