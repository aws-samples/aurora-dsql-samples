<<<<<<< HEAD
# Aurora DSQL Samples

[![Discord chat](https://img.shields.io/discord/1435027294837276802.svg?logo=discord)](https://discord.com/invite/nEF6ksFWru)

This repository contains code examples that demonstrate how to use the [Aurora DSQL](https://aws.amazon.com/rds/aurora/dsql/).

To get started with Aurora DSQL, create clusters and more information, please refer to [AWS Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html)

## How this repository is organized

The subdirectories contain code examples for connecting and using Aurora DSQL in each programming language and ORM framework, as well as end-to-end sample applications. The examples demonstrate the most common uses, such as installing clients, handling authentication, performing CRUD operations, and more. Please refer to the [documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/known-issues.html) for a full list of differences and limitations.

|  Language   |                      Client / ORM                       |
|:-----------:|:-------------------------------------------------------:|
|     C++     |                   [libpq](cpp/libpq)                    |
| C# (dotnet) |     [EF Core](dotnet/ef-core/examples/InventoryApi)     |
| C# (dotnet) |                 [Npgsql](dotnet/npgsql)                 |
|     Go      |                     [pgx](go/pgx/)                      |
|    Java     |            [HikariCP + pgJDBC](java/pgjdbc)             |
|    Java     |               [Liquibase](java/liquibase)               |
|    Java     |             [Spring Boot](java/spring_boot)             |
| JavaScript  |          [AWS Lambda + node-postgres](lambda/)          |
| JavaScript  | [node-postgres (standalone)](javascript/node-postgres/) |
| JavaScript  |         [Postgres.js](javascript/postgres-js/)          |
|   Python    |                [asyncpg](python/asyncpg)                |
|   Python    |                [Jupyter](python/jupyter)                |
|   Python    |               [psycopg](python/psycopg/)                |
|   Python    |              [psycopg2](python/psycopg2/)               |
|   Python    |             [SQLAlchemy](python/sqlalchemy)             |
|   Python    |           [Tortoise ORM](python/tortoise-orm)           |
|    Ruby     |                   [pg](ruby/ruby-pg)                    |
|    Ruby     |                   [Rails](ruby/rails)                   |
|    Rust     |                    [sqlx](rust/sqlx)                    |
| Typescript  |              [Drizzle](typescript/drizzle)              |
| Typescript  |       [Prisma](typescript/prisma-multi-region)          |
| Typescript  |            [Sequelize](typescript/sequelize)            |
| Typescript  |             [TypeORM](typescript/type-orm)              |
|    Deno     |        [postgres-js](deno/postgres-js/)              |


|  Language   |                 Cluster Management                  |
|:-----------:|:---------------------------------------------------:|
|     C++     |    [cluster_management](cpp/cluster_management)     |
| C# (dotnet) |   [cluster_management](dotnet/cluster_management)   |
|     Go      |     [cluster_management](go/cluster_management)     |
|    Java     |    [cluster_management](java/cluster_management)    |
| JavaScript  | [cluster_management](javascript/cluster_management) |
|   Python    |   [cluster_management](python/cluster_management)   |
|    Ruby     |    [cluster_management](ruby/cluster_management)    |
|    Rust     |    [cluster_management](rust/cluster_management)    |


|  Language   |                    Token Generation                     |
|:-----------:|:-------------------------------------------------------:|
|     CLI     |          [generate_token](cli/authentication)           |
|     C++     |          [generate_token](cpp/authentication)           |
| C# (dotnet) |         [generate_token](dotnet/authentication)         |
|     Go      |           [generate_token](go/authentication)           |
|    Java     |          [generate_token](java/authentication)          |
| JavaScript  |       [generate_token](javascript/authentication)       |
|   Python    |         [generate_token](python/authentication)         |
|    Ruby     |          [generate_token](ruby/authentication)          |
|    Rust     |          [generate_token](rust/authentication)          |

|                          Sample Applications                          |
|:---------------------------------------------------------------------:|
| [Amazon Aurora DSQL Agent](sample-amazon-aurora-dsql-agent) — A sample application showing how to build an AI agent that queries Aurora DSQL using natural language, powered by Strands Agents, Bedrock AgentCore Gateway (MCP), and AgentCore Runtime (A2A) |
| [Booking API (Deno)](deno/booking-api/postgres-js) — A sample REST API for room/resource bookings built with Deno.serve() and postgres.js via the Aurora DSQL connector. Includes OCC retry handling, unique-window enforcement via an async index, and pooled IAM token auth |

Each example includes language and client-specific instructions as well as instructions to invoke example code.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This project is licensed under the MIT-0 License.
=======
# DSQL Employee Lookup - Test Environment

Test environment for the blog post "Building a Serverless Employee Directory with Rust on AWS Lambda and Amazon Aurora DSQL".

## Architecture

- **Compute**: AWS Lambda (ARM64/Graviton)
- **Database**: Amazon Aurora DSQL (serverless, PostgreSQL-compatible)
- **API**: API Gateway HTTP API (POST /lookup)

## Project Structure

```
dsql-employee-test-env/
├── src/main.rs                       # Lambda function source code
├── Cargo.toml                        # Rust dependencies
├── Dockerfile                        # Container image definition
├── seed.sql                          # Database schema + sample data
├── test-api.sh                       # API test script
├── README.md
│
├── deploy/
│   ├── container/                    # ✅ RECOMMENDED - Container image approach
│   │   ├── setup.sh                  #    Linux setup script (AWS CLI)
│   │   ├── cloudformation.yaml       #    CloudFormation template
│   │   └── main.tf                   #    Terraform configuration
│   │
│   └── zip/                          # Zip package approach (250MB limit)
│       ├── setup.sh                  #    Linux setup script (AWS CLI)
│       ├── cloudformation.yaml       #    CloudFormation template
│       └── main.tf                   #    Terraform configuration
│
├── setup-finch.sh                    # macOS setup (Finch container runtime)
└── setup-docker.sh                   # macOS setup (Docker container runtime)
```

## Deployment Options

### Option 1: Container Image (✅ Recommended)

Deploys Lambda as a container image pushed to ECR.

| Advantage | Detail |
|-----------|--------|
| No size limit issues | 10GB limit vs 250MB for zip |
| No cross-compilation | Build natively on ARM Linux |
| Simpler CI/CD | Single Docker image = immutable artifact |

**Choose your tool:**

| Tool | File | Usage |
|------|------|-------|
| AWS CLI | `deploy/container/setup.sh` | `./setup.sh` |
| CloudFormation | `deploy/container/cloudformation.yaml` | Pre-requisite: push image to ECR, then deploy |
| Terraform | `deploy/container/main.tf` | `terraform apply -var="image_uri=..."` |

### Option 2: Zip Package

Deploys Lambda as a `.zip` file. Simpler but limited to 250MB unzipped.

**IMPORTANT:** Requires `[profile.release]` with `strip = true` and `lto = true` in Cargo.toml to keep the binary small enough. Without these, Rust binaries with native crypto crates exceed 250MB.

| Tool | File | Usage |
|------|------|-------|
| AWS CLI | `deploy/zip/setup.sh` | `./setup.sh` |
| CloudFormation | `deploy/zip/cloudformation.yaml` | Pre-requisite: upload zip to S3, then deploy |
| Terraform | `deploy/zip/main.tf` | `terraform apply -var="zip_path=..."` |

### macOS-Specific Scripts

For building on Apple Silicon Macs (where cross-compilation to Linux fails):

| Script | Container Runtime |
|--------|-------------------|
| `setup-finch.sh` | Finch (Amazon corp Mac default) |
| `setup-docker.sh` | Docker Desktop |

These build inside a Linux container and deploy as a container image to ECR.

## Quick Start (Linux)

```bash
# Container approach (recommended)
cd deploy/container
chmod +x setup.sh
./setup.sh

# OR Zip approach
cd deploy/zip
chmod +x setup.sh
./setup.sh
```

## Quick Start (macOS - Apple Silicon)

```bash
# Using Finch
chmod +x setup-finch.sh
./setup-finch.sh

# OR using Docker
chmod +x setup-docker.sh
./setup-docker.sh
```

## After Deployment

### 1. Seed the database

Connect to DSQL via the Query Editor in the AWS Console, or via psql:

```bash
TOKEN=$(aws dsql generate-db-connect-admin-auth-token \
  --hostname <YOUR_ENDPOINT> --region us-east-1)

PGPASSWORD=[REDACTED_PASSWORD] psql \
  "host=<YOUR_ENDPOINT> port=5432 dbname=postgres user=admin sslmode=require" \
  -f seed.sql
```

### 2. Test the API

```bash
curl -X POST https://<API_ENDPOINT>/lookup \
  -H 'Content-Type: application/json' \
  -d '{"name": "Alice"}'
```

Or use the test script:
```bash
chmod +x test-api.sh
./test-api.sh
```

## Important Notes

- **Region**: Defaults to `us-east-1`. Edit `REGION` in the setup script to change.
- **No auth on API**: Skips Cognito JWT auth for simplicity. API is publicly accessible.
- **seed.sql**: Replace `<ACCOUNT_ID>` with your AWS account ID in the `AWS IAM GRANT` statement.
- **Build time**: First build ~2-3 min (crate downloads). Subsequent builds are faster.
- **Binary size**: With `strip + lto`, the binary is ~7 MB. Without them, >250 MB.

## Cost

- **Aurora DSQL**: Pay per DPU (compute + read + write) + storage. Free tier available.
- **Lambda**: Free tier covers 1M requests/month.
- **API Gateway**: Free tier covers 1M HTTP API calls/month.
- **ECR**: 500MB free storage/month (container approach only).

Delete resources when done to avoid ongoing charges (teardown commands printed by each setup script).
>>>>>>> fe26e4f9 (Add Rust Lambda + Aurora DSQL employee lookup sample with DSQL SQLx connector)
