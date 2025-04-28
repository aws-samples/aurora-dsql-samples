use std::time::Duration;

use aws_config::{BehaviorVersion, Region};
use aws_sdk_dsql::auth_token::{AuthTokenGenerator, Config};
use rand::Rng;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::Row;
use tokio::time;
use uuid::Uuid;

async fn example(cluster_endpoint: String, region: String) -> anyhow::Result<()> {
    // Generate auth token
    let sdk_config = aws_config::load_defaults(BehaviorVersion::latest()).await;
    let signer = AuthTokenGenerator::new(
        Config::builder()
            .hostname(&cluster_endpoint)
            .region(Region::new(region))
            .expires_in(900)
            .build()
            .unwrap(),
    );
    let password_token = signer
        .db_connect_admin_auth_token(&sdk_config)
        .await
        .unwrap();

    // Setup connections
    let connection_options = PgConnectOptions::new()
        .host(cluster_endpoint.as_str())
        .port(5432)
        .database("postgres")
        .username("admin")
        .password(password_token.as_str())
        .ssl_mode(sqlx::postgres::PgSslMode::VerifyFull);

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect_with(connection_options.clone())
        .await?;

    // XXX: Periodically refresh the password by regenerating the token. This
    // runs every 10 minutes and provides a token valid for 15 minutes.
    let _pool = pool.clone(); // Pool uses an Arc internally
    tokio::spawn(async move {
        loop {
            time::sleep(Duration::from_secs(600)).await;
            let password_token = signer
                .db_connect_admin_auth_token(&sdk_config)
                .await
                .unwrap();
            let connect_options_with_new_token =
                connection_options.clone().password(password_token.as_str());
            _pool.set_connect_options(connect_options_with_new_token);
        }
    });

    // Create owners table
    // To avoid Optimistic concurrency control (OCC) conflicts
    // Have this table created already.
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS owner (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name VARCHAR(255),
			city VARCHAR(255),
			telephone VARCHAR(255)
		)").execute(&pool).await?;    
    
    // Insert some data
    let id = Uuid::new_v4();
    let telephone = rand::thread_rng()
        .gen_range(123456..987654)
        .to_string();
    let result = sqlx::query("INSERT INTO owner (id, name, city, telephone) VALUES ($1, $2, $3, $4)")
        .bind(id)
        .bind("John Doe")
        .bind("Anytown")
        .bind(telephone.as_str())
        .execute(&pool)
        .await?;
    assert_eq!(result.rows_affected(), 1);

    // Read data back
    let rows = sqlx::query("SELECT * FROM owner WHERE id=$1").bind(id).fetch_all(&pool).await?;
    println!("{:?}", rows);

    assert_eq!(rows.len(), 1);
    let row = &rows[0];
    assert_eq!(row.try_get::<&str, _>("name")?, "John Doe");
    assert_eq!(row.try_get::<&str, _>("city")?, "Anytown");
    assert_eq!(row.try_get::<&str, _>("telephone")?, telephone);

    sqlx::query("DELETE FROM owner WHERE name='John Doe'")
        .execute(&pool).await?;

    pool.close().await;
    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cluster_endpoint = std::env::var("CLUSTER_ENDPOINT").unwrap();
    let region = std::env::var("REGION").unwrap();
    Ok(example(cluster_endpoint, region).await?)
}

#[cfg(test)]
mod tests {

    use super::*;
    use tokio::test;

    #[test]
    async fn test_crud() {
        let cluster_endpoint = std::env::var("CLUSTER_ENDPOINT").unwrap();
        let region = std::env::var("REGION").unwrap();
        let result = example(cluster_endpoint, region).await;
        assert!(result.is_ok());
        println!("Successfully completed test run.");
    }
}
