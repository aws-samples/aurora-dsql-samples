# Recipe Sharing API

## Go + Gin + Amazon Aurora DSQL

A recipe sharing API built with **Go 1.25** and the **Gin** web framework, backed by **Amazon Aurora DSQL** in production and **SQLite** for local development. Deployed to AWS as an **AWS Lambda** function behind **Amazon API Gateway** (REST API), with infrastructure defined in **AWS CloudFormation**.

This project serves as the companion code sample for an AWS technical blog post demonstrating how to use Go with Amazon Aurora DSQL.

---

## Architecture

### Local Development

```
Gin HTTP Server (port 8080) → SQLite
```

### Production (AWS)

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│   Internet   │────▶│  Amazon API      │────▶│  AWS Lambda         │
│  (Allowed IP)│     │  Gateway         │     │  (Go binary with    │
│              │     │  (REST API)      │     │   Gin + adapter)    │
└──────────────┘     └──────────────────┘     └─────────┬───────────┘
                                                         │
                                                         │ IAM Auth Token
                                                         │ (SSL/TLS)
                                                         ▼
                                              ┌─────────────────────┐
                                              │  Amazon Aurora DSQL  │
                                              └─────────────────────┘
```

API Gateway uses a resource policy to restrict access to a specified IP address or CIDR block when the `--allowed-ip` flag is provided at deployment time. Without it, the API is publicly accessible.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/v1/chefs` | List all chefs |
| `POST` | `/api/v1/chefs` | Create a chef |
| `GET` | `/api/v1/chefs/:id` | Get a chef with recipes |
| `PUT` | `/api/v1/chefs/:id` | Update a chef |
| `DELETE` | `/api/v1/chefs/:id` | Delete a chef |
| `GET` | `/api/v1/recipes` | List recipes (filter: `cuisine`, `difficulty`, `status`) |
| `POST` | `/api/v1/recipes` | Create a recipe |
| `GET` | `/api/v1/recipes/:id` | Get a recipe with ratings |
| `PUT` | `/api/v1/recipes/:id` | Update a recipe |
| `DELETE` | `/api/v1/recipes/:id` | Delete a recipe |
| `GET` | `/api/v1/recipes/:id/ratings` | List ratings for a recipe |
| `POST` | `/api/v1/recipes/:id/ratings` | Rate a recipe |

---

## Data Model

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────┐
│    chefs     │       │     ratings      │       │   recipes    │
├──────────────┤       ├──────────────────┤       ├──────────────┤
│ id (UUID PK) │◀──┐   │ id (UUID PK)     │   ┌──▶│ id (UUID PK) │
│ name         │   └───│ chef_id (UUID)   │   │   │ title        │
│ email        │       │ recipe_id (UUID) │───┘   │ description  │
│ specialty    │       │ score (1-5)      │       │ ingredients  │
│ bio          │       │ comment          │       │ instructions │
│ created_at   │       │ created_at       │       │ prep_time    │
│ updated_at   │       │ updated_at       │       │ cook_time    │
└──────────────┘       └──────────────────┘       │ servings     │
                                                   │ difficulty   │
                                                   │ cuisine      │
                                                   │ chef_id (UUID)│
                                                   │ status       │
                                                   │ created_at   │
                                                   │ updated_at   │
                                                   └──────────────┘
```

Foreign key constraints are not supported by Amazon Aurora DSQL. Referential integrity is enforced at the application layer in Go code.

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Go** | 1.24+ | Build the API binary |
| **AWS CLI** | v2.x | Deploy to AWS |
| **python3** | 3.x | JSON parsing in test script |
| **jq** | 1.6+ | Parse deployment outputs |
| **zip** | Any | Package the Lambda deployment |

You also need:
- An AWS account with permissions to create Lambda, API Gateway, IAM, CloudWatch, S3, and CloudFormation resources
- An Amazon Aurora DSQL cluster (created separately)

---

## Local Development

No AWS credentials or Amazon Aurora DSQL cluster are required for local development. The API uses SQLite locally.

```bash
# Install dependencies
go mod tidy

# Run the API server
go run cmd/api/main.go
```

The API is available at `http://localhost:8080`.

### Quick test

```bash
curl http://localhost:8080/health
# {"status":"ok"}

curl -X POST http://localhost:8080/api/v1/chefs \
  -H "Content-Type: application/json" \
  -d '{"name": "Julia Child", "email": "julia@example.com", "specialty": "French"}'
```

### Run the full test suite

```bash
./test-api.sh http://localhost:8080
```

---

## Deploy to AWS

### Step 1: Create an Amazon Aurora DSQL Cluster

```bash
aws dsql create-cluster \
  --region us-east-1 \
  --no-deletion-protection-enabled
```

Save the `identifier` from the response.

### Step 2: Run the Deploy Script

```bash
./deploy.sh \
  --account 123456789012 \
  --region us-east-1 \
  --allowed-ip $(curl -s https://checkip.amazonaws.com) \
  --dsql-cluster-id <your-cluster-id>
```

| Flag | Required | Description |
|------|----------|-------------|
| `--account` | Yes | 12-digit AWS account ID |
| `--region` | Yes | AWS region (e.g., `us-east-1`) |
| `--dsql-cluster-id` | Yes | Amazon Aurora DSQL cluster identifier |
| `--allowed-ip` | No | IP address or CIDR block allowed to access the API (auto-appends `/32` to bare IPs). Omit for unrestricted access. |
| `--stack-name` | No | CloudFormation stack name (default: `recipe-share-stack`) |

The script validates prerequisites, cross-compiles the Go binary for Linux/ARM64, uploads it to Amazon S3, and deploys via AWS CloudFormation. On completion it prints the API Gateway endpoint URL.

### Step 3: Test the Deployed API

```bash
./test-api.sh https://<api-id>.execute-api.<region>.amazonaws.com/prod
```

---

## Project Structure

```
├── cmd/
│   ├── api/main.go              # Local dev entrypoint (Gin + SQLite)
│   └── lambda/main.go           # Production entrypoint (Gin + Lambda + DSQL)
├── internal/
│   ├── handler/                 # Gin route handlers (chef, recipe, rating, health)
│   ├── model/                   # Data structs and input/output types
│   ├── store/                   # Store interface + SQLite and DSQL implementations
│   ├── middleware/              # Request logging and CORS middleware
│   └── router/                  # Gin router setup and route registration
├── infrastructure/
│   └── cloudformation.yml       # AWS CloudFormation template (REST API + Lambda + IAM)
├── deploy.sh                    # Deployment script
├── test-api.sh                  # API smoke test script
├── go.mod / go.sum              # Go module dependencies
├── .gitignore
├── DESIGN_SPECIFICATION.md      # Detailed design document
├── TASK_LIST.md                 # Implementation task tracking
└── README.md
```

---

## Key Design Decisions for Amazon Aurora DSQL

| Decision | Rationale |
|----------|-----------|
| **UUID primary keys** | Amazon Aurora DSQL does not support sequences or `SERIAL`. UUIDs generated in Go with `google/uuid`. |
| **No foreign key constraints** | Not supported by Amazon Aurora DSQL. Referential integrity enforced in handler code. |
| **IAM token authentication** | Short-lived tokens generated by the Aurora DSQL Go connector. No static passwords. |
| **`prefer_simple_protocol`** | Amazon Aurora DSQL does not support prepared statements. Handled by the connector. |
| **SSL `verify-full`** | All connections use TLS with Amazon Root CA verification. Handled by the connector. |
| **Separate DDL statements** | Amazon Aurora DSQL does not support DDL and DML in the same transaction. |
| **REST API (not HTTP API)** | API Gateway REST APIs support resource policies for IP restriction. HTTP APIs do not support this in CloudFormation. |

---

## Environment Variables

### Production (Lambda)

| Variable | Description |
|----------|-------------|
| `DSQL_ENDPOINT` | Amazon Aurora DSQL cluster endpoint |
| `DB_TYPE` | Set to `dsql` (configured by CloudFormation) |

### Local Development

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP listen port |
| `DB_PATH` | `recipe_share.db` | SQLite database file path |

---

## Monitoring

Replace the region and stack name to match your deployment.

```bash
# View Lambda logs
aws logs tail /aws/lambda/recipe-share-stack-function --region <region> --follow

# View API Gateway access logs
aws logs tail /aws/apigateway/recipe-share-stack-access-logs --region <region> --follow
```

---

## Tear Down

```bash
# Delete the CloudFormation stack
aws cloudformation delete-stack --stack-name recipe-share-stack --region <region>

# Delete the S3 deployment bucket
aws s3 rb s3://recipe-share-stack-deploy-<account-id>-<region> --force --region <region>

# Delete the Amazon Aurora DSQL cluster
aws dsql delete-cluster --identifier <cluster-id> --region <region>
```

---

## References

- [Amazon Aurora DSQL User Guide](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/)
- [Using Go with Amazon Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/SECTION_program-with-go.html)
- [Aurora DSQL Connector for Go (pgx)](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/SECTION_program-with-go-pgx-connector.html)
- [Aurora DSQL Connectors (GitHub)](https://github.com/awslabs/aurora-dsql-connectors)
- [Aurora DSQL Samples](https://github.com/aws-samples/aurora-dsql-samples)
- [Gin Web Framework](https://github.com/gin-gonic/gin)
