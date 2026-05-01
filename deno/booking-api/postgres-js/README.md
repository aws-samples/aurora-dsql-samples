# Booking API

## Deno + postgres.js connector + Amazon Aurora DSQL

A booking/reservation REST API built with **Deno.serve()** and the
[**Aurora DSQL Connector for postgres.js**](https://github.com/awslabs/aurora-dsql-connectors/tree/main/node/postgres-js),
backed by **Amazon Aurora DSQL**. This sample demonstrates IAM token
authentication, optimistic concurrency control (OCC) retry handling,
commit-time unique-window enforcement, and Deno's least-privilege permissions
model.

This project serves as the companion code sample for an AWS technical blog
post demonstrating how to use Deno with Amazon Aurora DSQL.

---

## ⚠️ Important

* Running this code might result in charges to your AWS account.
* We recommend that you grant your code least privilege. At most, grant only
  the minimum permissions required to perform the task. For more information,
  see [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege).
* This code is not tested in every AWS Region. For more information, see
  [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services).

---

## Architecture

```
┌──────────────┐     ┌─────────────────────────────────┐     ┌─────────────────────┐
│   Client     │────▶│  Deno.serve()                   │────▶│  Amazon Aurora DSQL │
│  (curl/app)  │     │  (HTTP Server, port 8000)       │     │  (PostgreSQL 5432)  │
│              │◀────│                                  │◀────│                      │
└──────────────┘     │  ┌─────────┐  ┌──────────────┐  │     └─────────────────────┘
                     │  │ Router  │─▶│ Handlers     │  │              ▲
                     │  └─────────┘  │ (CRUD + OCC  │  │              │
                     │               │  retry)      │  │     Pooled IAM-auth
                     │               └──────┬───────┘  │     connections
                     │                      │          │     (TLS, token refresh
                     │               ┌──────▼───────┐  │      handled by connector)
                     │               │ auroraDSQL   │──┼─────────────┐
                     │               │  Postgres()  │  │             │
                     │               │ (pooled sql) │  │             ▼
                     │               └──────────────┘  │     ┌───────────────────┐
                     └─────────────────────────────────┘     │  AWS IAM / STS    │
                                                             └───────────────────┘
```

The connector (`@aws/aurora-dsql-postgresjs-connector`) wraps the
[postgres.js](https://github.com/porsager/postgres) driver and handles IAM
token generation, automatic refresh, SSL/TLS setup, and region auto-discovery
from the endpoint hostname. The sample code uses a tagged-template API:

```ts
import { auroraDSQLPostgres } from "@aws/aurora-dsql-postgresjs-connector";

const sql = auroraDSQLPostgres({
  host: CLUSTER_ENDPOINT,
  user: "admin",
});

// Parameterized query — postgres.js handles escaping
const rows = await sql`SELECT * FROM bookings WHERE id = ${id}`;

// Transaction — auto BEGIN/COMMIT, auto ROLLBACK on throw
await sql.begin(async (tx) => {
  await tx`INSERT INTO bookings ...`;
  await tx`UPDATE audit_log ...`;
});
```

### Create Booking — Request Flow

```
Client                    Deno.serve()                    Aurora DSQL
  │                           │                                │
  │  POST /bookings           │                                │
  │  {resource, time, user}   │                                │
  │──────────────────────────▶│                                │
  │                           │                                │
  │                           │  sql.begin — acquire pooled    │
  │                           │  connection (auto-refreshed    │
  │                           │  IAM token if needed)          │
  │                           │                                │
  │                           │  SELECT overlapping bookings   │
  │                           │────────────────────────────────▶│
  │                           │◀────────────────────────────────│
  │                           │                                │
  │                     ┌─────┤  No overlap?                   │
  │                     │ Yes │                                │
  │                     │     │  INSERT new booking            │
  │                     │     │────────────────────────────────▶│
  │                     │     │  (unique-window index enforces │
  │                     │     │   identical-window race)       │
  │                     │     │  COMMIT                        │
  │                     │     │────────────────────────────────▶│
  │                     │     │                                │
  │  201 {booking}      │     │                                │
  │◀──────────────────────────│                                │
  │                     │     │                                │
  │                     │ No  │  Overlap found                 │
  │                     └─────┤  (auto ROLLBACK on return)     │
  │  409 {conflict}           │                                │
  │◀──────────────────────────│                                │
  │                           │                                │
  │                     ┌─────────────────────────────┐        │
  │                     │  If DSQL returns OC000/     │        │
  │                     │  OC001: concurrent txn      │        │
  │                     │  conflict. withOccRetry:    │        │
  │                     │  • Backoff (exp + jitter)   │        │
  │                     │  • Retry up to 3 times      │        │
  │                     │  • Pool refreshes token     │        │
  │                     │    automatically            │        │
  │                     │  If retries exhausted: 503  │        │
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
│ Lookups:                                     │
│   idx_bookings_resource_start ASYNC          │
│     (resource_name, start_time)              │
│ Unique-window race backstop:                 │
│   idx_bookings_uniq_window UNIQUE ASYNC      │
│     (resource_name, start_time, end_time)    │
└──────────────────────────────────────────────┘
```

---

## Concurrency model — what's serialized and what isn't

This sample uses a layered defense against double-booking:

1. **Application-layer overlap check** (inside the transaction) catches the
   common case: a new booking whose window partially overlaps an existing
   one. Returns HTTP 409 with `conflicting_id`.
2. **Unique-index backstop** on `(resource_name, start_time, end_time)`
   catches the race where two concurrent transactions both pass the overlap
   check at the same instant and then both try to INSERT the *same* window.
   The loser gets SQLSTATE 23505 and returns HTTP 409.
3. **OCC retry wrapper** (`withOccRetry`) handles SQLSTATE OC000/OC001/40001
   — Aurora DSQL's signal that a transaction lost an optimistic concurrency
   race and should be retried. The wrapper retries with exponential backoff.

**Consideration for concurrent writes.** The unique index enforces
identical windows. Two concurrent transactions inserting *overlapping but
distinct* windows (e.g., `[9:00–10:00]` and `[9:30–10:30]`) may both
commit if they interleave their SELECT and INSERT. The application-layer
check covers sequential writes. For strict serialization of overlapping
writes under high contention, use application-level row locks (via
`SELECT ... FOR UPDATE` on a parent `resources` row) or route writes for
the same resource through a queue.

The integration test `occ-overlap-race.integration.test.ts` documents
both cases: the success case (identical windows → exactly one 201,
rest 409/503) and the overlapping-but-distinct case.

---

## Key Design Decisions for Aurora DSQL

| Decision | Rationale |
|----------|-----------|
| **Aurora DSQL Connector for postgres.js** | Handles IAM token generation, refresh, SSL/TLS, and region auto-discovery so the sample code stays focused on domain logic |
| **Pooled `sql` client (lifetime-scoped)** | The connector pool reuses connections across requests, refreshing IAM tokens transparently. Works cleanly on serverless warm starts (e.g., Deno Deploy) |
| **UUID primary keys via `gen_random_uuid()`** | UUIDs spread writes across storage nodes, which benefits distributed workloads. Aurora DSQL also supports `CREATE SEQUENCE` and `GENERATED AS IDENTITY` if you prefer compact integer keys — see the [Sequences and identity columns](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/sequences-identity-columns.html) guide for caching guidance |
| **Application-layer referential integrity** | For referential integrity patterns, Aurora DSQL's [migration guide](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-migration-guide.html) recommends enforcing relationships in the application layer. This sample stores `booked_by` as a plain string rather than a foreign key; a production app would validate against a `users` table in the same transaction |
| **Application-layer overlap detection** | To express "no two rows may have overlapping `[start, end)` ranges for the same resource," the sample combines an application-layer SELECT, a unique-window index, and OCC retry. See the concurrency model section for the full pattern |
| **`CREATE [UNIQUE] INDEX ASYNC`** | Aurora DSQL uses `CREATE INDEX ASYNC` for non-blocking index creation. `setupSchema` waits for the returned `job_id` to complete before handling traffic — see the [Asynchronous indexes](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-create-index-async.html) guide |
| **`Deno.serve()` (no framework)** | Zero external Deno dependencies beyond the connector; matches the minimal sample philosophy |

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Deno** | 2.x+ | Runtime and HTTP server |
| **AWS CLI** | v2.x | Credential configuration |
| **python3** | 3.x | JSON parsing in test script |

You also need:

* An AWS account with default credentials configured as described in the
  [Globally configuring AWS SDKs and tools](https://docs.aws.amazon.com/credref/latest/refdocs/creds-config-files.html)
  guide.
* An Aurora DSQL cluster. See the
  [Getting started with Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html)
  guide.

---

## Environment Variables

```bash
# Required
export CLUSTER_ENDPOINT="<your-cluster>.dsql.us-east-1.on.aws"
export CLUSTER_USER="admin"

# Optional
export PORT=8000                  # HTTP server port (default: 8000)
export HOST="127.0.0.1"           # HTTP bind address (default: localhost)
                                  # Set "0.0.0.0" only when deploying behind
                                  # a trusted reverse proxy
export AWS_REGION="us-east-1"     # Auto-discovered from CLUSTER_ENDPOINT
export CLEANUP_ON_EXIT="false"    # If "true", DROP the bookings table
                                  # on SIGINT/SIGTERM (default: preserve)
```

**Safe-by-default binding.** The server binds to `127.0.0.1` unless `HOST`
is explicitly overridden. This prevents accidental exposure on
multi-tenant hosts or public interfaces. Override only when you have an
explicit deployment layer in front of the process.

**Token management.** The connector generates and refreshes IAM tokens
automatically inside the pool — there is no application-level token
lifetime to manage. Tokens are regenerated as needed when pooled
connections are recycled.

---

## Setup and Run

### Start the server

```bash
deno task start
```

On startup, the server creates the `bookings` table, two async indexes,
and a `non_admin_user` database role (if they don't already exist).

On shutdown (Ctrl+C) the schema is preserved by default. Set
`CLEANUP_ON_EXIT=true` to drop the table for clean sample teardown.

### Run tests

```bash
# All tests (fast property tests + integration tests against cluster)
deno task test

# Property-based tests only (no cluster needed)
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

The list endpoint returns all rows. For production deployments with many
bookings, add pagination (e.g., `?limit=50&after=<id>`) and an index on
`created_at` to support keyset pagination.

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
| 413 | `{"error": "Request body too large"}` |
| 503 | `{"error": "Service unavailable — database connection failed"}` |
| 503 | `{"error": "Service busy — transaction conflict. Retry after a short backoff."}` |

Input validation runs in two layers: first at the HTTP boundary (required
fields, JSON shape, body size cap), then again at the DB layer (NOT NULL,
CHECK `end_time > start_time`, unique index). Both layers return 4xx
responses — the DB-level checks are a safety net, not the primary
validation path.

---

## Project Structure

```
├── main.ts                          # HTTP server entry point
├── handlers.ts                      # Booking CRUD handlers with routing
├── db.ts                            # Connector wiring (createClient factory)
├── schema.ts                        # Table, index, role setup/teardown
├── occ-retry.ts                     # OCC retry wrapper (OC000/OC001)
├── deno.json                        # Deno config (imports, tasks, permissions)
├── deno.lock                        # Dependency lock file
├── test-api.sh                      # API smoke test script
├── test-mocks.ts                    # Test helper for property tests
├── test/
│   └── integration.test.ts          # CRUD integration tests (cluster)
├── occ-overlap-race.integration.test.ts  # Concurrency tests (cluster)
├── *.property.test.ts               # Property-based tests (no cluster)
└── README.md
```

---

## OCC Retry Behavior

Aurora DSQL uses optimistic concurrency control (OCC) for transaction
isolation. When two transactions conflict — for example, two users
updating the same booking at the same time — Aurora DSQL aborts one
with SQLSTATE `OC000`, `OC001`, or `40001` (serialization failure).
Applications retry the aborted transaction.

This sample handles those errors automatically via the `withOccRetry`
utility:

* Detects OCC SQLSTATEs at `error.code` (postgres.js attaches the
  SQLSTATE directly, not in a nested field)
* Retries the failed transaction up to 3 times (configurable)
* Applies exponential backoff with jitter to reduce contention
* Logs each retry attempt with attempt number and elapsed time
* Throws `OCC retry exhausted` if all retries fail — mapped to HTTP 503

All write operations (`POST`, `PUT`, `DELETE`) are wrapped in `withOccRetry`.

---

## Deno Permissions Model

This sample runs with the minimum permissions required:

| Flag | Purpose |
|------|---------|
| `--allow-net` | Database connections (port 5432), HTTP server, and AWS SDK calls (for IAM signing) |
| `--allow-env` | Reading `CLUSTER_ENDPOINT`, `CLUSTER_USER`, `HOST`, `PORT`, `AWS_REGION`, and AWS credential variables |
| `--allow-read` | System CA certificates for SSL/TLS verification |
| `--allow-sys` | System info required by the AWS SDK |

Deno's default-deny security model complements Aurora DSQL's IAM-based
authentication to provide defense in depth. Even if application code is
compromised, the Deno runtime restricts what the process can access at
the OS level.

If you run the application without the required flags, Deno will deny the
operation and display a permission error — demonstrating the default-deny
security posture.

---

## Deploying to Deno Deploy

This sample can be adapted for deployment to
[Deno Deploy](https://deno.com/deploy):

1. The connector pool refreshes IAM tokens automatically on warm starts.
2. No file-system state or global mutable singletons.

To deploy, export the request handler as a default `{ fetch }` object
(Deno Deploy invokes that per request) and remove the top-level
`Deno.serve(...)` call. Then:

1. Push the code to a GitHub repository.
2. Link the repository to a Deno Deploy project.
3. Set the entry point to `main.ts`.
4. Configure the environment variables (`CLUSTER_ENDPOINT`, `CLUSTER_USER`,
   `AWS_REGION`) in the Deno Deploy dashboard.
5. Configure AWS credentials via environment variables.

**Note:** For production deployments, remove the `setupSchema` call from
`main.ts` and manage the schema separately. Keep `CLEANUP_ON_EXIT` unset
(or `false`) to avoid dropping tables on graceful shutdowns.

---

## Additional resources

* [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
* [Aurora DSQL Connector for postgres.js](https://github.com/awslabs/aurora-dsql-connectors/tree/main/node/postgres-js)
* [postgres.js](https://github.com/porsager/postgres)
* [Deno.serve() API](https://docs.deno.com/api/deno/~/Deno.serve)
* [Deno Deploy](https://deno.com/deploy)

---

## Contributing

See [CONTRIBUTING](https://github.com/aws-samples/aurora-dsql-samples/blob/main/CONTRIBUTING.md) for more information.

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
