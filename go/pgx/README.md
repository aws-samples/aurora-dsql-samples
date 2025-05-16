# Aurora DSQL pgx code examples

## Overview

The code examples in this topic show you how to use DSQL with Go pgx.

## Features

- Uses `dsql.NewFromConfig` to create DSQL clients from AWS configuration
- Supports automatic token refresh to maintain database connectivity
- Implements connection pooling with pgx
- Thread-safe token refresh mechanism
- Demonstrates that connections before and after refresh are different

## Configuration

The following environment variables can be used to configure the connection:

- `CLUSTER_ENDPOINT`: Your Aurora cluster endpoint (required)
- `REGION`: AWS region where your cluster is located (required)
- `CLUSTER_USER`: Database user (defaults to "admin")
- `DB_HOST`: Database host (defaults to CLUSTER_ENDPOINT)
- `DB_PORT`: Database port (defaults to 5432)
- `DB_USER`: Database user (defaults to CLUSTER_USER)
- `DB_NAME`: Database name (defaults to "postgres")
- `DB_USE_IAM`: Whether to use IAM authentication (defaults to false)
- `DB_REFRESH_TOKEN`: Whether to enable token refresh (defaults to true)
- `TOKEN_REFRESH_INTERVAL`: Token refresh interval in seconds (defaults to 900 seconds / 15 minutes)

## Run the examples

### Prerequisites

* Go version >= 1.21
* AWS credentials file is configured

### Setup test running environment

Ensure you are authenticated with AWS credentials. No other setup is needed besides having Go installed.

### Run the example tests

In a terminal run the following commands:

```sh
# Use the account credentials dedicated for golang
export CLUSTER_ENDPOINT="<your cluster endpoint>"
export REGION="<your cluster region>"
go env -w GOPROXY=direct
go test

# you can also run the example directly
go build
./example
```

## Token Refresh

The implementation includes an automatic token refresh mechanism that:

1. Creates a new token before the current one expires (default: every 15 minutes)
2. Updates the connection pool with the new token
3. Ensures all new connections use the refreshed token
4. Handles the refresh process in a thread-safe manner

You can disable token refresh by setting the environment variable `DB_REFRESH_TOKEN=false`.

### Connection Refresh Verification

The code now includes functionality to verify that connections before and after token refresh are different:

1. The `TestTokenRefresh` test captures connection IDs before and after refresh and verifies they are different
2. The `TestMultipleConnectionsRefresh` test checks multiple connections to ensure all are replaced
3. The `TestComprehensiveConnectionRefresh` test provides detailed statistics about the connection pool before and after refresh
4. The example application includes a demonstration of connection refresh that shows the connection IDs changing

When the token is refreshed, the following happens:
- The old connection pool is reset
- A new connection pool is created with the new token
- All existing connections are closed and replaced with new connections
- The new connections have different process IDs on the database server

This ensures that all database operations after a token refresh use fresh connections with valid authentication tokens.

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
