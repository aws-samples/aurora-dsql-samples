// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

use aurora_dsql_sqlx_connector::{txn, DsqlConnectOptions, OCCRetryExt};
use sqlx::postgres::PgPoolOptions;
use sqlx::{Executor, Row};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cluster_endpoint = std::env::var("CLUSTER_ENDPOINT")
        .expect("CLUSTER_ENDPOINT environment variable is not set");
    let cluster_user = std::env::var("CLUSTER_USER").unwrap_or_else(|_| "admin".to_string());

    let conn_str = format!("postgres://{}@{}/postgres", cluster_user, cluster_endpoint);

    // Admin users operate in the default "public" schema.
    // Non-admin users operate in a custom "myschema" schema.
    let schema = if cluster_user == "admin" {
        "public"
    } else {
        "myschema"
    };

    // Build config and create a pool with custom options.
    // connect_with() verifies connectivity and spawns a background token refresh task.
    let config = DsqlConnectOptions::from_connection_string(&conn_str)?;
    let schema_owned = schema.to_string();
    let mut pool = aurora_dsql_sqlx_connector::pool::connect_with(
        &config,
        PgPoolOptions::new()
            .max_connections(10)
            .after_connect(move |conn, _meta| {
                let schema = schema_owned.clone();
                Box::pin(async move {
                    conn.execute(format!("SET search_path = '{}'", schema).as_str())
                        .await?;
                    Ok(())
                })
            }),
    )
    .await?;

    // -- Concurrent read queries --
    let mut handles = Vec::new();
    for i in 0..5 {
        let pool = pool.clone();
        handles.push(tokio::spawn(async move {
            let row = sqlx::query("SELECT $1::int as value")
                .bind(i)
                .fetch_one(&pool)
                .await?;
            Ok::<i32, anyhow::Error>(row.get("value"))
        }));
    }

    for handle in handles {
        let result = handle.await??;
        println!("Worker result: {}", result);
    }

    println!("Concurrent pool operations completed successfully");

    // -- Setup table --
    pool.execute(
        "CREATE TABLE IF NOT EXISTS owner(
            id uuid NOT NULL DEFAULT gen_random_uuid(),
            name varchar(30) NOT NULL,
            city varchar(80) NOT NULL,
            PRIMARY KEY (id))",
    )
    .await?;

    // -- Transactional write WITH OCC retry (using trait and txn! macro) --
    pool.transaction_with_retry(None, |tx| {
        txn!({
            sqlx::query("INSERT INTO owner(name, city) VALUES($1, $2)")
                .bind("John Doe")
                .bind("Anytown")
                .execute(&mut **tx)
                .await?;
            Ok(())
        })
    })
    .await?;

    // Verify the write
    let row = sqlx::query("SELECT name, city FROM owner WHERE name = $1")
        .bind("John Doe")
        .fetch_one(&pool)
        .await?;

    let name: &str = row.get("name");
    let city: &str = row.get("city");
    println!("Inserted: name={}, city={}", name, city);

    // -- Transactional write WITHOUT OCC retry (opt-out) --
    // For operations that don't need retry, use sqlx directly
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM owner WHERE name = $1")
        .bind("John Doe")
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    println!("Transactional write completed successfully");

    // Closing the pool stops the background refresh task.
    pool.close().await;

    Ok(())
}
