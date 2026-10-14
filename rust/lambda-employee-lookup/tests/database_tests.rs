//! Execute the production lookup handler against a disposable PostgreSQL database.
//!
//! Opt in with DATABASE_URL and `cargo test --locked --test database_tests -- --ignored`.
//! Each test owns a separate schema. These tests do not verify DSQL IAM, TLS,
//! async indexes, or query planning, and must not target a production database.

use base64::{engine::general_purpose::STANDARD, Engine};
use dsql_employee_lookup::{handle_lookup, parse_request};
use lambda_http::{Body, Response};
use serde_json::{json, Value};
use sqlx::{postgres::PgPoolOptions, AssertSqlSafe, Executor, PgPool};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

const ID_1: &str = "00000000-0000-0000-0000-000000000001";
const ID_2: &str = "00000000-0000-0000-0000-000000000002";
const ID_3: &str = "00000000-0000-0000-0000-000000000003";
const ID_4: &str = "00000000-0000-0000-0000-000000000004";
const ID_5: &str = "00000000-0000-0000-0000-000000000005";
const ID_6: &str = "00000000-0000-0000-0000-000000000006";
const ID_7: &str = "00000000-0000-0000-0000-000000000007";
const ID_8: &str = "00000000-0000-0000-0000-000000000008";
const ID_9: &str = "00000000-0000-0000-0000-000000000009";
const ID_10: &str = "00000000-0000-0000-0000-00000000000a";
const ID_11: &str = "00000000-0000-0000-0000-00000000000b";

static NEXT_SCHEMA: AtomicUsize = AtomicUsize::new(0);

struct TestDatabase {
    pool: PgPool,
    schema: String,
}

impl TestDatabase {
    async fn new(employees: &[(&str, &str)]) -> Self {
        let url = std::env::var("DATABASE_URL")
            .expect("set DATABASE_URL to a disposable PostgreSQL database to run ignored tests");
        let schema = format!(
            "employee_lookup_test_{}_{}",
            std::process::id(),
            NEXT_SCHEMA.fetch_add(1, Ordering::Relaxed)
        );
        let search_path = format!("SET search_path = {schema}");
        let pool = PgPoolOptions::new()
            .max_connections(1)
            .acquire_timeout(Duration::from_secs(5))
            .after_connect(move |conn, _| {
                let search_path = search_path.clone();
                Box::pin(async move {
                    // The identifier contains only a fixed prefix and numeric test ids.
                    conn.execute(AssertSqlSafe(search_path)).await?;
                    Ok(())
                })
            })
            .connect(&url)
            .await
            .expect("connect to local test PostgreSQL");
        pool.execute(AssertSqlSafe(format!("CREATE SCHEMA {schema}")))
            .await
            .unwrap();
        pool.execute(
            "CREATE TABLE employees (
                id UUID PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                department TEXT NOT NULL,
                title TEXT NOT NULL,
                hire_date DATE NOT NULL
            )",
        )
        .await
        .unwrap();
        for &(id, name) in employees {
            sqlx::query(
                "INSERT INTO employees (id, name, email, department, title, hire_date) \
                 VALUES ($1::uuid, $2, 'fixture@example.com', 'Engineering', 'Engineer', '2024-01-02')",
            )
            .bind(id)
            .bind(name)
            .execute(&pool)
            .await
            .unwrap();
        }
        Self { pool, schema }
    }

    async fn close(self) {
        self.pool
            .execute(AssertSqlSafe(format!(
                "DROP SCHEMA {} CASCADE",
                self.schema
            )))
            .await
            .unwrap();
        self.pool.close().await;
    }
}

fn json_body(response: &Response<Body>) -> Value {
    assert_eq!(response.headers()["content-type"], "application/json");
    match response.body() {
        Body::Text(body) => serde_json::from_str(body).unwrap(),
        other => panic!("expected JSON text response, got {other:?}"),
    }
}

async fn lookup(pool: &PgPool, body: Body) -> Value {
    let query = parse_request(&body).expect("valid test request");
    let response = handle_lookup(query, pool).await.unwrap();
    assert_eq!(response.status(), 200, "response: {response:?}");
    json_body(&response)
}

async fn lookup_json(pool: &PgPool, body: Value) -> Value {
    lookup(pool, Body::Text(body.to_string())).await
}

fn assert_ids(body: &Value, expected: &[&str]) {
    let ids: Vec<&str> = body["employees"]
        .as_array()
        .unwrap()
        .iter()
        .map(|employee| employee["id"].as_str().unwrap())
        .collect();
    assert_eq!(ids, expected, "response: {body}");
    assert_eq!(body["count"], expected.len());
}

fn assert_next(body: &Value, expected_payload: &str) {
    let next = body["next"].as_str().expect("expected next-page cursor");
    assert_eq!(STANDARD.decode(next).unwrap(), expected_payload.as_bytes());
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL DATABASE_URL; run with --ignored"]
async fn handler_filters_case_insensitive_prefixes_and_literal_metacharacters() {
    let db = TestDatabase::new(&[
        (ID_1, "Alice Johnson"),
        (ID_2, "ALICIA Perez"),
        (ID_3, "Malice"),
        (ID_4, "%_\\ Literal"),
        (ID_5, "XYZ Literal"),
        (ID_6, "_Team"),
        (ID_7, "ATeam"),
        (ID_8, "Back\\slash"),
        (ID_9, "Backslash"),
        (ID_10, "O'Brien"),
        (ID_11, "Other"),
    ])
    .await;
    for (filter, expected) in [
        ("aLi", vec![ID_1, ID_2]),
        ("%", vec![ID_4]),
        ("_", vec![ID_6]),
        ("Back\\", vec![ID_8]),
        ("%_\\", vec![ID_4]),
        ("O'B", vec![ID_10]),
        ("' OR true --", vec![]),
        ("unmatched", vec![]),
    ] {
        let body = lookup_json(&db.pool, json!({ "name": filter })).await;
        assert_ids(&body, &expected);
        assert!(body["next"].is_null(), "filter: {filter:?}");
    }
    let body = lookup_json(&db.pool, json!({ "name": "alice" })).await;
    assert_eq!(
        body["employees"][0],
        json!({
            "id": ID_1,
            "name": "Alice Johnson",
            "email": "fixture@example.com",
            "department": "Engineering",
            "title": "Engineer",
            "hire_date": "2024-01-02"
        })
    );
    db.close().await;
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL DATABASE_URL; run with --ignored"]
async fn handler_truncates_name_filter_at_100_unicode_characters() {
    let prefix = "é".repeat(100);
    let matched = format!("{prefix} Match");
    let decoy = format!("{}x", "é".repeat(99));
    let db = TestDatabase::new(&[(ID_1, &matched), (ID_2, &decoy)]).await;
    for filter in [prefix.clone(), format!("{prefix}discarded")] {
        let body = lookup_json(&db.pool, json!({ "name": filter })).await;
        assert_ids(&body, &[ID_1]);
        assert!(body["next"].is_null());
    }
    db.close().await;
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL DATABASE_URL; run with --ignored"]
async fn handler_paginates_by_lowercase_name_then_uuid_without_duplicates() {
    let db = TestDatabase::new(&[
        (ID_9, "Bob"),
        (ID_7, "alice"),
        (ID_2, "ALICE"),
        (ID_1, "Alicia"),
        (ID_3, "Zoe"),
    ])
    .await;
    let first = lookup_json(&db.pool, json!({ "limit": 2 })).await;
    assert_ids(&first, &[ID_2, ID_7]);
    assert_next(&first, "alice\u{0}00000000-0000-0000-0000-000000000007");

    let second = lookup_json(&db.pool, json!({ "limit": 2, "after": first["next"] })).await;
    assert_ids(&second, &[ID_1, ID_9]);
    assert_next(&second, "Bob\u{0}00000000-0000-0000-0000-000000000009");

    let third = lookup_json(&db.pool, json!({ "limit": 2, "after": second["next"] })).await;
    assert_ids(&third, &[ID_3]);
    assert!(third["next"].is_null());

    let end = STANDARD.encode("Zoe\u{0}00000000-0000-0000-0000-000000000003");
    let empty = lookup_json(&db.pool, json!({ "after": end, "limit": 2 })).await;
    assert_ids(&empty, &[]);
    assert!(empty["next"].is_null());

    let canonicalized = STANDARD.encode("ALICE\0urn:uuid:00000000-0000-0000-0000-000000000002");
    let next = lookup_json(&db.pool, json!({ "after": canonicalized, "limit": 1 })).await;
    assert_ids(&next, &[ID_7]);
    assert_next(&next, "alice\u{0}00000000-0000-0000-0000-000000000007");

    let empty_name = STANDARD.encode("\u{0}00000000-0000-0000-0000-000000000000");
    let from_start = lookup_json(&db.pool, json!({ "after": empty_name, "limit": 2 })).await;
    assert_ids(&from_start, &[ID_2, ID_7]);
    db.close().await;
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL DATABASE_URL; run with --ignored"]
async fn handler_paginates_filtered_results_with_literal_pattern_and_uuid_ties() {
    let db = TestDatabase::new(&[
        (ID_2, "%_\\ Alpha"),
        (ID_1, "%_\\ Alpha"),
        (ID_3, "%_\\ Beta"),
        (ID_4, "Wild_\\ Alpha"),
        (ID_5, "%X\\ Alpha"),
    ])
    .await;
    let first = lookup_json(&db.pool, json!({ "name": "%_\\", "limit": 1 })).await;
    assert_ids(&first, &[ID_1]);
    assert_next(
        &first,
        "%_\\ Alpha\u{0}00000000-0000-0000-0000-000000000001",
    );

    let second = lookup_json(
        &db.pool,
        json!({
            "name": "%_\\", "limit": 1, "after": first["next"]
        }),
    )
    .await;
    assert_ids(&second, &[ID_2]);
    assert_next(
        &second,
        "%_\\ Alpha\u{0}00000000-0000-0000-0000-000000000002",
    );

    let third = lookup_json(
        &db.pool,
        json!({
            "name": "%_\\", "limit": 1, "after": second["next"]
        }),
    )
    .await;
    assert_ids(&third, &[ID_3]);
    assert!(third["next"].is_null());
    db.close().await;
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL DATABASE_URL; run with --ignored"]
async fn handler_defaults_and_caps_limit_at_50_with_a_next_page() {
    let employees: Vec<(String, String)> = (1..=51)
        .map(|i| {
            (
                format!("00000000-0000-0000-0000-{i:012x}"),
                format!("Employee {i:03}"),
            )
        })
        .collect();
    let rows: Vec<(&str, &str)> = employees
        .iter()
        .map(|(id, name)| (id.as_str(), name.as_str()))
        .collect();
    let db = TestDatabase::new(&rows).await;
    for request in [
        Body::Empty,
        Body::Text("{}".into()),
        Body::Binary(br#"{"name":null,"after":null,"limit":null}"#.to_vec()),
        Body::Text(json!({ "name": "", "limit": 50 }).to_string()),
        Body::Text(json!({ "limit": 51 }).to_string()),
        Body::Text(json!({ "limit": u32::MAX }).to_string()),
    ] {
        let first = lookup(&db.pool, request).await;
        assert_eq!(first["count"], 50);
        assert_eq!(first["employees"].as_array().unwrap().len(), 50);
        assert_eq!(first["employees"][0]["name"], "Employee 001");
        assert_eq!(first["employees"][49]["name"], "Employee 050");
        assert_next(
            &first,
            "Employee 050\u{0}00000000-0000-0000-0000-000000000032",
        );
        let second = lookup_json(&db.pool, json!({ "after": first["next"] })).await;
        assert_ids(&second, &["00000000-0000-0000-0000-000000000033"]);
        assert_eq!(second["employees"][0]["name"], "Employee 051");
        assert!(second["next"].is_null());
    }
    db.close().await;
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL DATABASE_URL; run with --ignored"]
async fn handler_empty_table_returns_empty_page_without_cursor() {
    let db = TestDatabase::new(&[]).await;
    let body = lookup(&db.pool, Body::Empty).await;
    assert_eq!(body, json!({ "count": 0, "employees": [], "next": null }));
    db.close().await;
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL DATABASE_URL; run with --ignored"]
async fn handler_query_failures_return_generic_500_without_database_details() {
    let db = TestDatabase::new(&[]).await;
    db.pool.execute("DROP TABLE employees").await.unwrap();
    let after = STANDARD.encode("Alice\u{0}00000000-0000-0000-0000-000000000001");
    for body in [
        json!({}),
        json!({ "name": "Alice" }),
        json!({ "after": after }),
        json!({ "name": "Alice", "after": after }),
    ] {
        let query = parse_request(&Body::Text(body.to_string())).unwrap();
        let response = handle_lookup(query, &db.pool).await.unwrap();
        assert_eq!(response.status(), 500, "request: {body}");
        assert_eq!(
            json_body(&response),
            json!({ "error": "Internal server error" })
        );
    }
    db.close().await;
}
