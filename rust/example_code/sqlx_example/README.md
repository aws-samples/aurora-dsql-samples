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

1. Add sqlx to your Cargo.toml dependencies, for example `sqlx = { version = "0.8", features = [ "runtime-tokio", "tls-native-tls" , "postgres"] }`. 
2. Add the Amazon DSQL Rust SDK to your Cargo.toml file. [DSQL Rust SDK location TBA]
3. Ensure you are authenticated with AWS credentials.

### Connect to a cluster

``` rs
mod generate_token;
use anyhow::Error;
use aws_config::default_provider::credentials::DefaultCredentialsChain;
use sqlx::{PgPool, Row};
use sqlx::postgres::PgConnectOptions;
use generate_token::generate_db_auth_token;

async fn connect_to_cluster_pool(cluster_endpoint: &str, region: &str) -> Result<PgPool, Error> {
    let token = generate_token(cluster_endpoint, region);

    let connection_options = PgConnectOptions::new()
        .host(cluster_endpoint)
        .port(5432)
        .database("postgres")
        .username("admin")
        .password(&token);

    let pool = PgPool::connect_with(connection_options).await?;
    Ok(pool)
}

async fn generate_token(cluster_endpoint: &str, region: &str) -> Result<String, Error> {
    let chain =  DefaultCredentialsChain::builder().build().await;
    let token = generate_db_auth_token(
        cluster_endpoint,
        region,
        chain,
        None // Optionally specify token expiry time
    ).await?;

    Ok(token)
}
```

## Execute Examples

### SQL CRUD Examples

> [!Important]
>
> To execute the example code, you need to have valid AWS Credentials configured (e.g. AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN)

#### 1. Create Owner Table

```rs
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

```
#### 2. Create Owner

```rs
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
```

#### 3. Read Owner

```rs
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
```

#### 4. Update Owner

```rs
async fn update_data(pool: &PgPool) -> Result<(), Error> {
    sqlx::query("UPDATE owner SET telephone='7811230000' WHERE name='Andrew'").execute(&*pool).await?;

    let rows = sqlx::query("SELECT telephone FROM owner WHERE name='Andrew'").fetch_all(&*pool).await?;

    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].try_get::<&str, _>("telephone")?, "7811230000");
    println!("Updated 1 row in owner");
    Ok(())
}
```

#### 5. Delete Owner

```rs
async fn delete_data(pool: &PgPool) -> Result<(), Error> {
    sqlx::query("DELETE FROM OWNER WHERE telephone='7811230000'").execute(&*pool).await?;

    let rows = sqlx::query("SELECT * FROM owner WHERE telephone='7811230000'").fetch_all(&*pool).await?;

    assert!(rows.is_empty());
    println!("Deleted 1 row in owner");
    Ok(())
}
```
---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 

SPDX-License-Identifier: Apache-2.0
