# Booking API

## Deno + deno-postgres + Amazon Aurora DSQL

A booking/reservation REST API built with **Deno.serve()** and the native **deno-postgres** driver (`jsr:@db/postgres`), backed by **Amazon Aurora DSQL**. This sample demonstrates IAM token authentication, SSL/TLS verify-full connections, optimistic concurrency control (OCC) retry handling, and Deno's least-privilege permissions model.

This project serves as the companion code sample for an AWS technical blog post demonstrating how to use Deno with Amazon Aurora DSQL.

---

## ⚠️ Important

* Running this code might result in charges to your AWS account.
* We recommend that you grant your code least privilege. At most, grant only the
  minimum permissions required to perform the task. For more information, see
  [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege).
* This code is not tested in every AWS Region. For more information, see
  [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services).

---

## Architecture

```
┌──────────────┐     ┌─────────────────────────────────┐     ┌─────────────────────┐
│   Client     │────▶│  Deno.serve()                   │────▶│  Amazon Aurora DSQL  │
│  (curl/app)  │     │  (HTTP Server, port 8000)       │     │  (PostgreSQL 5432)   │
│              │◀────│                                  │◀────│                      │
└──────────────┘     │  ┌─────────┐  ┌──────────────┐  │     └─────────────────────┘
                     │  │ Router  │─▶│ Handlers     │  │              ▲
                     │  └─────────┘  │ (CRUD + OCC  │  │              │
                     │               │  retry)      │  │     IAM Auth Token
                     │               └──────┬───────┘  │     (SSL/TLS verify-full)
                     │                      │          │              │
                     │               ┌──────▼───────┐  │     ┌───────┴───────────┐
                     │               │ Token Gen    │──┼────▶│  AWS IAM / STS    │
                     │               └──────────────┘  │     └───────────────────┘
                     └─────────────────────────────────┘
```

### Create Booking — Request Flow

```
Client                    Deno.serve()                    Aurora DSQL
  │                           │                                │
  │  POST /bookings           │                                │
  │  {resource, time, user}   │                                │
  │──────────────────────────▶│                                │
  │                           │                                │
  │                           │  Generate IAM token ──────────▶│ AWS IAM / STS
  │                           │  (short-lived, per-request)    │
  │                           │◀───────────────────────────────│
  │                           │                                │
  │                           │  Connect (SSL verify-full) ───▶│ Port 5432
  │                           │  BEGIN transaction             │
  │                           │────────────────────────────────▶│
  │                           │                                │
  │                           │  SELECT overlapping bookings   │
  │                           │────────────────────────────────▶│
  │                           │  (check same resource + time)  │
  │                           │◀────────────────────────────────│
  │                           │                                │
  │                     ┌─────┤  No overlap?                   │
  │                     │ Yes │                                │
  │                     │     │  INSERT new booking            │
  │                     │     │────────────────────────────────▶│
  │                     │     │  COMMIT                        │
  │                     │     │────────────────────────────────▶│
  │                     │     │                                │
  │  201 {booking}      │     │                                │
  │◀──────────────────────────│                                │
  │                     │     │                                │
  │                     │ No  │  Overlap found?                │
  │                     └─────┤  ROLLBACK                      │
  │  409 {conflict}           │────────────────────────────────▶│
  │◀──────────────────────────│                                │
  │                           │                                │
  │                     ┌─────────────────────────────┐        │
  │                     │  If DSQL returns OC000:     │        │
  │                     │  Two users booked the same  │        │
  │                     │  slot simultaneously.       │        │
  │                     │  OCC retry handler:         │        │
  │                     │  • Backoff (exp + jitter)   │        │
  │                     │  • Fresh IAM token          │        │
  │                     │  • Retry entire transaction │        │
  │                     │  • Up to 3 retries          │        │
  │                     └─────────────────────────────┘        │
```

---

## API Endpoints

| Method | Path | Description | Status Codes |
|--------|------|-------------|--------------|
| `GET` | `/health` | Health check (load balancer / monitoring) | 200 |
| `POST` | `/bookings` | Create a new booking | 201, 400, 409, 503 |
| `GET` | `/bookings` | List all bookings | 200, 503 |
| `GET` | `/bookings/:id` | Get a booking by ID | 200, 404, 503 |
| `PUT` | `/bookings/:id` | Update a booking | 200, 400, 404, 409, 503 |
| `DELETE` | `/bookings/:id` | Cancel a booking | 200, 404, 503 |

---

## Data Model

```
┌──────────────────────────────────────────────┐
│                  bookings                     │
├──────────────────────────────────────────────┤
│ id            UUID (PK, gen_random_uuid())   │
│ resource_name VARCHAR(255) NOT NULL          │
│ start_time    TIMESTAMPTZ NOT NULL           │
│ end_time      TIMESTAMPTZ NOT NULL           │
│ booked_by     VARCHAR(255) NOT NULL          │
│ created_at    TIMESTAMPTZ DEFAULT now()      │
├──────────────────────────────────────────────┤
│ CONSTRAINT: end_time > start_time            │
│ Overlap detection: application-level SQL     │
└──────────────────────────────────────────────┘
```

---

## Key Design Decisions for Aurora DSQL

| Decision | Rationale |
|----------|-----------|
| **UUID primary keys** | Aurora DSQL does not support sequences or `SERIAL` |
| **No foreign key constraints** | Not supported by Aurora DSQL |
| **Application-level overlap detection** | Aurora DSQL does not support exclusion constraints or triggers |
| **IAM token authentication** | Short-lived tokens via `@aws-sdk/dsql-signer`. No static passwords. |
| **SSL verify-full** | All connections use TLS with system CA verification. Required by Aurora DSQL. |
| **Per-request connections** | Serverless-ready — connection pools don't survive ephemeral instance lifecycles |
| **OCC retry with backoff** | Aurora DSQL uses optimistic concurrency control; `OC000` errors require application retry |
| **Deno.serve() (no framework)** | Zero external dependencies; matches the minimal sample philosophy |

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Deno** | 2.x+ | Runtime and HTTP server |
| **AWS CLI** | v2.x | Credential configuration |
| **python3** | 3.x | JSON parsing in test script |

You also need:
- An AWS account with default credentials configured as described in the
  [Globally configuring AWS SDKs and tools](https://docs.aws.amazon.com/credref/latest/refdocs/creds-config-files.html) guide.
- An Aurora DSQL cluster. See the
  [Getting started with Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html) guide.

---

## Environment Variables

```bash
# Required
export CLUSTER_ENDPOINT="<your-cluster>.dsql.us-east-1.on.aws"
export CLUSTER_USER="admin"

# Optional
export PORT=8000          # HTTP server port (default: 8000)
export AWS_REGION="us-east-1"  # AWS region (default: extracted from endpoint)
```

---

## Setup and Run

### Start the server

```bash
deno task start
```

On startup, the server creates the `bookings` table and a non-admin database role, then begins
listening for HTTP requests. On shutdown (Ctrl+C), it drops the table for clean sample teardown.

### Run with `deno serve` (multi-instance)

```bash
deno task serve
```

### Run tests

```bash
# All tests
deno task test

# Property-based tests only
deno task test:property
```

### Run the full smoke test suite

```bash
./test-api.sh http://localhost:8000
```

---

## Example curl Commands

### Create a booking

```bash
curl -X POST http://localhost:8000/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "resource_name": "Conference Room A",
    "start_time": "2025-03-15T09:00:00Z",
    "end_time": "2025-03-15T10:00:00Z",
    "booked_by": "alice"
  }'
```

### List all bookings

```bash
curl http://localhost:8000/bookings
```

### Get a specific booking

```bash
curl http://localhost:8000/bookings/<booking-id>
```

### Update a booking

```bash
curl -X PUT http://localhost:8000/bookings/<booking-id> \
  -H "Content-Type: application/json" \
  -d '{
    "end_time": "2025-03-15T11:00:00Z"
  }'
```

### Cancel a booking

```bash
curl -X DELETE http://localhost:8000/bookings/<booking-id>
```

---

## Error Responses

All errors return JSON with a descriptive `error` field:

| Status | Example Response |
|--------|-----------------|
| 400 | `{"error": "Missing required field: resource_name"}` |
| 400 | `{"error": "end_time must be after start_time"}` |
| 400 | `{"error": "Invalid JSON in request body"}` |
| 404 | `{"error": "Booking not found"}` |
| 404 | `{"error": "Not Found"}` (unknown route) |
| 409 | `{"error": "Booking conflicts with existing reservation", "conflicting_id": "..."}` |
| 503 | `{"error": "Service unavailable — database connection failed"}` |

---

## Project Structure

```
├── main.ts              # HTTP server entry point (Deno.serve + schema setup)
├── handlers.ts          # Booking CRUD handlers with routing
├── db.ts                # Database connection (deno-postgres + IAM token)
├── schema.ts            # Table creation, role setup, teardown
├── token-generator.ts   # IAM token generation via @aws-sdk/dsql-signer
├── occ-retry.ts         # OCC retry handler for SQLSTATE OC000
├── deno.json            # Deno configuration (imports, tasks, permissions)
├── deno.lock            # Dependency lock file
├── test-api.sh          # API smoke test script
├── test/
│   └── integration.test.ts  # Integration tests (requires DSQL cluster)
├── *.property.test.ts   # Property-based tests (no cluster needed)
└── README.md
```

---

## OCC Retry Behavior

Aurora DSQL uses optimistic concurrency control (OCC) instead of traditional pessimistic locking.
When two transactions conflict — for example, two users trying to book the same room at the same
time — DSQL aborts one transaction with SQLSTATE `OC000`.

This sample handles `OC000` errors automatically via the `withOccRetry` utility:

* Detects `OC000` errors in the deno-postgres error format (`error.fields.code`)
* Retries the failed transaction up to 3 times (configurable)
* Applies exponential backoff with jitter to reduce contention
* Logs each retry attempt with attempt number and elapsed time
* Throws a descriptive error if all retries are exhausted

All write operations (`POST`, `PUT`, `DELETE`) are wrapped in `withOccRetry`.

---

## Deno Permissions Model

This sample runs with the minimum permissions required:

| Flag | Purpose |
|------|---------|
| `--allow-net` | Database connections (port 5432) and HTTP server |
| `--allow-env` | Reading `CLUSTER_ENDPOINT`, `CLUSTER_USER`, `PORT`, `AWS_REGION`, and AWS credential variables |
| `--allow-read` | System CA certificates for SSL/TLS verification |

Deno's default-deny security model complements Aurora DSQL's IAM-based authentication to provide
defense in depth. Even if application code is compromised, the Deno runtime restricts what the
process can access at the OS level.

If you run the application without the required flags, Deno will deny the operation and display
a permission error — demonstrating the default-deny security posture.

---

## Deploying to Deno Deploy

This sample is structured for deployment to [Deno Deploy](https://deno.com/deploy):

1. The module exports a default `{ fetch }` handler compatible with `deno serve`
2. Database connections are per-request (no connection pool state to manage)
3. No file-system state or global mutable singletons

To deploy:

1. Push the code to a GitHub repository
2. Link the repository to a Deno Deploy project
3. Set the entry point to `main.ts`
4. Configure the environment variables (`CLUSTER_ENDPOINT`, `CLUSTER_USER`, `AWS_REGION`)
   in the Deno Deploy dashboard
5. Configure AWS credentials via environment variables

**Note:** For production deployments, remove the `setupSchema`/`teardownSchema` calls from
`main.ts` and manage the schema separately.

---

## Additional resources

* [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
* [deno-postgres Documentation](https://deno-postgres.com/)
* [Deno.serve() API](https://docs.deno.com/api/deno/~/Deno.serve)
* [Deno Deploy](https://deno.com/deploy)

---

## Contributing

See [CONTRIBUTING](https://github.com/aws-samples/aurora-dsql-samples/blob/main/CONTRIBUTING.md) for more information.

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
