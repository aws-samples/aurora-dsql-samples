mod generate_token;
use aws_config::default_provider::credentials::DefaultCredentialsChain;
use sqlx::Row;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use rand::Rng;
use uuid::Uuid;
use generate_token::generate_db_connect_admin_auth_token;

async fn example() -> anyhow::Result<()> {
    let cluster_endpoint = "5uabttnsej36jfsinjjjhlbcnm.dsql-gamma.us-east-1.on.aws";
    let region = "us-east-1";

    // Generate auth token
    let token = generate_db_connect_admin_auth_token(
        cluster_endpoint,
        region,
        DefaultCredentialsChain::builder().build().await,
        None
    ).await?;

    // Setup connections
    let connection_options = PgConnectOptions::new()
        .host(cluster_endpoint)
        .port(5432)
        .database("postgres")
        .username("admin")
        .password(&token)
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
    Ok(example().await?)
}

#[cfg(test)]
mod tests {

    use super::*;
    use tokio::test;

    #[test]
    async fn test_crud() {
        let result = example().await;
        assert!(result.is_ok())
    }
}
