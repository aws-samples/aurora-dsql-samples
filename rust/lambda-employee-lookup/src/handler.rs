use lambda_http::{Body, Error, Response};
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use tracing::{error, info};

use crate::{
    build_search_pattern, decode_cursor, encode_cursor, error_response, parse_body,
    success_response, Employee,
};

/// A validated lookup request, ready to execute after the pool is initialized.
pub struct LookupQuery {
    filter: String,
    cursor: Option<(String, String)>,
    limit: i64,
}

/// Validate every request field before accessing the database or IAM credentials.
pub fn parse_request(body: &Body) -> Result<LookupQuery, (u16, Value)> {
    let query = parse_body(body)?;
    let filter = query.name.unwrap_or_default();
    if filter.contains('\0') {
        return Err((
            400,
            json!({ "error": "Invalid request body", "detail": "name must not contain NUL characters" }),
        ));
    }
    let limit = query.limit.unwrap_or(50);
    if limit == 0 {
        return Err((
            400,
            json!({ "error": "Invalid request body", "detail": "limit must be at least 1" }),
        ));
    }
    let cursor = query
        .after
        .as_deref()
        .map(decode_cursor)
        .transpose()
        .map_err(|detail| (400, json!({ "error": "Invalid cursor", "detail": detail })))?;

    Ok(LookupQuery {
        filter,
        cursor,
        limit: i64::from(limit.min(50)),
    })
}

/// Execute a validated lookup using the application's PostgreSQL connection pool.
pub async fn handle_lookup(query: LookupQuery, pool: &PgPool) -> Result<Response<Body>, Error> {
    let LookupQuery {
        filter,
        cursor,
        limit,
    } = query;
    let pattern = build_search_pattern(&filter);
    let fetch_limit = limit + 1;

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
