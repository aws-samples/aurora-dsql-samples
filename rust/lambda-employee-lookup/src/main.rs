use anyhow::Result;
use aurora_dsql_sqlx_connector::DsqlConnectOptions;
use dsql_employee_lookup::{
    build_search_pattern, decode_cursor, encode_cursor, parse_body, Employee,
};
use dsql_employee_lookup::{error_response, success_response};
use lambda_http::{run, service_fn, Body, Error, Request, Response};
use sqlx::postgres::PgPoolOptions;
use sqlx::{Executor, PgPool, Row};
use std::env;
use std::sync::OnceLock;
use tracing::{error, info};

static POOL: OnceLock<PgPool> = OnceLock::new();

async fn init_pool() -> Result<PgPool> {
    let endpoint = env::var("DSQL_ENDPOINT").expect("DSQL_ENDPOINT required");
    let user = env::var("DSQL_USER").unwrap_or_else(|_| "app_readonly".into());
    let conn_str = format!("postgres://{}@{}/postgres", user, endpoint);
    let config = DsqlConnectOptions::from_connection_string(&conn_str)?;
    let pool = aurora_dsql_sqlx_connector::pool::connect_with(
        &config,
        PgPoolOptions::new()
            .max_connections(2)
            .idle_timeout(None)
            .after_connect(|conn, _meta| {
                Box::pin(async move {
                    conn.execute("SET search_path = 'app'").await?;
                    Ok(())
                })
            }),
    )
    .await?;
    info!("DSQL connection pool initialized (max_connections=2)");
    Ok(pool)
}

async fn get_pool() -> Result<&'static PgPool> {
    if let Some(pool) = POOL.get() {
        return Ok(pool);
    }
    let pool = init_pool().await?;
    Ok(POOL.get_or_init(|| pool))
}

async fn handler(event: Request) -> Result<Response<Body>, Error> {
    // Parse body BEFORE getting pool
    let query = match parse_body(event.body()) {
        Ok(q) => q,
        Err((status, body)) => {
            return error_response(
                status,
                body["error"].as_str().unwrap_or("Invalid request body"),
                body["detail"].as_str(),
            );
        }
    };

    let pool = get_pool().await.map_err(|e| {
        error!(error = %e, "Pool init failed");
        Error::from(e.to_string())
    })?;

    let filter = query.name.unwrap_or_default();
    let pattern = build_search_pattern(&filter);
    let limit = query.limit.unwrap_or(50).min(50) as i64;
    let fetch_limit = limit + 1;

    // Decode cursor if provided
    let cursor = match &query.after {
        Some(c) => match decode_cursor(c) {
            Ok(pair) => Some(pair),
            Err(e) => {
                return error_response(400, "Invalid cursor", Some(&e));
            }
        },
        None => None,
    };

    // Build query with optional cursor and filter
    let rows = match (&cursor, filter.is_empty()) {
        (None, true) => {
            info!("Fetching employees (limit {})", limit);
            sqlx::query(
                "SELECT id::text, name, email, department, title, hire_date::text \
                 FROM employees ORDER BY LOWER(name), id LIMIT $1",
            )
            .bind(fetch_limit)
            .fetch_all(pool)
            .await
        }
        (None, false) => {
            info!(name = %filter, "Searching employees by prefix");
            sqlx::query(
                "SELECT id::text, name, email, department, title, hire_date::text \
                 FROM employees WHERE LOWER(name) LIKE LOWER($1) \
                 ORDER BY LOWER(name), id LIMIT $2",
            )
            .bind(&pattern)
            .bind(fetch_limit)
            .fetch_all(pool)
            .await
        }
        (Some((cursor_name, cursor_id)), true) => {
            info!("Fetching employees after cursor");
            sqlx::query(
                "SELECT id::text, name, email, department, title, hire_date::text \
                 FROM employees WHERE (LOWER(name), id) > (LOWER($1), $2::uuid) \
                 ORDER BY LOWER(name), id LIMIT $3",
            )
            .bind(cursor_name)
            .bind(cursor_id)
            .bind(fetch_limit)
            .fetch_all(pool)
            .await
        }
        (Some((cursor_name, cursor_id)), false) => {
            info!(name = %filter, "Searching employees by prefix after cursor");
            sqlx::query(
                "SELECT id::text, name, email, department, title, hire_date::text \
                 FROM employees WHERE LOWER(name) LIKE LOWER($1) \
                 AND (LOWER(name), id) > (LOWER($2), $3::uuid) \
                 ORDER BY LOWER(name), id LIMIT $4",
            )
            .bind(&pattern)
            .bind(cursor_name)
            .bind(cursor_id)
            .bind(fetch_limit)
            .fetch_all(pool)
            .await
        }
    };

    match rows {
        Ok(rows) => {
            let has_more = rows.len() as i64 > limit;
            let result_rows = if has_more {
                &rows[..limit as usize]
            } else {
                &rows[..]
            };
            let employees: Vec<Employee> = result_rows
                .iter()
                .map(|row| Employee {
                    id: row.get(0),
                    name: row.get(1),
                    email: row.get(2),
                    department: row.get(3),
                    title: row.get(4),
                    hire_date: row.get(5),
                })
                .collect();
            let next_cursor = if has_more {
                employees.last().map(|e| encode_cursor(&e.name, &e.id))
            } else {
                None
            };
            info!(count = employees.len(), has_more, "Query complete");
            success_response(&employees, next_cursor.as_deref())
        }
        Err(e) => {
            error!(error = %e, "Query failed");
            error_response(500, "Internal server error", None)
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    lambda_http::tracing::init_default_subscriber();
    info!("Starting dsql-employee-lookup Lambda");
    run(service_fn(handler)).await
}
