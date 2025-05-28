# Aurora DSQL with pgx

## Overview

This code example demonstrates how to use the `pgx` driver with Amazon Aurora DSQL. The example shows you how to connect to an Aurora DSQL cluster and perform database operations using IAM authentication.

Aurora DSQL is a distributed SQL database service that provides high availability and scalability for your PostgreSQL-compatible applications. `pgx` is a pure Go driver and toolkit for PostgreSQL that offers robust features including automatic connection pool management and authentication token refresh.


## About the code example

The example demonstrates a flexible connection approach using IAM authentication:

- Implements automatic token refresh mechanism to maintain continuous database connectivity
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

- You must have an AWS account, and have your default credentials and AWS Region
  configured as described in the
  [Globally configuring AWS SDKs and tools](https://docs.aws.amazon.com/credref/latest/refdocs/creds-config-files.html)
  guide.
-You must have an Aurora DSQL cluster. For information about creating an Aurora DSQL cluster, see the
      [Getting started with Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html)
      guide.
- If connecting as a non-admin user, ensure the user is linked to an IAM role and is granted access to the `myschema`
  schema. See the
  [Using database roles with IAM roles](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/using-database-and-iam-roles.html)
  guide.
- Go version >= 1.21

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
# Use the account credentials dedicated for golang
go env -w GOPROXY=direct
go test

# you can also run the example directly
go build
./example
```

## Token Refresh

Token Refresh
The implementation includes an automatic token refresh mechanism that:

1. Creates a new token before the current one expires (default: every 15 minutes)

1. Ensures continuous database connectivity

1. Handles token generation and rotation securelye fresh connections with valid authentication tokens.

## Additional resources

- [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
- [AWS SDK for Go Documentation](https://docs.aws.amazon.com/sdk-for-go/)

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
