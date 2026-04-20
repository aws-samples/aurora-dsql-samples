# Prisma ORM + Aurora DSQL: Multi-Region Active-Active Pattern

A production-ready example demonstrating how to use [Prisma ORM](https://www.prisma.io/) with [Amazon Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html) in a multi-region active-active configuration.

## What This Demonstrates

- **Multi-region active-active reads and writes** — Both regions serve traffic simultaneously with strong consistency
- **Automatic IAM authentication** — Token generation via `@aws-sdk/dsql-signer`, no static passwords
- **Region-aware failover** — Automatic fallback to the peer region if the primary endpoint is unavailable
- **Prisma + DSQL compatibility** — Handles DSQL constraints (no foreign keys, no sequences, no advisory locks)

## Architecture

![alt text](image.png)

Both peered regions accept reads AND writes with strong consistency. The witness region (us-east-2) participates in quorum for durability — it has no endpoint.

## Prerequisites

- AWS account with credentials configured
- Node.js 20+
- An Aurora DSQL multi-region cluster (see below)

## Project Structure

```
prisma-dsql-multi-region/
├── prisma/
│   ├── schema.prisma          # Prisma schema (DSQL-compatible)
│   └── migrations/            # DSQL-compatible SQL migrations
├── prisma.config.ts           # Prisma 7 config with dynamic IAM auth
├── src/
│   ├── dsql-client.ts         # Multi-region DSQL Prisma client
│   ├── server.ts              # Express API server
│   └── health.ts              # Health check endpoint
├── package.json
├── tsconfig.json
└── README.md
```

## Provisioning a Multi-Region DSQL Cluster

Aurora DSQL multi-region clusters are created via the AWS CLI:

```bash
aws dsql create-multi-region-clusters \
  --linked-region-list us-east-1 us-west-2 \
  --witness-region us-east-2 \
  --cluster-properties '{
    "us-east-1": {"tags": {"Name": "dsql-primary"}},
    "us-west-2": {"tags": {"Name": "dsql-secondary"}}
  }'
```

This returns cluster identifiers for each region. Your endpoints will be:
```
<cluster-id>.dsql.us-east-1.on.aws
<cluster-id>.dsql.us-west-2.on.aws
```

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Set environment variables

```bash
export CLUSTER_ENDPOINT="your-cluster-id.dsql.us-east-1.on.aws"
export CLUSTER_ENDPOINT_SECONDARY="your-cluster-id.dsql.us-west-2.on.aws"
export CLUSTER_USER="admin"
export AWS_REGION="us-east-1"
export PORT=3000
```

### 3. Validate schema

```bash
npm run validate
```

### 4. Generate DSQL-compatible migration

If you need to regenerate the migration from the schema:

```bash
npm run dsql-migrate prisma/schema.prisma -o prisma/migrations/0_init/migration.sql
```

### 5. Run migrations

```bash
npm run prisma:migrate-up
```

### 6. Generate Prisma client and start

```bash
npm run build
npm start
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check with region and DSQL status |
| GET | `/orders` | List all orders |
| POST | `/orders` | Create an order |
| GET | `/orders/:id` | Get order by ID |

### Example requests

```bash
# Health check
curl http://localhost:3000/health

# Create an order
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{"product": "Widget", "quantity": 2}'

# Create an order with items
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{"product": "Bundle", "quantity": 1, "items": [{"name": "Part A", "price": 9.99}]}'

# List orders
curl http://localhost:3000/orders
```

## DSQL Constraints (Prisma Compatibility)

| Feature | DSQL Support | Workaround |
|---------|-------------|------------|
| Foreign keys | Not supported | `relationMode = "prisma"` |
| Sequences / autoincrement | Not supported | `gen_random_uuid()` for IDs |
| `CREATE INDEX` (sync) | Not supported | Use `aurora-dsql-prisma migrate` to generate `CREATE INDEX ASYNC` |
| Advisory locks | Not supported | `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1` |

## Authentication

This sample uses IAM-based authentication — no static passwords. The `@aws/aurora-dsql-node-postgres-connector` handles token generation and refresh automatically in the connection pool.

For Prisma CLI tools (migrations, generate), `prisma.config.ts` generates a fresh IAM token at startup using `@aws-sdk/dsql-signer`:

- **Admin user** (`CLUSTER_USER=admin`): uses `getDbConnectAdminAuthToken()` and the `public` schema
- **Non-admin user**: uses `getDbConnectAuthToken()` and the `myschema` schema

Your AWS credentials must have the `dsql:DbConnectAdmin` (or `dsql:DbConnect` for non-admin) IAM permission on the cluster.

## Testing Failover

An integration test validates the multi-region failover path against your live DSQL clusters.

The test connects to both regions, writes an order via the primary, triggers application-level failover to the secondary, and verifies the data replicated.

```bash
npm run test:failover
```

Both `CLUSTER_ENDPOINT` and `CLUSTER_ENDPOINT_SECONDARY` must be set. Expected output:

```
Primary:   <cluster-id>.dsql.us-east-1.on.aws
Secondary: <cluster-id>.dsql.us-west-2.on.aws

Test 1: Primary region serves queries
  ✓ SELECT 1 returns expected result

Test 2: Write and read on primary
  ✓ Order created: <uuid>
  ✓ Order readable on primary

Test 3: Failover to secondary region
  ✓ Active client changed after failover
  ✓ Secondary responds to queries

Test 4: Data replicated to secondary
  ✓ Order replicated to secondary region

Results: 6 passed, 0 failed
```

## Cleanup

Remove the database tables:

```bash
npm run prisma:migrate-down
```

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the [LICENSE](LICENSE) file.
