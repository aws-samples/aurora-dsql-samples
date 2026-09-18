# Aurora DSQL Rust Lambda Employee Lookup

## Overview

This code example shows you how to build a serverless Employee Directory API using Rust on AWS Lambda, backed by Aurora DSQL. It demonstrates connecting to Aurora DSQL using the [Aurora DSQL SQLx Connector](https://github.com/awslabs/aurora-dsql-connectors/tree/main/rust/sqlx) with automatic IAM authentication, connection pooling, and TLS.

The Lambda function exposes a `POST /lookup` endpoint via API Gateway that queries an `employees` table with optional name filtering.

## Run the example

> ⚠️ **Important**
>
> - Running this code might result in charges to your AWS account.
> - We recommend that you grant your code [least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege). At most, grant only the minimum permissions required to perform the task.
> - This code is not tested in every AWS Region. For more information, see [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/).

### Prerequisites

- You must have an AWS account, and have your default credentials and AWS Region configured as described in [Globally configuring AWS SDKs and tools](https://docs.aws.amazon.com/sdkref/latest/refdocs/creds-config-files.html).
- You must have [Rust & Cargo](https://rustup.rs/) installed (1.94.1 or later).
- You must have [cargo-lambda](https://www.cargo-lambda.info/) installed.
- You must have [Docker](https://docs.docker.com/get-docker/) or [Finch](https://runfinch.com/) installed and running (for building on macOS).
- You must have [jq](https://jqlang.github.io/jq/) installed.
- You must have an Aurora DSQL cluster. See [Getting started with Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html).

### Configure the environment

Set environment variables with your cluster details:

```bash
# e.g. "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws"
export DSQL_ENDPOINT="<your cluster endpoint>"

# e.g. "us-east-1"
export AWS_REGION="<your region>"
```

### Seed the database

Connect to your Aurora DSQL cluster via the Query Editor in the AWS Console or via `psql`, then run the SQL in `seed.sql`:

```bash
TOKEN=$(aws dsql generate-db-connect-admin-auth-token \
  --hostname $DSQL_ENDPOINT --region $AWS_REGION)

PGPASSWORD=$TOKEN psql \
  "host=$DSQL_ENDPOINT port=5432 dbname=postgres user=admin sslmode=require" \
  -f seed.sql
```

### Deploy

This example supports two deployment approaches: **container image** (recommended) and **zip package**.

#### Option 1: Container image (recommended)

Deploys Lambda as a container image pushed to ECR. No 250MB size limit.

| Tool | File |
|------|------|
| AWS CLI (Linux) | `deploy/container/setup.sh` |
| AWS CLI (macOS + Finch) | `setup-finch.sh` |
| AWS CLI (macOS + Docker) | `setup-docker.sh` |
| CloudFormation | `deploy/container/cloudformation.yaml` |
| Terraform | `deploy/container/main.tf` |

```bash
# Linux
cd deploy/container && chmod +x setup.sh && ./setup.sh

# macOS (Apple Silicon)
chmod +x setup-finch.sh && ./setup-finch.sh
```

#### Option 2: Zip package

Deploys Lambda as a `.zip` file. Requires `[profile.release]` settings to keep binary under 250MB.

| Tool | File |
|------|------|
| AWS CLI (Linux) | `deploy/zip/setup.sh` |
| CloudFormation | `deploy/zip/cloudformation.yaml` |
| Terraform | `deploy/zip/main.tf` |

```bash
cd deploy/zip && chmod +x setup.sh && ./setup.sh
```

### Test the API

```bash
# Search for an employee by name
curl -X POST https://<API_ENDPOINT>/lookup \
  -H 'Content-Type: application/json' \
  -d '{"name": "Alice"}'

# List all employees
curl -X POST https://<API_ENDPOINT>/lookup \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Or use the test script:

```bash
chmod +x test-api.sh && ./test-api.sh
```

### Clean up

Teardown commands are printed at the end of each setup script. Alternatively:

```bash
# Container approach
aws lambda delete-function --function-name dsql-employee-lookup --region us-east-1
aws apigatewayv2 delete-api --api-id <API_ID> --region us-east-1
aws ecr delete-repository --repository-name dsql-employee-lookup --force --region us-east-1
aws dsql delete-cluster --identifier <CLUSTER_ID> --region us-east-1

# Zip approach (no ECR cleanup needed)
aws lambda delete-function --function-name dsql-employee-lookup --region us-east-1
aws apigatewayv2 delete-api --api-id <API_ID> --region us-east-1
aws dsql delete-cluster --identifier <CLUSTER_ID> --region us-east-1
```

## Project structure

```
├── src/main.rs           # Lambda function handler + DSQL connection pool
├── Cargo.toml            # Rust dependencies
├── Dockerfile            # Container image definition for Lambda
├── seed.sql              # Database schema + sample employee data
├── test-api.sh           # API test script
├── setup-finch.sh        # macOS deployment (Finch)
├── setup-docker.sh       # macOS deployment (Docker)
└── deploy/
    ├── container/        # Container image deployment
    │   ├── setup.sh
    │   ├── cloudformation.yaml
    │   └── main.tf
    └── zip/              # Zip deployment
        ├── setup.sh
        ├── cloudformation.yaml
        └── main.tf
```

## Additional information

- [Aurora DSQL Connector for Rust SQLx](https://github.com/awslabs/aurora-dsql-connectors/tree/main/rust/sqlx)
- [Aurora DSQL User Guide](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/)
- [AWS Lambda Rust Runtime](https://github.com/awslabs/aws-lambda-rust-runtime)
- [Aurora DSQL launches Rust and .NET connectors](https://aws.amazon.com/about-aws/whats-new/2026/03/aurora-dsql-rust-npgsql-connectors/)

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
