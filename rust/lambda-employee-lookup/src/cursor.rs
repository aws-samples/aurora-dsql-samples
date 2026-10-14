use base64::{engine::general_purpose::STANDARD, Engine};
use uuid::Uuid;

/// Encode a pagination cursor from (name, id) as base64("name\0id").
pub fn encode_cursor(name: &str, id: &str) -> String {
    STANDARD.encode(format!("{name}\0{id}"))
}

/// Decode a pagination cursor and validate its UUID before it is used in SQL.
pub fn decode_cursor(cursor: &str) -> Result<(String, String), String> {
    let bytes = STANDARD
        .decode(cursor)
        .map_err(|e| format!("invalid cursor: {e}"))?;
    let s = String::from_utf8(bytes).map_err(|e| format!("invalid cursor utf8: {e}"))?;
    let parts: Vec<&str> = s.splitn(2, '\0').collect();
    if parts.len() != 2 {
        return Err("invalid cursor format".into());
    }
    let id = Uuid::parse_str(parts[1]).map_err(|_| "invalid cursor UUID".to_string())?;
    Ok((parts[0].to_string(), id.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cursor_round_trip() {
        let encoded = encode_cursor("Alice Johnson", "550e8400-e29b-41d4-a716-446655440000");
        let (name, id) = decode_cursor(&encoded).unwrap();
        assert_eq!(name, "Alice Johnson");
        assert_eq!(id, "550e8400-e29b-41d4-a716-446655440000");
    }

    #[test]
    fn test_cursor_round_trip_empty_name() {
        let encoded = encode_cursor("", "00000000-0000-0000-0000-000000000000");
        let (name, id) = decode_cursor(&encoded).unwrap();
        assert_eq!(name, "");
        assert_eq!(id, "00000000-0000-0000-0000-000000000000");
    }

    #[test]
    fn test_cursor_rejects_invalid_uuid() {
        for id in [
            "",
            "some-id",
            "550e8400-e29b-41d4-a716-44665544000",
            "550e8400-e29b-41d4-a716-44665544000g",
            "550e8400-e29b-41d4-a716-446655440000\0extra",
        ] {
            let result = decode_cursor(&encode_cursor("Alice", id));
            assert!(result.is_err(), "accepted invalid UUID {id:?}: {result:?}");
        }
    }

    #[test]
    fn test_cursor_normalizes_uuid_for_sql_cast() {
        for id in [
            "550E8400-E29B-41D4-A716-446655440000",
            "urn:uuid:550e8400-e29b-41d4-a716-446655440000",
        ] {
            let (name, decoded_id) = decode_cursor(&encode_cursor("Alice", id)).unwrap();
            assert_eq!(name, "Alice");
            assert_eq!(decoded_id, "550e8400-e29b-41d4-a716-446655440000");
        }
    }

    #[test]
    fn test_cursor_invalid_base64() {
        let result = decode_cursor("not-valid-base64!!!");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("invalid cursor"));
    }

    #[test]
    fn test_cursor_missing_separator() {
        let encoded = STANDARD.encode("no-separator-here");
        let result = decode_cursor(&encoded);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("invalid cursor format"));
    }
}
