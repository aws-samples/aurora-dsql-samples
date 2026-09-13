# Sequelize + Amazon Aurora DSQL: Hotel Reservation Application

This sample demonstrates how to build a Node.js application using [Sequelize](https://sequelize.org/) with [Amazon Aurora DSQL](https://aws.amazon.com/rds/aurora/dsql/).

## What it demonstrates

* Sequelize models with UUID primary keys for Aurora DSQL's distributed architecture
* Database-enforced referential integrity using Aurora DSQL foreign key constraints (a capability that became generally available in August 2026), with UUID relationship columns and Sequelize associations for eager loading — modeling relationships at the application level with UUID columns remains a valid alternative
* IAM authentication via the [Aurora DSQL Connector for node-postgres](https://github.com/awslabs/aurora-dsql-connectors/tree/main/node/node-postgres) (`@aws/aurora-dsql-node-postgres-connector`), which automatically generates and refreshes IAM tokens — no static passwords, for both admin and non-admin users
* Individual DDL execution (Aurora DSQL does not support multiple DDL statements per transaction)
* Optimistic concurrency control (OCC) retry logic with exponential backoff and jitter
* Schema isolation for a least-privilege, non-admin application user

## ⚠️ Important

* Running this code might result in charges to your AWS account.
* We recommend that you grant your code least privilege. At most, grant only the
  minimum permissions required to perform the task. For more information, see
  [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege).
* This code is not tested in every AWS Region. For more information, see
  [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services).

## Prerequisites

* Node.js 20 or later (required by the Aurora DSQL connector)
* AWS CLI v2 configured with credentials
* An Aurora DSQL cluster (single-Region is sufficient)
* IAM permissions: `dsql:DbConnectAdmin` and `dsql:DbConnect` on your cluster

## Setup

Install dependencies:

```bash
npm install
```

## Configuration

Set the following environment variables:

```bash
export CLUSTER_ENDPOINT="your-cluster.dsql.your-region.on.aws"
export CLUSTER_USER="admin"           # required — see below for recommended non-admin setup
# CLUSTER_REGION is optional — the connector auto-detects the Region from the endpoint
```

## Run (initial setup — admin)

Admin access is needed only for one-time schema and role creation. After setup, use the non-admin app user (recommended below).

```bash
# Test connectivity first
npm run test:connection

# Run the full demo. This creates the schema and tables if needed, then CLEARS
# any existing rows in these tables before seeding fresh demo data, so the run
# is repeatable. Point it at a database/schema that only holds this sample's data.
npm start

# After reviewing the data in your database, clean up
npm run cleanup
```

When you run the demo, the application creates the schema, registers guests, sets up rooms, processes reservations end to end (create, check-in, check-out, payment), queries guest history and room availability, prints a revenue report, and demonstrates the OCC retry pattern with a retry-safe loyalty-tier update.

## Running tests

Unit tests are pure logic — they require no AWS credentials, no network, and no live cluster:

```bash
npm test
```

Integration tests exercise the full workflow against a live Aurora DSQL cluster (schema creation, foreign-key enforcement, eager loading, OCC retry, and cleanup). They are skipped automatically unless `CLUSTER_ENDPOINT` and `CLUSTER_USER` are set, so `npm test` stays green offline:

```bash
export CLUSTER_ENDPOINT="your-cluster.dsql.your-region.on.aws"
export CLUSTER_USER="admin"   # or your non-admin app role (with CLUSTER_SCHEMA)
npm run test:integration
```

## Running as a non-admin app user (recommended for production)

For production workloads, use a least-privilege app user instead of admin. This is the recommended path after initial setup.

In Aurora DSQL, every non-admin database user maps 1:1 to an IAM identity — you link a database role to an IAM ARN with the `AWS IAM GRANT` command.

**Note:** This step requires an IAM user with permissions to create IAM policies and modify Aurora DSQL cluster access. If your current user lacks these permissions, ask your AWS account administrator.

### 1. Ensure your IAM user has `dsql:DbConnect`

Your IAM policy should include both actions:

```json
{
    "Sid": "DatabaseAccess",
    "Effect": "Allow",
    "Action": [
        "dsql:DbConnectAdmin",
        "dsql:DbConnect"
    ],
    "Resource": "arn:aws:dsql:<region>:<account-id>:cluster/<cluster-id>"
}
```

### 2. Create the database role and schema (run once as admin)

Edit `src/setup_app_user.sql` — replace `<AWS_ACCOUNT_ID>` and `<IAM_USERNAME>` with your values, then run:

```bash
# Generate an admin auth token
TOKEN=$(aws dsql generate-db-connect-admin-auth-token \
  --hostname $CLUSTER_ENDPOINT \
  --region $CLUSTER_REGION \
  --expires-in 3600)

# Run the SQL file to create the role, schema, and permissions
psql "host=$CLUSTER_ENDPOINT port=5432 dbname=postgres user=admin sslmode=require password=${TOKEN}" \
  -f src/setup_app_user.sql
```

### 3. Configure the app to use the non-admin user

```bash
export CLUSTER_USER="hotel_app"
export CLUSTER_SCHEMA="hotel"
```

For example, if your AWS account ID is `111222333444` and your IAM user is `jdoe`, the `AWS IAM GRANT` line in `setup_app_user.sql` would read:

```sql
AWS IAM GRANT hotel_app TO 'arn:aws:iam::111222333444:user/jdoe';
```

### 4. Run the app

```bash
# Test connectivity with the app user
npm run test:connection

# Run the full demo (clears existing rows in these tables, then seeds demo data)
npm start

# After reviewing the data, clean up
npm run cleanup
```

The Aurora DSQL connector automatically selects the correct authentication token based on the username:

* `admin` → an admin authentication token (requires IAM `dsql:DbConnectAdmin`)
* Any other user → a standard authentication token (requires IAM `dsql:DbConnect`)

No `sts:AssumeRole` is required — the same IAM credentials that authenticate the AWS API call are linked to the database role via `AWS IAM GRANT`.

## Project structure

```
sequelize/
├── package.json            # Project metadata, scripts, dependencies
├── package-lock.json       # Pinned dependency versions
├── .gitignore
├── README.md
├── src/
│   ├── models.js           # Sequelize model definitions (Guest, Room, Reservation, Payment)
│   ├── db.js               # Aurora DSQL connection setup (connector integration), schema creation
│   ├── retry.js            # OCC retry utility with exponential backoff and jitter
│   ├── app.js              # Main hotel reservation demonstration application
│   ├── cleanup.js          # Remove demo data (run separately after reviewing)
│   ├── test_connection.js  # Quick connectivity verification
│   └── setup_app_user.sql  # SQL commands to create a non-admin app user
└── test/
    ├── test_example.test.js  # Unit tests — config, models, retry (no credentials required)
    └── integration.test.js   # Live end-to-end tests (skipped unless a cluster is configured)
```

## Key Aurora DSQL adaptations

1. **UUID primary keys**: `DataTypes.UUID` with `DataTypes.UUIDV4` — no coordination across the distributed system.
2. **Foreign key constraints**: Aurora DSQL added support for foreign key constraints (generally available August 2026), so this sample enforces referential integrity at the database level. `reservation` references `guest` and `room`; `payment` references `reservation` and `guest`. Referenced tables are created before referencing tables. We use the default `ON DELETE NO ACTION` behavior — following AWS guidance to prefer `NO ACTION`/`RESTRICT` over `CASCADE` when child-row cardinality is unbounded (guests accumulate reservations and payments). Cascading actions run in a single transaction and count against the Aurora DSQL 3,000-row transaction limit, so they can fail unexpectedly at scale. Note also that FK checks add extra reads, and concurrent conflicts on referenced keys surface as retryable serialization errors (`OC000` / `SQLSTATE 40001`) rather than lock waits — so write paths use the OCC retry helper. If you prefer, you can instead model relationships purely at the application level with UUID columns (setting `constraints: false` on the Sequelize associations); both approaches work well on Aurora DSQL.
3. **Individual DDL execution**: Each `CREATE TABLE` runs as its own statement via `sequelize.query(ddl, { raw: true })` after `SET search_path`.
4. **OCC retry**: Catches `SQLSTATE 40001` (error codes `OC000`/`OC001`) and retries with exponential backoff and jitter. Because Sequelize runs in autocommit mode by default, single-statement operations are safe to retry; do not wrap a retried operation in a bare `sequelize.transaction()`.
5. **Connector integration + connection compatibility**: The Aurora DSQL connector plugs into Sequelize via `dialectModule: { ...pg, Client: AuroraDSQLClient }`, so Sequelize uses `node-postgres` but with the connector's IAM-authenticating client (it also auto-detects the AWS Region from the cluster endpoint). The connection also sets `clientMinMessages: 'ignore'`, `standardConformingStrings: false`, and `keepDefaultTimezone: true` to avoid unsupported session `SET` commands.

## Considerations for `setup_app_user.sql`

A few Aurora DSQL specifics shaped how this script is written:

* **Idempotent role creation.** `setup_app_user.sql` uses a plain `CREATE ROLE` (re-running errors harmlessly with "role already exists"; the remaining statements are idempotent), rather than wrapping it in a `plpgsql` `DO $$ ... $$` block.
* **Schema owned by admin.** The schema is created owned by admin, and the app role is granted `USAGE, CREATE` plus CRUD, rather than using `CREATE SCHEMA ... AUTHORIZATION <iam-role>`.
* **`ALTER DEFAULT PRIVILEGES`** is required so the app role can access tables the application creates at runtime — `GRANT ... ON ALL TABLES` only covers tables that exist at grant time.
* **Schema-qualify your models for a non-admin user.** A non-admin role's default `search_path` (`"$user", public`) resolves unqualified table names to the `public` schema. If a same-named table exists in `public` (owned by another role), unqualified queries hit it and fail with `permission denied`. This sample sets `schema: SCHEMA` on every model so all queries are schema-qualified (for example `"hotel"."payment"`) regardless of `search_path`.

## Verifying the foreign keys

After creating the schema, you can confirm the foreign keys landed and are enforced. Connect as `admin` and run:

```sql
-- List each foreign key, its parent, and referential actions
SELECT tc.table_name AS child_table,
       kcu.column_name AS fk_column,
       ccu.table_name AS parent_table,
       ccu.column_name AS parent_column,
       rc.delete_rule AS on_delete,
       rc.update_rule AS on_update
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
ORDER BY child_table, fk_column;
```

Expect four foreign keys (`reservation` → `guest`/`room`, `payment` → `reservation`/`guest`), each with `on_delete`/`on_update` = `NO ACTION`. You can also confirm each constraint is validated and enforcing with `SELECT conname, convalidated, confdeltype FROM pg_constraint WHERE contype = 'f';` (`convalidated = t`, `confdeltype = a`).

## Security

* No static passwords — IAM tokens are generated and refreshed at runtime by the Aurora DSQL connector (`@aws/aurora-dsql-node-postgres-connector`)
* TLS is required for all connections to Aurora DSQL; the connector negotiates TLS automatically
* Tokens are short-lived; the connector generates a fresh token for each new connection
* Use a least-privilege non-admin app user for runtime; reserve admin for schema setup and migrations

## Additional resources

* [Aurora DSQL User Guide](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
* [Sequelize Documentation](https://sequelize.org/)

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
