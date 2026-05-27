# Recipe Sharing API

## Go + Gin + Amazon Aurora DSQL

A recipe sharing API built with **Go 1.26** and the **Gin** web framework, backed by **Amazon Aurora DSQL** (PostgreSQL-compatible). Deployed to AWS as an **AWS Lambda** function behind **Amazon API Gateway** (REST API), with infrastructure defined in **AWS CloudFormation**.

This project serves as the companion code sample for an AWS technical blog post demonstrating how to use Go with Amazon Aurora DSQL.

---

## Architecture

### Local Development

```
Gin HTTP Server (port 8080) → Amazon Aurora DSQL
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

Foreign key constraints are not used in this sample. Referential integrity is enforced at the application layer in Go code.

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Go** | 1.26+ | Build the API binary |
| **AWS CLI** | v2.x | Deploy to AWS |
| **python3** | 3.x | JSON parsing in test script |
| **jq** | 1.6+ | Parse deployment outputs |
| **zip** | Any | Package the Lambda deployment |

You also need:
- An AWS account with permissions to create Lambda, API Gateway, IAM, CloudWatch, S3, and CloudFormation resources
- An Amazon Aurora DSQL cluster (created separately)
- AWS credentials configured locally (needed for both local development and deployment)

---

## Local Development

An Amazon Aurora DSQL cluster and valid AWS credentials are required for local development.

```bash
# Install dependencies
go mod tidy

# Run the API server (replace with your cluster endpoint)
DSQL_ENDPOINT=<your-cluster-id>.dsql.<region>.on.aws go run cmd/api/main.go
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
│   ├── api/main.go              # Local dev entrypoint (Gin + Aurora DSQL)
│   └── lambda/main.go           # Production entrypoint (Gin + Lambda + Aurora DSQL)
├── internal/
│   ├── handler/                 # Gin route handlers (chef, recipe, rating, health)
│   ├── model/                   # Data structs and input/output types
│   ├── store/                   # Store interface + Aurora DSQL implementation
│   ├── middleware/              # Request logging and CORS middleware
│   └── router/                  # Gin router setup and route registration
├── infrastructure/
│   └── cloudformation.yml       # AWS CloudFormation template (REST API + Lambda + IAM)
├── deploy.sh                    # Deployment script
├── test-api.sh                  # API smoke test script
├── go.mod / go.sum              # Go module dependencies
└── README.md
```

---

## Key Design Decisions for Amazon Aurora DSQL

| Decision | Rationale |
|----------|-----------|
| **UUID primary keys** | UUIDs distribute writes evenly across storage nodes. Generated in Go with `google/uuid`. |
| **Application-layer referential integrity** | Relationships enforced in handler code via validation before inserts/deletes. |
| **IAM token authentication** | Short-lived tokens generated by the Aurora DSQL Go connector. No static passwords. |
| **REST API (not HTTP API)** | API Gateway REST APIs support resource policies for IP restriction. HTTP APIs do not support this in CloudFormation. |

For Aurora DSQL best practices and SQL compatibility details, see the [Aurora DSQL documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility.html).

---

## Environment Variables

### Production (Lambda)

| Variable | Description |
|----------|-------------|
| `DSQL_ENDPOINT` | Amazon Aurora DSQL cluster endpoint |

### Local Development

| Variable | Default | Description |
|----------|---------|-------------|
| `DSQL_ENDPOINT` | *(required)* | Amazon Aurora DSQL cluster endpoint |
| `PORT` | `8080` | HTTP listen port |

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
