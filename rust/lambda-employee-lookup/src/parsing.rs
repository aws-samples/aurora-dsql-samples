use lambda_http::Body;
use serde_json::Value;
use tracing::warn;

use crate::models::LookupRequest;

/// Maximum allowed input length for name filter (characters).
const MAX_INPUT_LENGTH: usize = 100;

/// Parse the Lambda request body into a LookupRequest.
///
/// Returns Ok(LookupRequest) on success, or Err((status_code, json_body))
/// for invalid input (always 400).
pub fn parse_body(body: &Body) -> Result<LookupRequest, (u16, Value)> {
    match body {
        Body::Text(t) => serde_json::from_str(t).map_err(|e| {
            warn!("Invalid JSON body: {e}");
            (
                400,
                serde_json::json!({
                    "error": "Invalid request body",
                    "detail": e.to_string()
                }),
            )
        }),
        Body::Binary(b) => serde_json::from_slice(b).map_err(|e| {
            warn!("Invalid binary body: {e}");
            (
                400,
                serde_json::json!({
                    "error": "Invalid request body",
                    "detail": e.to_string()
                }),
            )
        }),
        Body::Empty => Ok(LookupRequest {
            name: None,
            after: None,
            limit: None,
        }),
    }
}

/// Build a SQL LIKE pattern from user input.
///
/// - Escapes LIKE metacharacters: `\` → `\\`, `%` → `\%`, `_` → `\_`
/// - Truncates input to MAX_INPUT_LENGTH characters
/// - Appends `%` for prefix matching
///
/// Examples:
/// - `""` → `"%"`
/// - `"Alice"` → `"Alice%"`
/// - `"%"` → `"\%%"`
/// - `"_test"` → `"\_test%"`
pub fn build_search_pattern(input: &str) -> String {
    // Truncate to max length first (on char boundary)
    let truncated: String = input.chars().take(MAX_INPUT_LENGTH).collect();

    // Escape LIKE metacharacters (backslash first to avoid double-escaping)
    let escaped = truncated
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");

    format!("{escaped}%")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_search_pattern_empty() {
        assert_eq!(build_search_pattern(""), "%");
    }

    #[test]
    fn test_build_search_pattern_normal() {
        assert_eq!(build_search_pattern("Alice"), "Alice%");
    }

    #[test]
    fn test_build_search_pattern_percent() {
        assert_eq!(build_search_pattern("%"), "\\%%");
    }

    #[test]
    fn test_build_search_pattern_underscore() {
        assert_eq!(build_search_pattern("_test"), "\\_test%");
    }

    #[test]
    fn test_build_search_pattern_backslash() {
        assert_eq!(build_search_pattern("back\\slash"), "back\\\\slash%");
    }

    #[test]
    fn test_build_search_pattern_truncation() {
        let long_input = "a".repeat(200);
        let result = build_search_pattern(&long_input);
        // 100 chars + trailing %
        assert_eq!(result.len(), 101);
        assert!(result.ends_with('%'));
    }

    #[test]
    fn test_build_search_pattern_combined_metacharacters() {
        assert_eq!(build_search_pattern("%_\\"), "\\%\\_\\\\%");
    }
}
