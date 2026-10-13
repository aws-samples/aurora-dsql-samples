//! Unit tests for the DSQL Employee Lookup Lambda handler.
//!
//! These tests call the shared library without AWS or a running database.

use dsql_employee_lookup::{
    build_search_pattern, decode_cursor, encode_cursor, error_response, handle_lookup, parse_body,
    parse_request, success_response, Employee,
};
use lambda_http::Body;

// =============================================================================
// parse_body tests
// =============================================================================

#[test]
fn test_parse_body_valid_json_with_name() {
    let body = Body::Text(r#"{"name": "Alice"}"#.to_string());
    let result = parse_body(&body).unwrap();
    assert_eq!(result.name.as_deref(), Some("Alice"));
    assert!(result.after.is_none());
    assert!(result.limit.is_none());
}

#[test]
fn test_parse_body_valid_json_empty_object() {
    let body = Body::Text("{}".to_string());
    let result = parse_body(&body).unwrap();
    assert!(result.name.is_none());
}

#[test]
fn test_parse_body_valid_json_with_pagination() {
    let body = Body::Text(r#"{"name": "Bob", "after": "abc123", "limit": 10}"#.to_string());
    let result = parse_body(&body).unwrap();
    assert_eq!(result.name.as_deref(), Some("Bob"));
    assert_eq!(result.after.as_deref(), Some("abc123"));
    assert_eq!(result.limit, Some(10));
}

#[test]
fn test_parse_body_empty_body() {
    let body = Body::Empty;
    let result = parse_body(&body).unwrap();
    assert!(result.name.is_none());
    assert!(result.after.is_none());
    assert!(result.limit.is_none());
}

#[test]
fn test_parse_body_invalid_text() {
    let body = Body::Text("not valid json".to_string());
    let result = parse_body(&body);
    assert!(result.is_err());
    let (status, err_body) = result.unwrap_err();
    assert_eq!(status, 400);
    assert_eq!(err_body["error"], "Invalid request body");
    assert!(err_body["detail"].is_string());
}

#[test]
fn test_parse_body_valid_binary() {
    let body = Body::Binary(br#"{"name": "Carlos"}"#.to_vec());
    let result = parse_body(&body).unwrap();
    assert_eq!(result.name.as_deref(), Some("Carlos"));
}

#[test]
fn test_parse_body_invalid_binary() {
    let body = Body::Binary(b"not json".to_vec());
    let result = parse_body(&body);
    assert!(result.is_err());
    let (status, err_body) = result.unwrap_err();
    assert_eq!(status, 400);
    assert_eq!(err_body["error"], "Invalid request body");
}

// =============================================================================
// build_search_pattern tests
// =============================================================================

#[test]
fn test_pattern_empty_input() {
    assert_eq!(build_search_pattern(""), "%");
}

#[test]
fn test_pattern_normal_name() {
    assert_eq!(build_search_pattern("Alice"), "Alice%");
}

#[test]
fn test_pattern_escapes_percent() {
    assert_eq!(build_search_pattern("%"), "\\%%");
}

#[test]
fn test_pattern_escapes_underscore() {
    assert_eq!(build_search_pattern("_test"), "\\_test%");
}

#[test]
fn test_pattern_escapes_backslash() {
    assert_eq!(build_search_pattern("back\\slash"), "back\\\\slash%");
}

#[test]
fn test_pattern_escapes_combined_metacharacters() {
    assert_eq!(build_search_pattern("%_\\"), "\\%\\_\\\\%");
}

#[test]
fn test_pattern_truncates_at_100_chars() {
    let long_input = "a".repeat(200);
    let result = build_search_pattern(&long_input);
    // 100 chars + trailing %
    assert_eq!(result.len(), 101);
    assert!(result.starts_with("aaaa"));
    assert!(result.ends_with('%'));
}

#[test]
fn test_pattern_normal_chars_unchanged() {
    assert_eq!(build_search_pattern("John Doe"), "John Doe%");
    assert_eq!(build_search_pattern("O'Brien"), "O'Brien%");
    assert_eq!(build_search_pattern("José García"), "José García%");
}

// =============================================================================
// cursor encode/decode tests
// =============================================================================

#[test]
fn test_cursor_round_trip() {
    let cursor = encode_cursor("Alice Johnson", "550e8400-e29b-41d4-a716-446655440000");
    let (name, id) = decode_cursor(&cursor).unwrap();
    assert_eq!(name, "Alice Johnson");
    assert_eq!(id, "550e8400-e29b-41d4-a716-446655440000");
}

#[test]
fn test_cursor_round_trip_empty_name() {
    let cursor = encode_cursor("", "00000000-0000-0000-0000-000000000000");
    let (name, id) = decode_cursor(&cursor).unwrap();
    assert_eq!(name, "");
    assert_eq!(id, "00000000-0000-0000-0000-000000000000");
}

#[test]
fn test_cursor_round_trip_unicode() {
    let cursor = encode_cursor("José García", "550e8400-e29b-41d4-a716-446655440000");
    let (name, id) = decode_cursor(&cursor).unwrap();
    assert_eq!(name, "José García");
    assert_eq!(id, "550e8400-e29b-41d4-a716-446655440000");
}

#[test]
fn test_cursor_invalid_base64() {
    let result = decode_cursor("not-valid-base64!!!");
    assert!(result.is_err());
}

#[test]
fn test_cursor_missing_separator() {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let encoded = STANDARD.encode("no-separator-here");
    let result = decode_cursor(&encoded);
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("invalid cursor format"));
}

// =============================================================================
// response formatting tests
// =============================================================================

#[test]
fn test_success_response_with_employees() {
    let employees = vec![Employee {
        id: "550e8400-e29b-41d4-a716-446655440000".to_string(),
        name: "John Doe".to_string(),
        email: "jdoe@example.com".to_string(),
        department: "Engineering".to_string(),
        title: "Software Engineer".to_string(),
        hire_date: "2022-01-15".to_string(),
    }];
    let resp = success_response(&employees, Some("next-cursor-abc")).unwrap();
    assert_eq!(resp.status(), 200);
    let body_str = match resp.body() {
        Body::Text(t) => t.clone(),
        _ => panic!("Expected Body::Text"),
    };
    let json: serde_json::Value = serde_json::from_str(&body_str).unwrap();
    assert_eq!(json["count"], 1);
    assert_eq!(json["employees"][0]["name"], "John Doe");
    assert_eq!(json["next"], "next-cursor-abc");
}

#[test]
fn test_success_response_empty_no_cursor() {
    let resp = success_response(&[], None).unwrap();
    assert_eq!(resp.status(), 200);
    let body_str = match resp.body() {
        Body::Text(t) => t.clone(),
        _ => panic!("Expected Body::Text"),
    };
    let json: serde_json::Value = serde_json::from_str(&body_str).unwrap();
    assert_eq!(json["count"], 0);
    assert!(json["employees"].as_array().unwrap().is_empty());
    assert!(json["next"].is_null());
}

#[test]
fn test_error_response_400_with_detail() {
    let resp = error_response(400, "Invalid request body", Some("expected value")).unwrap();
    assert_eq!(resp.status(), 400);
    let body_str = match resp.body() {
        Body::Text(t) => t.clone(),
        _ => panic!("Expected Body::Text"),
    };
    let json: serde_json::Value = serde_json::from_str(&body_str).unwrap();
    assert_eq!(json["error"], "Invalid request body");
    assert_eq!(json["detail"], "expected value");
}

#[test]
fn test_error_response_500_no_detail() {
    let resp = error_response(500, "Internal server error", None).unwrap();
    assert_eq!(resp.status(), 500);
    let body_str = match resp.body() {
        Body::Text(t) => t.clone(),
        _ => panic!("Expected Body::Text"),
    };
    let json: serde_json::Value = serde_json::from_str(&body_str).unwrap();
    assert_eq!(json["error"], "Internal server error");
    assert!(json.get("detail").is_none());
}

#[tokio::test]
async fn test_handler_closed_pool_returns_generic_500() {
    let pool = sqlx::postgres::PgPoolOptions::new()
        .connect_lazy("postgres://unused@127.0.0.1/postgres")
        .unwrap();
    pool.close().await;
    let query = parse_request(&Body::Empty).unwrap();
    let response = handle_lookup(query, &pool).await.unwrap();
    assert_eq!(response.status(), 500);
    assert_eq!(response.headers()["content-type"], "application/json");
    let body = match response.body() {
        Body::Text(body) => body,
        other => panic!("expected JSON text response, got {other:?}"),
    };
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(body).unwrap(),
        serde_json::json!({ "error": "Internal server error" })
    );
}
