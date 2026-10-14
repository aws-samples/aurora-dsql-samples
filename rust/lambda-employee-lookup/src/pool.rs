use anyhow::Result;
use aurora_dsql_sqlx_connector::DsqlConnectOptions;
use sqlx::postgres::PgPoolOptions;
use sqlx::{Executor, PgPool};

/// Connect the function's pool with IAM authentication through the connector.
///
/// Each Lambda execution environment keeps at most two connections, and every
/// connection resolves unqualified table names in the `app` schema.
pub async fn connect_pool(endpoint: &str, user: &str) -> Result<PgPool> {
    let conn_str = format!("postgres://{user}@{endpoint}/postgres");
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
    Ok(pool)
}
