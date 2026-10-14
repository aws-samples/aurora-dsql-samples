//! Run the function's pool and lookup handler against an Aurora DSQL cluster
//! prepared with `seed.sql`.
//!
//! CI creates the cluster, runs `seed.sql` as admin, and maps `app_readonly` to
//! its IAM role. To run these tests yourself, set DSQL_ENDPOINT and AWS
//! credentials for a role mapped to `app_readonly`, then run
//! `cargo test --locked --features dsql-integration --test dsql_tests`.
#![cfg(feature = "dsql-integration")]

use dsql_employee_lookup::{connect_pool, handle_lookup, parse_request};
use lambda_http::Body;
use serde_json::{json, Value};
use sqlx::PgPool;

async fn app_pool() -> PgPool {
    let endpoint = std::env::var("DSQL_ENDPOINT")
        .expect("set DSQL_ENDPOINT to a cluster seeded with seed.sql");
    connect_pool(&endpoint, "app_readonly")
        .await
        .expect("connect as app_readonly")
}

async fn lookup(pool: &PgPool, request: Value) -> Value {
    let query = parse_request(&Body::Text(request.to_string())).expect("valid request");
    let response = handle_lookup(query, pool).await.unwrap();
    assert_eq!(response.status(), 200, "response: {response:?}");
    match response.body() {
        Body::Text(body) => serde_json::from_str(body).unwrap(),
        other => panic!("expected JSON text response, got {other:?}"),
    }
}

fn names(page: &Value) -> Vec<&str> {
    page["employees"]
        .as_array()
        .expect("employees array")
        .iter()
        .map(|employee| employee["name"].as_str().unwrap())
        .collect()
}

#[tokio::test]
async fn lists_seeded_employees_in_name_order() {
    let pool = app_pool().await;
    let page = lookup(&pool, json!({})).await;
    assert_eq!(
        names(&page),
        [
            "Alice Johnson",
            "Bob Smith",
            "Carlos Garcia",
            "Jane Doe",
            "John Doe"
        ]
    );
    assert_eq!(page["count"], 5);
    assert!(page["next"].is_null());
}

#[tokio::test]
async fn prefix_search_is_case_insensitive_and_literal() {
    let pool = app_pool().await;
    assert_eq!(
        names(&lookup(&pool, json!({ "name": "ALI" })).await),
        ["Alice Johnson"]
    );
    assert_eq!(
        names(&lookup(&pool, json!({ "name": "j" })).await),
        ["Jane Doe", "John Doe"]
    );
    assert!(names(&lookup(&pool, json!({ "name": "%" })).await).is_empty());
    assert!(names(&lookup(&pool, json!({ "name": "_ohn" })).await).is_empty());
}

#[tokio::test]
async fn paginates_with_cursors() {
    let pool = app_pool().await;
    let first = lookup(&pool, json!({ "limit": 2 })).await;
    assert_eq!(names(&first), ["Alice Johnson", "Bob Smith"]);
    let after = first["next"].as_str().expect("first page cursor");
    let second = lookup(&pool, json!({ "limit": 2, "after": after })).await;
    assert_eq!(names(&second), ["Carlos Garcia", "Jane Doe"]);
    let after = second["next"].as_str().expect("second page cursor");
    let third = lookup(&pool, json!({ "limit": 2, "after": after })).await;
    assert_eq!(names(&third), ["John Doe"]);
    assert!(third["next"].is_null());
}

#[tokio::test]
async fn app_role_cannot_write() {
    let pool = app_pool().await;
    let error = sqlx::query(
        "INSERT INTO employees (name, email, department, title, hire_date) \
         VALUES ('Mary Major', 'mary@example.com', 'Engineering', 'Engineer', '2024-01-02')",
    )
    .execute(&pool)
    .await
    .expect_err("app_readonly must not insert rows");
    let code = error
        .as_database_error()
        .and_then(|database_error| database_error.code())
        .map(|code| code.into_owned());
    assert_eq!(code.as_deref(), Some("42501"), "unexpected error: {error}");
}
