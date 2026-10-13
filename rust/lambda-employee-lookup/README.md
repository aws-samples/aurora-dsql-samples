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
- You must have `psql` installed to run the database setup script.

The CLI setup scripts let you reuse an existing Aurora DSQL cluster or create one. CloudFormation and Terraform create a cluster for this deployment; you do not need to create a separate prerequisite cluster.

### Configure the environment

Run the commands below from `rust/lambda-employee-lookup`. Set the Region for your deployment:

```bash
# e.g. "us-east-1"
export AWS_REGION="<your region>"
```
### Deploy

> **Note:** This sample deploys an open API endpoint with no authentication, throttled to 5 requests per second with a burst of 10. Use only with demo/sample data. For production use, add `AWS_IAM` authorization to the API Gateway route and review the throttling limits.

This example supports two deployment approaches: **container image** (recommended) and **zip package**.

Choose one deployment tool and approach. They use the same function and role names, so do not deploy multiple copies with the default names. Lambda logs are retained for 7 days. If you are adding log-group management to an existing CloudFormation or Terraform deployment, import any existing `/aws/lambda/dsql-employee-lookup` log group rather than deleting its logs.

#### Option 1: Container image (recommended)

Deploys Lambda as a container image pushed to ECR. Supports larger binaries (up to 10 GB).

| Tool | File |
|------|------|
| AWS CLI (Linux) | `deploy/container/setup.sh` |
| AWS CLI (macOS + Finch) | `setup-finch.sh` |
| AWS CLI (macOS + Docker) | `setup-docker.sh` |
| CloudFormation | `deploy/container/cloudformation.yaml` |
| Terraform | `deploy/container/main.tf` |

```bash
# Linux
chmod +x deploy/container/setup.sh && ./deploy/container/setup.sh

# macOS (Apple Silicon)
chmod +x setup-finch.sh && ./setup-finch.sh
```

#### Option 2: Zip package

Deploys Lambda as a `.zip` file. Uses `[profile.release]` settings (strip, LTO, size optimization) for a smaller binary and faster cold starts.

| Tool | File |
|------|------|
| AWS CLI (Linux) | `deploy/zip/setup.sh` |
| CloudFormation | `deploy/zip/cloudformation.yaml` |
| Terraform | `deploy/zip/main.tf` |

```bash
chmod +x deploy/zip/setup.sh && ./deploy/zip/setup.sh
```


### Seed the database

Run these commands from `rust/lambda-employee-lookup`. Use the cluster endpoint and Lambda execution-role ARN from **the deployment you just created**, not a different cluster. The CLI scripts print both values and the seed command.

For CloudFormation, read the stack outputs:

```bash
STACK_NAME=dsql-employee-lookup
export DSQL_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" --region "$AWS_REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='DsqlEndpoint'].OutputValue | [0]" --output text)
export ROLE_ARN=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" --region "$AWS_REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='LambdaRoleArn'].OutputValue | [0]" --output text)
export API_URL=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" --region "$AWS_REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue | [0]" --output text)
```

For Terraform, read the outputs from the directory you applied:

```bash
DEPLOY_DIR=deploy/container # or deploy/zip
export DSQL_ENDPOINT=$(terraform -chdir="$DEPLOY_DIR" output -raw dsql_endpoint)
export ROLE_ARN=$(terraform -chdir="$DEPLOY_DIR" output -raw lambda_role_arn)
export API_URL=$(terraform -chdir="$DEPLOY_DIR" output -raw api_endpoint)
```

Connect to that cluster as admin and run `seed.sql`. Your setup identity needs `dsql:DbConnectAdmin`; the Lambda execution role uses only `dsql:DbConnect`:

```bash
: "${DSQL_ENDPOINT:?Use the endpoint from your deployment}"
: "${ROLE_ARN:?Use the Lambda execution-role ARN from your deployment}"
TOKEN=$(aws dsql generate-db-connect-admin-auth-token \
  --hostname "$DSQL_ENDPOINT" --region "$AWS_REGION")

PGPASSWORD="$TOKEN" psql \
  "host=$DSQL_ENDPOINT port=5432 dbname=postgres user=admin sslmode=require" \
  -v ON_ERROR_STOP=1 \
  -v role_arn="$ROLE_ARN" \
  -f seed.sql
```

> **Note:** PostgreSQL `CREATE ROLE` does not accept `IF NOT EXISTS`. If the role and IAM mapping already exist, comment out Step 2 (CREATE ROLE) and Step 3 (AWS IAM GRANT) before re-running the seed script. The schema, table, index, and sample rows can be seeded again.

The index builds asynchronously. A false `indisvalid` result immediately after seeding does not mean the build failed. Check its status in `sys.jobs` or wait with `sys.wait_for_job(job_id)` before deciding to recreate it; dropping the index cancels an in-progress build.

### Test the API

Set `API_URL` to the full endpoint printed by your deploy step:

```bash
export API_URL="<full URL from deploy output, e.g. https://abc123.execute-api.us-east-1.amazonaws.com/lookup>"

# Search for an employee by name
curl -X POST "$API_URL" \
  -H 'Content-Type: application/json' \
  -d '{"name": "Alice"}'

# List all employees
curl -X POST "$API_URL" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Or use the test script:

```bash
chmod +x test-api.sh && ./test-api.sh
```

### API contract

`POST /lookup` accepts an empty body or a JSON object:

| Field | Description |
|-------|-------------|
| `name` | Optional case-insensitive, literal name prefix. At most the first 100 characters are used; `%` and `_` are not wildcards. NUL characters are rejected. |
| `limit` | Optional page size. Defaults to 50, is capped at 50, and must be greater than zero. |
| `after` | Optional opaque cursor from the previous response's `next` field. Keep the same name filter when requesting the next page. |

The response contains `employees`, the number of employees in this page as `count`, and `next` (a cursor, or `null` when there are no more results). For example:

```json
{"employees": [], "count": 0, "next": null}
```

Use `{"name": "Alice", "limit": 10}` for the first page, then include the returned `next` value as `after` in the next request. Malformed JSON, an invalid cursor, or a zero page size returns HTTP 400. Database query failures return a generic HTTP 500 response.

### Run the checks locally

```bash
cargo test --locked
cargo fmt -- --check
cargo clippy --locked --all-targets -- -D warnings
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r tests/requirements.txt
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

The Python checks require Python 3.8 or later, Bash, `jq`, and Node.js. Their test-only YAML parser checks the PR commit's path through the workflow configuration. External AWS/build/HTTP commands are replaced with test fixtures; these checks do not deploy resources.

The database tests are explicitly ignored by the default `cargo test` command. To run them, set `DATABASE_URL` to a **disposable PostgreSQL database** whose user can create and drop schemas, then opt in:

```bash
export DATABASE_URL="postgres://<user>:<password>@localhost:5432/<test-database>"
cargo test --locked -- --include-ignored
```

Each test creates and removes its own schema. CI supplies PostgreSQL 17 and runs this command. These tests exercise SQL and handler behavior, not Aurora DSQL IAM/TLS or deployment semantics; do not point them at a production database.

### Clean up

For the CLI scripts, use the teardown commands printed at the end of the run. They delete only the resources that run created; keep reused clusters and IAM roles.

For CloudFormation, delete the stack:

```bash
aws cloudformation delete-stack --stack-name "$STACK_NAME" --region "$AWS_REGION"
aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME" --region "$AWS_REGION"
```

For Terraform, run `terraform -chdir="$DEPLOY_DIR" destroy` with the same variables used for `apply`, including the Region and image URI or zip path. The stack or Terraform state owns the cluster, IAM role, API, function, and managed log groups. Remove separately created ECR images/repositories or S3 build artifacts only if they belong to this sample.

## Project structure

```
├── src/main.rs           # Lambda entry point + DSQL connection pool
├── src/lib.rs            # Shared library exports
├── src/handler.rs        # Validated lookup requests, SQL, and pagination
├── src/cursor.rs         # Pagination cursors
├── src/models.rs         # Request and employee models
├── src/parsing.rs        # Body parsing and literal prefix filtering
├── src/response.rs       # HTTP response formatting
├── tests/                # Rust and offline script regression tests
├── Cargo.toml            # Rust dependencies
├── Cargo.lock            # Locked dependency versions
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
