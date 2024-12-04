/*
 Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.

 Licensed under the Apache License, Version 2.0 (the "License").
 You may not use this file except in compliance with the License.
 A copy of the License is located at

     http://www.apache.org/licenses/LICENSE-2.0

 or in the "license" file accompanying this file. This file is distributed
 on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 express or implied. See the License for the specific language governing
 permissions and limitations under the License.
 */

use aws_config::{BehaviorVersion, Region};
use aws_sdk_dsql::auth_token::{AuthTokenGenerator, Config};
use rand::Rng;
use sqlx::Row;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use uuid::Uuid;

async fn example(cluster_endpoint: String, region: String) -> anyhow::Result<()> {
    // Generate auth token
    let sdk_config = aws_config::load_defaults(BehaviorVersion::latest()).await;
    let signer = AuthTokenGenerator::new(
        Config::builder()
            .hostname(&cluster_endpoint)
            .region(Region::new(region))
            .build()
            .unwrap(),
    );
    let password_token = signer.db_connect_admin_auth_token(&sdk_config).await.unwrap();

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
