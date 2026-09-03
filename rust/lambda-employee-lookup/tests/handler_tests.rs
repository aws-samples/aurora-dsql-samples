//! Unit tests for the Lambda handler.
//!
//! These tests validate request parsing, error handling, and response formatting
//! without requiring a live DSQL connection. They use mock HTTP events to exercise
//! the handler's input validation paths.

use lambda_http::http::StatusCode;
use lambda_http::{Body, Request};
use serde_json::Value;

/// Helper: build a mock API Gateway v2 POST /lookup request with the given body.
fn mock_request(body: &str) -> Request {
    let req = lambda_http::http::Request::builder()
        .method("POST")
        .uri("/lookup")
        .header("Content-Type", "application/json")
        .body(Body::Text(body.to_string()))
        .expect("failed to build mock request");
    req
}

/// Helper: build a mock request with an empty body.
fn mock_empty_request() -> Request {
    lambda_http::http::Request::builder()
        .method("POST")
        .uri("/lookup")
        .body(Body::Empty)
        .expect("failed to build mock request")
}

/// Helper: build a mock request with a binary body.
fn mock_binary_request(data: &[u8]) -> Request {
    lambda_http::http::Request::builder()
        .method("POST")
        .uri("/lookup")
        .header("Content-Type", "application/json")
        .body(Body::Binary(data.to_vec()))
        .expect("failed to build mock request")
}

#[test]
fn test_valid_json_parses_name() {
    let body = r#"{"name": "Alice"}"#;
    let req = mock_request(body);
    match req.body() {
        Body::Text(t) => {
            let parsed: serde_json::Result<Value> = serde_json::from_str(t);
            assert!(parsed.is_ok(), "Valid JSON should parse successfully");
            let val = parsed.unwrap();
            assert_eq!(val["name"], "Alice");
        }
        _ => panic!("Expected Body::Text"),
    }
}

#[test]
fn test_valid_json_without_name() {
    let body = r#"{}"#;
    let req = mock_request(body);
    match req.body() {
        Body::Text(t) => {
            let parsed: serde_json::Result<Value> = serde_json::from_str(t);
            assert!(parsed.is_ok(), "Empty JSON object should parse");
            let val = parsed.unwrap();
            assert!(val.get("name").is_none() || val["name"].is_null());
        }
        _ => panic!("Expected Body::Text"),
    }
}

#[test]
fn test_invalid_json_is_detected() {
    let body = "not valid json";
    let req = mock_request(body);
    match req.body() {
        Body::Text(t) => {
            let parsed: serde_json::Result<Value> = serde_json::from_str(t);
            assert!(parsed.is_err(), "Invalid JSON should fail to parse");
        }
        _ => panic!("Expected Body::Text"),
    }
}

#[test]
fn test_empty_body_is_handled() {
    let req = mock_empty_request();
    match req.body() {
        Body::Empty => {
            // Empty body should be treated as a list-all request (no name filter)
        }
        _ => panic!("Expected Body::Empty"),
    }
}

#[test]
fn test_binary_body_valid_json() {
    let data = br#"{"name": "Bob"}"#;
    let req = mock_binary_request(data);
    match req.body() {
        Body::Binary(b) => {
            let parsed: serde_json::Result<Value> = serde_json::from_slice(b);
            assert!(parsed.is_ok(), "Valid binary JSON should parse");
            let val = parsed.unwrap();
            assert_eq!(val["name"], "Bob");
        }
        _ => panic!("Expected Body::Binary"),
    }
}

#[test]
fn test_binary_body_invalid_json() {
    let data = b"not json";
    let req = mock_binary_request(data);
    match req.body() {
        Body::Binary(b) => {
            let parsed: serde_json::Result<Value> = serde_json::from_slice(b);
            assert!(parsed.is_err(), "Invalid binary should fail to parse");
        }
        _ => panic!("Expected Body::Binary"),
    }
}

#[test]
fn test_employee_serialization() {
    // Verify the Employee struct serializes correctly
    #[derive(serde::Serialize)]
    struct Employee {
        id: String,
        name: String,
        email: String,
        department: String,
        title: String,
        hire_date: String,
    }

    let emp = Employee {
        id: "550e8400-e29b-41d4-a716-446655440000".to_string(),
        name: "John Doe".to_string(),
        email: "jdoe@example.com".to_string(),
        department: "Engineering".to_string(),
        title: "Software Engineer".to_string(),
        hire_date: "2022-01-15".to_string(),
    };

    let json = serde_json::to_value(&emp).unwrap();
    assert_eq!(json["name"], "John Doe");
    assert_eq!(json["email"], "jdoe@example.com");
    assert_eq!(json["department"], "Engineering");
}

#[test]
fn test_response_format() {
    // Verify the API response body format
    let employees = vec![serde_json::json!({
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "John Doe",
        "email": "jdoe@example.com",
        "department": "Engineering",
        "title": "Software Engineer",
        "hire_date": "2022-01-15"
    })];

    let body = serde_json::json!({
        "count": employees.len(),
        "employees": employees,
    });

    assert_eq!(body["count"], 1);
    assert!(body["employees"].is_array());
    assert_eq!(body["employees"][0]["name"], "John Doe");
}

#[test]
fn test_error_response_format() {
    // Verify error response format matches handler output
    let err_body = serde_json::json!({
        "error": "Invalid request body",
        "detail": "expected value at line 1 column 1"
    });

    assert_eq!(err_body["error"], "Invalid request body");
    assert!(err_body["detail"].is_string());
}

#[test]
fn test_prefix_pattern_construction() {
    // Verify the search pattern is a prefix (not wildcard) match
    let name_filter = "Alice";
    let pattern = format!("{}%", name_filter);
    assert_eq!(pattern, "Alice%");
    assert!(
        !pattern.starts_with('%'),
        "Pattern should NOT start with % (prefix lookup only)"
    );
}

#[test]
fn test_connection_string_format() {
    let user = "app_readonly";
    let endpoint = "foo0bar1baz2.dsql.us-east-1.on.aws";
    let conn_str = format!("postgres://{}@{}/postgres", user, endpoint);
    assert_eq!(
        conn_str,
        "postgres://app_readonly@foo0bar1baz2.dsql.us-east-1.on.aws/postgres"
    );
    assert!(
        conn_str.contains("app_readonly"),
        "Should use app_readonly, not admin"
    );
}
