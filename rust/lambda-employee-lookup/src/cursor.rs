use base64::{engine::general_purpose::STANDARD, Engine};

/// Encode a pagination cursor from (name, id) as base64("name\0id").
pub fn encode_cursor(name: &str, id: &str) -> String {
    STANDARD.encode(format!("{name}\0{id}"))
}

/// Decode a pagination cursor back to (name, id).
pub fn decode_cursor(cursor: &str) -> Result<(String, String), String> {
    let bytes = STANDARD
        .decode(cursor)
        .map_err(|e| format!("invalid cursor: {e}"))?;
    let s = String::from_utf8(bytes).map_err(|e| format!("invalid cursor utf8: {e}"))?;
    let parts: Vec<&str> = s.splitn(2, '\0').collect();
    if parts.len() != 2 {
        return Err("invalid cursor format".into());
    }
    Ok((parts[0].to_string(), parts[1].to_string()))
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
        let encoded = encode_cursor("", "some-id");
        let (name, id) = decode_cursor(&encoded).unwrap();
        assert_eq!(name, "");
        assert_eq!(id, "some-id");
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
