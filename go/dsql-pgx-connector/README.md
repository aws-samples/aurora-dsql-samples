# Aurora DSQL pgx Connector for Go

## Overview

A Go connector for Amazon Aurora DSQL that wraps [pgx](https://github.com/jackc/pgx) with automatic IAM authentication. The connector handles token generation, SSL configuration, and connection management so you can focus on your application logic.

## Features

- Automatic IAM token generation with smart caching (refreshes at 80% of token lifetime)
- Connection pooling via `pgxpool` with token caching for efficient connection creation
- Single connection support for simpler use cases
- Flexible host configuration (full endpoint or cluster ID)
- Region auto-detection from endpoint hostname
- Support for AWS profiles and custom credentials providers
- SSL always enabled with `verify-full` mode and direct TLS negotiation
- Connection string parsing support

## Prerequisites

- Go 1.24 or later
- AWS credentials configured (see [Credentials Resolution](#credentials-resolution) below)
- An Aurora DSQL cluster

For information about creating an Aurora DSQL cluster, see the [Getting started with Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html) guide.

### Credentials Resolution

The connector uses the [AWS SDK for Go v2 default credential chain](https://aws.github.io/aws-sdk-go-v2/docs/configuring-sdk/#specifying-credentials), which resolves credentials in the following order:

1. **Environment variables** (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and optionally `AWS_SESSION_TOKEN`)
2. **Shared credentials file** (`~/.aws/credentials`) with optional profile via `AWS_PROFILE` or `Config.Profile`
3. **Shared config file** (`~/.aws/config`)
4. **IAM role for Amazon EC2/ECS/Lambda** (instance metadata or task role)

The first source that provides valid credentials is used. You can override this by specifying `Config.Profile` for a specific AWS profile or `Config.CustomCredentialsProvider` for complete control over credential resolution.

## Installation

```bash
go get github.com/aws-samples/aurora-dsql-samples/go/dsql-pgx-connector/dsql
```

## Configuration Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `Host` | `string` | (required) | Cluster endpoint or cluster ID |
| `Region` | `string` | (auto-detected) | AWS region; required if Host is a cluster ID |
| `User` | `string` | `"admin"` | Database user |
| `Database` | `string` | `"postgres"` | Database name |
| `Port` | `int` | `5432` | Database port |
| `Profile` | `string` | `""` | AWS profile name for credentials |
| `TokenDurationSecs` | `int` | `900` (15 min) | Token validity duration in seconds |
| `CustomCredentialsProvider` | `aws.CredentialsProvider` | `nil` | Custom AWS credentials provider |
| `MaxConns` | `int32` | `0` | Maximum pool connections (0 = pgxpool default) |
| `MinConns` | `int32` | `0` | Minimum pool connections (0 = pgxpool default) |
| `MaxConnLifetime` | `time.Duration` | `55 minutes` | Maximum connection lifetime (aligns with DSQL characteristics) |
| `MaxConnIdleTime` | `time.Duration` | `10 minutes` | Maximum idle time before connection is closed |
| `HealthCheckPeriod` | `time.Duration` | `0` | Interval between health checks |

## Quick Start

```go
package main

import (
    "context"
    "log"

    "github.com/aws-samples/aurora-dsql-samples/go/dsql-pgx-connector/dsql"
)

func main() {
    ctx := context.Background()

    // Create a connection pool
    pool, err := dsql.NewPool(ctx, dsql.Config{
        Host: "your-cluster.dsql.us-east-1.on.aws",
    })
    if err != nil {
        log.Fatal(err)
    }
    defer pool.Close()

    // Execute a query
    var greeting string
    err = pool.QueryRow(ctx, "SELECT 'Hello, DSQL!'").Scan(&greeting)
    if err != nil {
        log.Fatal(err)
    }
    log.Println(greeting)
}
```

## Connection String Format

The connector supports PostgreSQL connection string format:

```
postgres://[user@]host[:port]/[database][?param=value&...]
```

**Supported query parameters:**
- `region` - AWS region
- `profile` - AWS profile name
- `tokenDurationSecs` - Token validity duration in seconds

**Examples:**

```go
// Full endpoint (region auto-detected)
pool, _ := dsql.NewPool(ctx, "postgres://admin@cluster.dsql.us-east-1.on.aws/postgres")

// With explicit region
pool, _ := dsql.NewPool(ctx, "postgres://admin@cluster.dsql.us-east-1.on.aws/mydb?region=us-east-1")

// With AWS profile
pool, _ := dsql.NewPool(ctx, "postgres://admin@cluster.dsql.us-east-1.on.aws/postgres?profile=dev")
```

## Advanced Usage

### Host Configuration

The connector supports two host formats:

**Full endpoint** (region auto-detected):
```go
pool, _ := dsql.NewPool(ctx, dsql.Config{
    Host: "your-cluster.dsql.us-east-1.on.aws",
})
```

**Cluster ID** (region required):
```go
pool, _ := dsql.NewPool(ctx, dsql.Config{
    Host:   "your-cluster-id",
    Region: "us-east-1",
})
```

If using a cluster ID, the region can also be set via `AWS_REGION` or `AWS_DEFAULT_REGION` environment variables.

### Custom Credentials Provider

For cross-account access or other credential scenarios:

```go
// Create an assume-role credentials provider
credsProvider, err := dsql.NewAssumeRoleCredentialsProvider(
    ctx,
    "arn:aws:iam::123456789012:role/DSQLAccessRole",
    "us-east-1",
)
if err != nil {
    log.Fatal(err)
}

pool, err := dsql.NewPool(ctx, dsql.Config{
    Host:                      "your-cluster.dsql.us-east-1.on.aws",
    CustomCredentialsProvider: credsProvider,
})
```

### Pool Configuration Tuning

Configure the connection pool for your workload:

```go
pool, err := dsql.NewPool(ctx, dsql.Config{
    Host:              "your-cluster.dsql.us-east-1.on.aws",
    MaxConns:          20,
    MinConns:          5,
    MaxConnLifetime:   time.Hour,
    MaxConnIdleTime:   30 * time.Minute,
    HealthCheckPeriod: time.Minute,
})
```

### Single Connection Usage

For simple scripts or when connection pooling is not needed:

```go
conn, err := dsql.Connect(ctx, dsql.Config{
    Host: "your-cluster.dsql.us-east-1.on.aws",
})
if err != nil {
    log.Fatal(err)
}
defer conn.Close(ctx)

// Use the connection
rows, err := conn.Query(ctx, "SELECT * FROM users")
```

### Using AWS Profiles

Specify an AWS profile for credentials:

```go
pool, err := dsql.NewPool(ctx, dsql.Config{
    Host:    "your-cluster.dsql.us-east-1.on.aws",
    Profile: "production",
})
```

## Token Generation and Caching

The connector automatically generates and caches IAM authentication tokens for optimal performance:

- **Connection pools**: Tokens are cached and reused across connections. The `BeforeConnect` hook retrieves tokens from the cache, generating new ones only when the cached token has used 80% of its lifetime (similar to the Java connector's approach). This ensures tokens remain valid while minimizing credential calls.
- **Single connections**: A token is generated at connection time using pre-resolved credentials.
- **Credentials resolution**: AWS credentials are resolved once when the pool/connection is created and reused for all token generations, avoiding repeated credential chain resolution.

For the `admin` user, the connector generates admin tokens using `GenerateDBConnectAdminAuthToken`. For other users, it generates standard tokens using `GenerateDbConnectAuthToken`.

Token duration defaults to 15 minutes (the maximum allowed by Aurora DSQL).

## Development

### Build

```bash
cd go/dsql-pgx-connector
go build ./...
```

### Run Tests

Unit tests (no cluster required):

```bash
go test ./dsql/...
```

Integration tests (requires a DSQL cluster):

```bash
export CLUSTER_ENDPOINT="your-cluster.dsql.us-east-1.on.aws"
go test ./example/test/...
```

### Lint

```bash
golangci-lint run
```

## Additional Resources

- [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
- [pgx Documentation](https://pkg.go.dev/github.com/jackc/pgx/v5)
- [pgxpool Documentation](https://pkg.go.dev/github.com/jackc/pgx/v5/pgxpool)
- [AWS SDK for Go v2](https://aws.github.io/aws-sdk-go-v2/)

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: Apache-2.0
