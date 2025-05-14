use aws_config::{BehaviorVersion, Region, SdkConfig};
use aws_sdk_dsql::auth_token::{AuthToken, AuthTokenGenerator, Config};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{Pool, Postgres, Row};
use std::time::Duration;
use tokio::time;

const SECONDS_PER_MINUTE: u64 = 60;

const TOKEN_EXPIRATION_MINUTES: u64 = 15;
const TOKEN_EXPIRATION_SECONDS: u64 = TOKEN_EXPIRATION_MINUTES * SECONDS_PER_MINUTE;

const TOKEN_REFRESH_MINUTES: u64 = TOKEN_EXPIRATION_MINUTES - 5;
const TOKEN_REFRESH_SECONDS: u64 = TOKEN_REFRESH_MINUTES * SECONDS_PER_MINUTE;

const _: () = assert!(
    TOKEN_EXPIRATION_MINUTES > TOKEN_REFRESH_MINUTES,
    "Token expiration time must be greater than refresh time"
);

async fn generate_password_token(
    cluster_user: &str,
    signer: &AuthTokenGenerator,
    sdk_config: &SdkConfig,
) -> AuthToken {
    if cluster_user == "admin" {
        signer
            .db_connect_admin_auth_token(sdk_config)
            .await
            .unwrap()
    } else {
        signer.db_connect_auth_token(sdk_config).await.unwrap()
    }
}

/// Established a pooled connection with periodic credential refresh.
async fn establish_connection(
    cluster_user: String,
    cluster_endpoint: String,
    region: String,
) -> anyhow::Result<Pool<Postgres>> {
    let sdk_config = aws_config::load_defaults(BehaviorVersion::latest()).await;
    let signer = AuthTokenGenerator::new(
        Config::builder()
            .hostname(&cluster_endpoint)
            .region(Region::new(region))
            .expires_in(TOKEN_EXPIRATION_SECONDS)
            .build()
            .unwrap(),
    );

    let password_token = generate_password_token(&cluster_user, &signer, &sdk_config).await;
    let schema = match cluster_user.as_str() {
        "admin" => "public",
        _ => "myschema",
    };

    let connection_options = PgConnectOptions::new()
        .host(&cluster_endpoint)
        .port(5432)
        .database("postgres")
        .username(&cluster_user)
        .password(password_token.as_str())
        .ssl_mode(sqlx::postgres::PgSslMode::VerifyFull);

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .after_connect(move |conn, _meta| {
            Box::pin(async move {
                sqlx::query(format!("SET search_path = {}", schema).as_str())
                    .execute(conn)
                    .await
                    .map(|_| ())
            })
        })
        .connect_with(connection_options.clone())
        .await?;

    // Periodically refresh the password by regenerating the token. This runs every
    // TOKEN_REFRESH_MINUTES and provides a token valid for TOKEN_EXPIRATION_MINUTES.
    let _pool = pool.clone(); // Pool uses an Arc internally
    tokio::spawn(async move {
        loop {
            time::sleep(Duration::from_secs(TOKEN_REFRESH_SECONDS)).await;

            let password_token = generate_password_token(&cluster_user, &signer, &sdk_config).await;
            let connect_options_with_new_token =
                connection_options.clone().password(password_token.as_str());
            _pool.set_connect_options(connect_options_with_new_token);
        }
    });

    Ok(pool)
}

/// Run some example operations against the provided pool.
async fn exercise_connection(pool: &Pool<Postgres>) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS owner (
            id UUID NOT NULL DEFAULT gen_random_uuid(),
            name VARCHAR(30) NOT NULL,
            city VARCHAR(80) NOT NULL,
            telephone VARCHAR(20) DEFAULT NULL,
            PRIMARY KEY (id)
        )"#,
    )
    .execute(pool)
    .await?;

    // Insert some data
    sqlx::query("INSERT INTO owner (name, city, telephone) VALUES ($1, $2, $3)")
        .bind("John Doe")
        .bind("Anytown")
        .bind("555-555-1999")
        .execute(pool)
        .await?;

    let rows = sqlx::query("SELECT * FROM owner WHERE name=$1")
        .bind("John Doe")
        .fetch_all(pool)
        .await?;

    // Verify the result is what we inserted before
    assert_eq!(rows.len(), 1);
    let row = &rows[0];
    assert_eq!(row.try_get::<&str, _>("name")?, "John Doe");
    assert_eq!(row.try_get::<&str, _>("city")?, "Anytown");
    assert_eq!(row.try_get::<&str, _>("telephone")?, "555-555-1999");

    // Clean up the table after the example. If we run the example again we do not have to worry
    // about data inserted by previous runs
    sqlx::query("DELETE FROM owner WHERE name = 'John Doe'")
        .execute(pool)
        .await?;

    Ok(())
}

#[tokio::main]
pub async fn main() -> Result<(), anyhow::Result<()>> {
    let cluster_user =
        std::env::var("CLUSTER_USER").expect("env variable `CLUSTER_USER` should be set");
    let cluster_endpoint =
        std::env::var("CLUSTER_ENDPOINT").expect("env variable `CLUSTER_ENDPOINT` should be set");
    let region = std::env::var("REGION").expect("env variable `REGION` should be set");

    let pool = establish_connection(cluster_user, cluster_endpoint, region)
        .await
        .unwrap();
    exercise_connection(&pool).await.unwrap();
    pool.close().await;

    println!("Connection exercised successfully");

    Ok(())
}
