use anyhow::Result;
use aurora_dsql_sqlx_connector::DsqlConnectOptions;
use lambda_http::{run, service_fn, Body, Error, Request, Response};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::postgres::PgPoolOptions;
use sqlx::{Executor, PgPool, Row};
use std::env;
use std::sync::OnceLock;
use tracing::{error, info, warn};

// Global connection pool — initialized once, reused across Lambda invocations
static POOL: OnceLock<PgPool> = OnceLock::new();

#[derive(Deserialize)]
struct LookupRequest {
    #[serde(default)]
    name: Option<String>,
}

#[derive(Serialize)]
struct Employee {
    id: String,
    name: String,
    email: String,
    department: String,
    title: String,
    hire_date: String,
}

/// Initialize the DSQL connection pool using aurora-dsql-sqlx-connector.
///
/// The connector handles:
/// - IAM token generation and automatic background refresh
/// - TLS configuration for DSQL
/// - Connection health checks
///
/// PgPoolOptions configures:
/// - max_connections: max concurrent connections in the pool
/// - after_connect: sets the search_path on each new connection
async fn init_pool() -> Result<PgPool> {
    let endpoint = env::var("DSQL_ENDPOINT").expect("DSQL_ENDPOINT required");
    let user = env::var("DSQL_USER").unwrap_or_else(|_| "app_readonly".into());

    let conn_str = format!("postgres://{}@{}/postgres", user, endpoint);
    let config = DsqlConnectOptions::from_connection_string(&conn_str)?;

    let pool = aurora_dsql_sqlx_connector::pool::connect_with(
        &config,
        PgPoolOptions::new()
            .max_connections(5)
            .after_connect(|conn, _meta| {
                Box::pin(async move {
                    conn.execute("SET search_path = 'app'").await?;
                    Ok(())
                })
            }),
    )
    .await?;

    info!("DSQL connection pool initialized (max_connections=5)");
    Ok(pool)
}

/// Get or initialize the global pool
async fn get_pool() -> Result<&'static PgPool> {
    if let Some(pool) = POOL.get() {
        return Ok(pool);
    }
    let pool = init_pool().await?;
    Ok(POOL.get_or_init(|| pool))
}

/// Query employees from the database with pagination
async fn query_employees(pool: &PgPool, name_filter: &str) -> Result<Vec<Employee>> {
    let rows = if name_filter.is_empty() {
        info!("Fetching employees (limited to 50)");
        sqlx::query(
            "SELECT id::text, name, email, department, title, \
             hire_date::text FROM employees ORDER BY name LIMIT 50",
        )
        .fetch_all(pool)
        .await?
    } else {
        info!(name = %name_filter, "Searching employees by prefix");
        let pattern = format!("{}%", name_filter);
        sqlx::query(
            "SELECT id::text, name, email, department, title, \
             hire_date::text FROM employees \
             WHERE LOWER(name) LIKE LOWER($1) ORDER BY name LIMIT 50",
        )
        .bind(&pattern)
        .fetch_all(pool)
        .await?
    };

    Ok(rows
        .iter()
        .map(|row| Employee {
            id: row.get(0),
            name: row.get(1),
            email: row.get(2),
            department: row.get(3),
            title: row.get(4),
            hire_date: row.get(5),
        })
        .collect())
}

async fn handler(event: Request) -> Result<Response<Body>, Error> {
    let pool = get_pool().await.map_err(|e| {
        error!(error = %e, "Pool init failed");
        Error::from(e.to_string())
    })?;

    // Parse the JSON body, returning 400 on malformed input
    let query: LookupRequest = match event.body() {
        Body::Text(t) => match serde_json::from_str(t) {
            Ok(q) => q,
            Err(e) => {
                warn!("Invalid JSON body: {e}");
                return Ok(Response::builder()
                    .status(400)
                    .header("Content-Type", "application/json")
                    .body(Body::Text(serde_json::to_string(&json!({
                        "error": "Invalid request body",
                        "detail": e.to_string()
                    }))?))?)
            }
        },
        Body::Binary(b) => match serde_json::from_slice(b) {
            Ok(q) => q,
            Err(e) => {
                warn!("Invalid binary body: {e}");
                return Ok(Response::builder()
                    .status(400)
                    .header("Content-Type", "application/json")
                    .body(Body::Text(serde_json::to_string(&json!({
                        "error": "Invalid request body",
                        "detail": e.to_string()
                    }))?))?)
            }
        },
        Body::Empty => LookupRequest { name: None },
    };

    let filter = query.name.unwrap_or_default();

    match query_employees(pool, &filter).await {
        Ok(employees) => {
            info!(count = employees.len(), "Query complete");
            Ok(Response::builder()
                .status(200)
                .header("Content-Type", "application/json")
                .body(Body::Text(serde_json::to_string(&json!({
                    "count": employees.len(),
                    "employees": employees,
                }))?))?)
        }
        Err(e) => {
            error!(error = %e, "Query failed");
            Ok(Response::builder()
                .status(500)
                .header("Content-Type", "application/json")
                .body(Body::Text(serde_json::to_string(&json!({"error": e.to_string()}))?))?)
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    lambda_http::tracing::init_default_subscriber();
    info!("Starting dsql-employee-lookup Lambda");
    run(service_fn(handler)).await
}
