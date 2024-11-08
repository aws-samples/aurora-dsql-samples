mod generate_token;
use anyhow::Error;
use aws_config::default_provider::credentials::DefaultCredentialsChain;
use sqlx::{PgPool, Row};
use sqlx::postgres::PgConnectOptions;
use generate_token::generate_db_auth_token;

async fn connect_to_cluster_pool(cluster_endpoint: &str, region: &str) -> Result<PgPool, Error> {
    let token = generate_token(cluster_endpoint, region).await?;

    let connection_options = PgConnectOptions::new()
        .host(cluster_endpoint)
        .port(5432)
        .database("postgres")
        .username("admin")
        .password(&token)
        .ssl_mode(sqlx::postgres::PgSslMode::Require);

    let pool = PgPool::connect_with(connection_options).await?;
    Ok(pool)
}

async fn crud() -> Result<(), Box<dyn std::error::Error>> {
    let cluster_endpoint = "weabtsifkc4hc6uk6kmdprr3si.c0001.us-east-1.prod.sql.axdb.aws.dev";
    let region = "us-east-1";
    let mut pool = connect_to_cluster_pool(cluster_endpoint, region).await?;

        
    create_table(&pool).await?;
    pool.close().await;

    // Closing and re-opening connection to prevent OC001 error
    pool = connect_to_cluster_pool(cluster_endpoint, region).await?;

    insert_data(&pool).await?;
    fetch_data(&pool).await?;
    update_data(&pool).await?;
    delete_data(&pool).await?;

    pool.close().await;
    Ok(())
}

async fn create_table(pool: &PgPool) -> Result<(), Error> {
    sqlx::query("DROP TABLE IF EXISTS owner").execute(&*pool).await?;
    sqlx::query(
        "CREATE TABLE owner(
            id UUID NOT NULL DEFAULT gen_random_uuid(),
            name VARCHAR(30) NOT NULL,
            city VARCHAR(80) NOT NULL,
            telephone VARCHAR(20) DEFAULT NULL,
            PRIMARY KEY (id)
        )").execute(&*pool).await?;
    println!("Created table owner");
    Ok(())
}

async fn insert_data(pool: &PgPool) -> Result<(), Error> {
    sqlx::query(
        "INSERT INTO owner(name, city, telephone) VALUES('Andrew', 'Vancouver', '6239087654')")
        .execute(&*pool)
        .await?;
    sqlx::query(
        "INSERT INTO owner(name, city) VALUES('Charles', 'Richmond')")
        .execute(&*pool)
        .await?;
    sqlx::query(
        "INSERT INTO owner(name, city, telephone) VALUES('Zoya', 'Langley', '6230005678')")
        .execute(&*pool)
        .await?;

    println!("Inserted 3 rows into owner");
    Ok(())
}

async fn fetch_data(pool: &PgPool) -> Result<(), Error> {
    let rows = sqlx::query("SELECT * FROM owner WHERE name='Andrew'").fetch_all(&*pool).await?;

    assert_eq!(rows.len(), 1);
    let row = &rows[0];
    assert_eq!(row.try_get::<&str, _>("name")?, "Andrew");
    assert_eq!(row.try_get::<&str, _>("city")?, "Vancouver");
    assert_eq!(row.try_get::<&str, _>("telephone")?, "6239087654");
    println!("Retrieved one row from owner: {:#?}", row);    
    Ok(())
}

async fn update_data(pool: &PgPool) -> Result<(), Error> {
    sqlx::query("UPDATE owner SET telephone='7811230000' WHERE name='Andrew'").execute(&*pool).await?;

    let rows = sqlx::query("SELECT telephone FROM owner WHERE name='Andrew'").fetch_all(&*pool).await?;

    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].try_get::<&str, _>("telephone")?, "7811230000");
    println!("Updated 1 row in owner");
    Ok(())
}

async fn delete_data(pool: &PgPool) -> Result<(), Error> {
    sqlx::query("DELETE FROM OWNER WHERE telephone='7811230000'").execute(&*pool).await?;

    let rows = sqlx::query("SELECT * FROM owner WHERE telephone='7811230000'").fetch_all(&*pool).await?;

    assert!(rows.is_empty());
    println!("Deleted 1 row in owner.");
    Ok(())
}

async fn generate_token(cluster_endpoint: &str, region: &str) -> Result<String, Error> {
    let expire_time = std::time::Duration::new(900, 0); // 900 second expiry
    let chain =  DefaultCredentialsChain::builder().build().await;
    let token = generate_db_auth_token(
        cluster_endpoint,
        expire_time,
        region,
        chain,
    ).await?;

    Ok(token)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    crud().await
}

#[cfg(test)]
mod tests {

    use super::*;
    use tokio::test;

    #[test]
    async fn test_crud() {
        let result = crud().await;
        assert!(result.is_ok())
    }
}
