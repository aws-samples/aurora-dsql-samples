use lambda_http::{Body, Response};
use serde_json::json;

use crate::models::Employee;

/// Build a 200 success response with employees and optional pagination cursor.
pub fn success_response(
    employees: &[Employee],
    next: Option<&str>,
) -> Result<Response<Body>, lambda_http::Error> {
    let body = json!({
        "count": employees.len(),
        "employees": employees,
        "next": next,
    });
    Ok(Response::builder()
        .status(200)
        .header("Content-Type", "application/json")
        .body(Body::Text(serde_json::to_string(&body)?))?)
}

/// Build an error response with status code, message, and optional detail.
///
/// - 400 responses include both `error` and `detail` fields
/// - 500 responses include only `error`
pub fn error_response(
    status: u16,
    message: &str,
    detail: Option<&str>,
) -> Result<Response<Body>, lambda_http::Error> {
    let body = if let Some(d) = detail {
        json!({ "error": message, "detail": d })
    } else {
        json!({ "error": message })
    };
    Ok(Response::builder()
        .status(status)
        .header("Content-Type", "application/json")
        .body(Body::Text(serde_json::to_string(&body)?))?)
}
