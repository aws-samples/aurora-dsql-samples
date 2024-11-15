# How to connect to Amazon Distributed SQL and execute queries using Rust

## Overview

The code examples in this topic show you how to use Amazon Distributed SQL with Rust sqlx. 

## Run the examples

### Prerequisites

* You must have an AWS account, and have your default credentials and AWS Region configured as described in the 
[AWS Tools and SDKs Shared Configuration and Credentials Reference Guide](https://docs.aws.amazon.com/credref/latest/refdocs/creds-config-files.html).
* [Rust 1.80 or later](https://www.rust-lang.org/tools/install) -  You can verify your Rust installation with `rustc --version` 
* You must have already provisioned a Aurora DSQL cluster following the [user guide](TBD)

### Setup test running environment 

1. Add sqlx to your Cargo.toml dependencies, for example 
```
tokio = { version = "1.28", features = ["full"] }
sqlx = { version = "0.8", features = [ "runtime-tokio", "tls-rustls" , "postgres", "uuid"] }
anyhow = { version = "1", features = ["backtrace"] }
aws-config = "1.1"
aws-credential-types = "1.1"
aws-sigv4 = "1.1"
rand = "0.8"
url = "2.5"
uuid = { version = "1.11", features = ["v4"] }
``` 
2. Add the Amazon DSQL Rust SDK to your Cargo.toml file. [Aurora DSQL Rust SDK location TBA]
3. Ensure you are authenticated with AWS credentials.

### Example using rust with sqlx to interact with Aurora DSQL

``` rs
mod generate_token;
use aws_config::default_provider::credentials::DefaultCredentialsChain;
use sqlx::Row;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use rand::Rng;
use uuid::Uuid;
use generate_token::generate_db_connect_admin_auth_token;

async fn example() -> anyhow::Result<()> {
    // Please replace with your own cluster endpoint
    let cluster_endpoint = "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws";
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
    
    // Insert an owner with a random telephone number
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

    pool.close().await;
    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    Ok(example().await?)
}
```

[!important]
>
> Nested transactions are not supported with SQLX because, nested transactions
> require support for savepoints. During preview Aurora DSQL does not support 
> savepoints
---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 

SPDX-License-Identifier: Apache-2.0
