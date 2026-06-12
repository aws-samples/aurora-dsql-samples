# User Authentication Service with Session Management on Aurora DSQL

A user authentication service with session management built on Amazon Aurora DSQL. Demonstrates DSQL-specific patterns including strong consistency, IAM authentication, OCC retry, and application-level referential integrity.

## Tech Stack

- Node.js 20+ / TypeScript
- Express.js
- Amazon Aurora DSQL (via `@aws/aurora-dsql-node-postgres-connector`)
- Vitest for testing

## Prerequisites

- AWS account with `AmazonAuroraDSQLConsoleFullAccess` policy
- Node.js 20+ and npm
- AWS CLI configured with valid credentials
- An Aurora DSQL cluster (single-Region)

## Setup

1. Create a DSQL cluster at https://console.aws.amazon.com/dsql
2. Wait for status to show Active
3. Copy the cluster endpoint

```bash
npm install
export DSQL_ENDPOINT="your-cluster-id.dsql.us-east-1.on.aws"
npm run build
npm start
```

## Running Tests (no DSQL cluster needed)

```bash
npm test
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register a new user |
| POST | /api/auth/login | Authenticate and receive a session token |
| GET | /api/auth/me | Retrieve the authenticated user's profile |
| GET | /api/sessions | List all active sessions |
| DELETE | /api/sessions/:sessionId | Revoke a specific session |
| DELETE | /api/sessions | Revoke all sessions (optionally exclude current) |

## Testing the API

### Happy path

```bash
# 1. Register
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com", "password": "secureP@ss1"}' | jq

# 2. Login
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com", "password": "secureP@ss1"}' | jq

# 3. Get profile (use token from login)
curl -s http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <token>" | jq

# 4. List sessions
curl -s http://localhost:3000/api/sessions \
  -H "Authorization: Bearer <token>" | jq

# 5. Revoke a session (use session ID from list)
curl -s -X DELETE http://localhost:3000/api/sessions/<session-id> \
  -H "Authorization: Bearer <token>" | jq

# 6. Verify revoked token is rejected (strong consistency)
curl -s http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <token>" | jq
# Expected: 401 Invalid session
```

### Negative tests

```bash
# Duplicate registration (expect 409)
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com", "password": "secureP@ss1"}' | jq

# Wrong password (expect 401, generic message)
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com", "password": "wrongpassword"}' | jq

# Non-existent email (expect same 401 message — user enumeration prevention)
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "nobody@example.com", "password": "secureP@ss1"}' | jq

# Invalid email format (expect 400)
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "not-an-email", "password": "secureP@ss1"}' | jq

# Short password (expect 400)
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "new@example.com", "password": "short"}' | jq

# Missing fields (expect 400)
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{}' | jq

# Invalid token (expect 401)
curl -s http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer fake-token-12345" | jq

# No auth header (expect 401)
curl -s http://localhost:3000/api/auth/me | jq

# Revoke all sessions except current
curl -s -X DELETE "http://localhost:3000/api/sessions?excludeCurrent=true" \
  -H "Authorization: Bearer <token>" | jq
```

### Console verification

In the DSQL Query Editor:

```sql
SELECT id, email, created_at FROM users;
SELECT id, user_id, created_at, expires_at, revoked_at FROM sessions;
```

## DSQL-Specific Patterns

- No foreign keys: referential integrity enforced in application code
- `CREATE INDEX ASYNC` (not `CREATE INDEX`)
- OCC retry with exponential backoff (SQLSTATE 40001)
- IAM-based database authentication (no static passwords)
- UUIDs generated app-side
- 1 DDL per transaction
- 3,000 row limit per DML transaction

## Operational Notes

### Async indexes are not immediately VALID

`migrate.ts` uses `CREATE INDEX ASYNC`, which returns immediately while the index is built in the background. The first reads against `sessions.user_id` after a fresh migration will fall back to a full table scan until the index reaches `VALID` state. This is fine for an empty or small `sessions` table, but on a populated cluster you should wait for the index to finish building before relying on it for performance. See the [Aurora DSQL supported SQL features](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-supported-sql-features.html) page for guidance on monitoring async index status.

The `sessions.token_hash` column is intentionally NOT given an explicit `CREATE INDEX` — the `UNIQUE` constraint on the column already creates a backing unique index, so adding a second one would just waste write IOPS.

### Production hardening checklist

This sample focuses on demonstrating Aurora DSQL patterns. Before running in production, add the following layers:

- **Custom database role for the runtime.** The default `connection.ts` connects as `admin`, which is fine for the proof-of-concept but gives the runtime far more authority than it needs. For production, run the included setup script once to create a least-privilege role and map it to your runtime IAM principal:

  ```bash
  AWS_REGION=us-east-1 \
  DSQL_ENDPOINT=<cluster-id>.dsql.us-east-1.on.aws \
  APP_ROLE_NAME=app_runtime \
  APP_TASK_ROLE_ARN=arn:aws:iam::111122223333:role/auth-service-task-role \
  npm run setup-runtime-role
  ```

  Then change `connection.ts` to connect as `app_runtime` instead of `admin`, and attach an IAM task-role policy that grants only `dsql:DbConnect` (not `dsql:DbConnectAdmin`). Keep `admin` for one-off setup steps such as creating the role itself or running migrations. This follows Aurora DSQL's [Database roles and IAM authentication](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-database-roles.html) guidance.

  To roll the role back, you must revoke the IAM mapping before dropping the role, otherwise `DROP ROLE` fails with `2BP01 cannot be dropped because some objects depend on it`:

  ```sql
  AWS IAM REVOKE app_runtime FROM 'arn:aws:iam::111122223333:role/auth-service-task-role';
  DROP ROLE app_runtime;
  ```
- **Rate limiting.** This sample does not include `express-rate-limit` or any throttling. At minimum, add per-IP rate limits to `/api/auth/register` and `/api/auth/login` to slow brute-force credential stuffing.
- **Trusted proxy / X-Forwarded-For handling.** `req.ip` is recorded in `client_metadata` for session listing. Behind a load balancer, this is the LB IP unless you configure `app.set('trust proxy', ...)` with the correct hop count. Configure it explicitly. Never set `trust proxy: true` on a publicly exposed app, since that lets clients spoof `X-Forwarded-For`.
- **bcrypt cost factor.** `passwordHasher.ts` uses cost 10 (~80-100 ms per verify on a typical CPU), suitable for a proof-of-concept. Increase to 12 or higher in production after benchmarking your target hardware.
- **Logging and observability.** Replace the `console.warn` / `console.error` calls in `retryWithBackoff.ts` with a structured logger of your choice and forward to CloudWatch or your aggregator.
- **Token storage on the client.** This sample returns the session token in JSON. In a browser app you'll typically want an HTTP-only, Secure cookie instead.
- **Periodic session purge.** Run `npm run housekeeping` on a schedule (cron, ECS scheduled task, EventBridge-triggered Lambda) to delete expired and long-revoked rows. Configurable via `SESSION_RETENTION_DAYS` (default 30 days). The script wraps each batch in `retryWithBackoff` so transient OCC conflicts don't fail the run.

## Cleanup

Delete the DSQL cluster when done to avoid charges.
