# Aurora DSQL with pgx

## Overview

This code example demonstrates how to use the `pgx` driver with Amazon Aurora DSQL. The example shows you how to connect
to an Aurora DSQL cluster and perform database operations using IAM authentication.

Aurora DSQL is a distributed SQL database service that provides high availability and scalability for your
PostgreSQL-compatible applications. `pgx` is a pure Go driver and toolkit for PostgreSQL that offers robust features
including automatic connection pool management and authentication token refresh.

## About the code example

The example demonstrates a flexible connection approach using IAM authentication:

- Implements automatic token generation for new connections
- Handles secure IAM-based authentication token generation
- Provides connection pooling and management
- Demonstrates best practices for Aurora DSQL connectivity in Go applications

## ⚠️ Important

- Running this code might result in charges to your AWS account.
- We recommend that you grant your code least privilege. At most, grant only the
  minimum permissions required to perform the task. For more information, see
  Grant least privilege in the AWS IAM User Guide.
- This code is not tested in every AWS Region. For more information, see
  AWS Regional Services.

## TLS connection configuration

This example uses direct TLS connections where supported, and verifies the server certificate is trusted. Verified SSL
connections should be used where possible to ensure data security during transmission.

* Driver versions following the release of PostgreSQL 17 support direct TLS connections, bypassing the traditional
  PostgreSQL connection preamble
* Direct TLS connections provide improved connection performance and enhanced security
* Not all PostgreSQL drivers support direct TLS connections yet, or only in recent versions following PostgreSQL 17
* Ensure your installed driver version supports direct TLS negotiation, or use a version that is at least as recent as
  the one used in this sample
* If your driver doesn't support direct TLS connections, you may need to use the traditional preamble connection instead

## Configuration

The following environment variables can be used to configure the connection parameter in this example:

- `CLUSTER_ENDPOINT`: Your Aurora DSQL cluster endpoint (required)
- `CLUSTER_USER`: Database user (required)
- `REGION`: AWS region where your cluster is located (required)
- `DB_PORT`: Database port (defaults to 5432)
- `DB_NAME`: Database name (defaults to "postgres")

## Run the examples

### Prerequisites

- You must have an AWS account, and have your default credentials and AWS Region
  configured as described in the
  [Globally configuring AWS SDKs and tools](https://docs.aws.amazon.com/credref/latest/refdocs/creds-config-files.html)
  guide.
- You must have an Aurora DSQL cluster. For information about creating an Aurora DSQL cluster, see the
  [Getting started with Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html)
  guide.
- If connecting as a non-admin user, ensure the user is linked to an IAM role and is granted access to the `myschema`
  schema. See the
  [Using database roles with IAM roles](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/using-database-and-iam-roles.html)
  guide.
- Go version >= 1.24

### Setup test running environment

Ensure you are authenticated with AWS credentials. No other setup is needed besides having Go installed.

### Environment Variables

Set the following required environment variables:

```shell
# Your cluster endpoint (e.g., "cluster-name.cluster-xxx.region.rds.amazonaws.com")
export CLUSTER_ENDPOINT="<your cluster endpoint>"

# Your AWS region (e.g., "us-east-1")
export REGION="<your cluster region>"
```

### Run the example tests

In a terminal run the following commands:

```sh
# Run the unit tests
go env -w GOPROXY=direct
go test

# Run the example directly
go build -o example
./example
```

## Token Generation

The implementation includes an automatic token generation mechanism for new connections. This ensures continuous
database connectivity for the pool. Lazily created connections will generate a new authentication token before
connecting. Similarly, replacement connections for those exceeding the pool connection
lifetime will generate their own fresh authentication token.

## Additional resources

- [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
- [pgx Documentation](https://pkg.go.dev/github.com/jackc/pgx/v5)

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
