# Flyway on Amazon Aurora DSQL

A runnable sample that applies 16 Flyway migrations to a real
[Amazon Aurora DSQL](https://aws.amazon.com/rds/aurora/dsql/) cluster
using the official Flyway Aurora DSQL module.

Aurora DSQL support is built in. Aurora DSQL
[launched support for Flyway on 25 February 2026](https://aws.amazon.com/about-aws/whats-new/2026/02/aurora-dsql-launches-tortoise-flyway-prisma/),
and the database module is published on Maven Central as
`org.flywaydb:flyway-database-dsql`. You do not need to write or build
anything to make Flyway talk to Aurora DSQL. Drop the module and the
Aurora DSQL JDBC Connector on the Flyway classpath and `flyway migrate`
works.

What this sample is for is the part the module cannot do for you:
**writing migrations that Aurora DSQL will accept.** Aurora DSQL is not
PostgreSQL. A migration that is routine on Amazon RDS for PostgreSQL can
fail on Aurora DSQL because it mixes DDL and DML in one transaction, or
puts an inline constraint on `ADD COLUMN`, or assumes `CREATE INDEX` is
synchronous. The 16 migrations here are each a worked example of one of
those rules.

## What this sample demonstrates

- `flyway migrate` applies 16 migrations covering DDL, DML, async index
  builds, constraint patterns, and a long-running statement.
- The migration-authoring rules Aurora DSQL imposes, one per file, with
  the error you get when you break each one.
- `flyway.dsql.awaitAsyncIndexes` blocking a migration until a
  `CREATE INDEX ASYNC` build reaches `VALID`, rather than returning while
  the index is still building.
- `flyway.dsql.occMaxRetries` retrying a migration transaction that loses
  an optimistic concurrency check.
- Why you still need to serialize migration runs in your pipeline, with a
  reproduction of what happens when you don't
  ([`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md), limitation 2).

## Which module artifact to use

The same code is published twice:

| Coordinates | Published by | Notes |
|---|---|---|
| `org.flywaydb:flyway-database-dsql:10.26.0` | Flyway (Redgate), on Maven Central | Used by this sample. |
| `software.amazon.dsql:aurora-dsql-flyway-support:3.0.0` | AWS, see [awslabs/aurora-dsql-tools](https://github.com/awslabs/aurora-dsql-tools/tree/main/flyway) | Repackages the same module source. |

The AWS artifact packages the upstream `flyway-database-dsql` 10.26.0
source with the implementation unchanged. Pick one. Loading both puts two
copies of the same `DatabaseType` on the classpath, which the AWS README
warns against.

## Pinned versions

| Component | Version | Why pinned |
|---|---|---|
| Flyway CLI | `flyway/flyway:11.20.3-alpine` | Exact tag rather than the floating `11-alpine`, so a new Flyway release cannot silently change what this sample builds against. |
| Flyway Aurora DSQL module | 10.26.0 | Project version of `flyway-community-db-support`, not a Flyway version. This release targets Flyway 11.9.0 and loads correctly on the 11.20.3 runtime above. |
| Aurora DSQL JDBC Connector | 1.5.0 | Supplies the `jdbc:aws-dsql:postgresql://` URL scheme and mints the IAM auth token. The module expects you to provide it. |
| pgJDBC | 42.7.11 | Underlying PostgreSQL wire driver. |
| AWS SDK for Java | 2.44.13 | Transitive requirement of the connector, pinned so a rebuild produces the same classpath. |

## Prerequisites

- An Aurora DSQL cluster. Any region works. This sample was developed
  against `us-east-1`.
- AWS credentials with `dsql:DbConnectAdmin` on the cluster. The sample
  uses the ambient credential chain, so whatever `aws sts get-caller-identity`
  reports is what it will connect as.
- Docker (Desktop, Rancher, Colima, or Podman with a Docker-compatible CLI).
- GNU Make (ships with the macOS Command Line Tools; `apt install make` on
  Linux).

## Quick start

```bash
cd sample-amazon-aurora-dsql-flyway-extension

cp .env.example .env
$EDITOR .env                     # set DSQL_ENDPOINT

make build                       # pull the Flyway image + module jars
make info                        # read migration state from the cluster
make migrate                     # apply V1 through V16
make verify-schema               # inspect tables, indexes, constraints
```

If `migrate` stops on a failed migration, run `make repair` to clear the
failed row from `flyway_schema_history`, then `make migrate` again.

### Choosing the cluster

`make` resolves `DSQL_ENDPOINT` in this order, highest first:

1. `make DSQL_ENDPOINT=my-other-cluster.dsql.us-east-1.on.aws migrate`
2. an exported `DSQL_ENDPOINT` in your shell
3. `.env`

Worth knowing because `make reset` and the test targets drop tables. If you
keep a cluster in `.env` and then point your shell somewhere else, the shell
wins. `make reset` prints the endpoint it is about to act on and asks for
confirmation before it drops anything.

## All Make targets

```
$ make help
  help               Show this help
  build              Build the Docker image (Flyway CLI + Aurora DSQL module)
  info               Show Flyway migration status against the configured cluster
  migrate            Apply pending migrations
  repair             Clear failed migrations from flyway_schema_history so retry can proceed
  validate           Validate applied migrations against the migration files
  verify-schema      Inspect the cluster: tables, flyway_schema_history, indexes
  reset              Drop every object the migrations created (DANGEROUS; dev only)
  reproduce-occ      Run two concurrent migrate against one cluster
  test               Run every test in order
  test-happy         End-to-end apply + verify
  test-occ           Demonstrate a concurrent-migrate race (see KNOWN_LIMITATIONS.md #2)
  clean              Remove local Docker image and tmp files
```

## File layout

```
sample-amazon-aurora-dsql-flyway-extension/
├── README.md                   <- this file
├── KNOWN_LIMITATIONS.md        <- read before adopting this in production
├── Dockerfile                  <- Flyway CLI + module jars from Maven Central
├── docker-compose.yml          <- runs the image with env + volume mounts
├── Makefile                    <- make migrate, make test, etc.
├── flyway.conf.example         <- Flyway config template, substituted at run time
├── .env.example                <- environment template (copy to .env)
├── migrations/                 <- V*.sql files; mounted at /flyway/migrations
│   ├── V1__init_users.sql                  <- CREATE TABLE, inline PK
│   ├── V2__add_sessions.sql                <- inline FK + UNIQUE
│   ├── V3__add_sessions_user_id_index.sql  <- CREATE INDEX ASYNC
│   ├── V4__add_user_role_column.sql        <- ADD COLUMN, no inline constraint
│   ├── V5__backfill_user_role.sql          <- DML, separate file from the DDL
│   ├── V6__set_user_role_default.sql       <- ALTER COLUMN SET DEFAULT
│   ├── V7__add_sessions_created_at_index.sql
│   ├── V8__add_users_last_login_at.sql
│   ├── V9__backfill_users_last_login_at.sql
│   ├── V10__refresh_users_last_login_at.sql <- backfill on a populated table
│   ├── V11__add_audit_log_with_fk.sql      <- FK declared at CREATE TABLE time
│   ├── V12__add_products_with_check.sql    <- CHECK constraint
│   ├── V13__drop_sessions_revoked_at.sql   <- DROP COLUMN
│   ├── V14__rename_products_name.sql       <- RENAME COLUMN
│   ├── V15__add_sessions_expires_at_index.sql
│   └── V16__long_running_demo.sql          <- long-running statement
├── scripts/
│   ├── run-flyway.sh             <- Flyway wrapper; retries token expiry
│   ├── mint-token.sh             <- mint a DSQL IAM auth token for psql
│   ├── reset-db.sh               <- DANGEROUS; drops every table the sample creates
│   ├── verify-schema.sh          <- inspect tables / history / indexes
│   ├── seed-data.sh              <- 50 users + 200 sessions
│   ├── bulk-seed-sessions.sh     <- larger dataset for async index testing
│   └── reproduce-occ-conflict.sh <- race two migrates
└── tests/
    ├── test-happy-path.sh        <- end-to-end apply + 24 structural assertions
    └── test-occ-handling.sh      <- concurrent-migrate race
```

## How it works

```
┌──────────────────────────────────────────────────────────────────┐
│  Developer or CI shell                                           │
│    make migrate -> docker compose run flyway run-flyway.sh migrate│
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  Docker container (flyway-dsql-sample:latest)                    │
│                                                                  │
│  /flyway/drivers/                                                │
│    flyway-database-dsql-10.26.0.jar    <- official module        │
│    aurora-dsql-jdbc-connector-1.5.0.jar                          │
│    postgresql-42.7.11.jar                                        │
│    aws-sdk-java-v2 jars                                          │
│                                                                  │
│  The Flyway CLI discovers the module through the Plugin service   │
│  loader, matches jdbc:aws-dsql:postgresql://, and uses the        │
│  module's Database and Connection implementations.                │
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼ JDBC, IAM token minted by the connector
┌──────────────────────────────────────────────────────────────────┐
│  Amazon Aurora DSQL cluster                                      │
│                                                                  │
│  flyway_schema_history       <- Flyway's own tracking table      │
│  users | sessions | audit_log | products   <- sample schema      │
└──────────────────────────────────────────────────────────────────┘
```

## Aurora DSQL settings in flyway.conf

Two settings come from the module rather than Flyway core. Both are set in
[`flyway.conf.example`](./flyway.conf.example) with the reasoning inline.

| Setting | Upstream default | Value here | Effect |
|---|---|---|---|
| `flyway.dsql.awaitAsyncIndexes` | `false` | `true` | After a statement that matches `CREATE INDEX ASYNC`, read the returned `job_id` and block on `sys.wait_for_job` until the build finishes. Without it, the migration reports success while the index is still building. |
| `flyway.dsql.occMaxRetries` | `0` | `3` | Retry the migration transaction when Aurora DSQL rejects it with an optimistic concurrency conflict. `0` disables retries. |
| `flyway.dsql.occMaxRetryDelaySeconds` | `5` | `5` | Upper bound on the exponential backoff between those retries. |

Both behaviours are opt-in. If you copy the migrations out of this sample
without also copying the config, you get no index waiting and no OCC retry.
The equivalent environment variables are `FLYWAY_DSQL_AWAIT_ASYNC_INDEXES`,
`FLYWAY_DSQL_OCC_MAX_RETRIES`, and
`FLYWAY_DSQL_OCC_MAX_RETRY_DELAY_SECONDS`.

The module's own documentation lists these and the per-transaction limits:
[flyway-database-dsql](https://github.com/flyway/flyway-community-db-support/tree/main/flyway-database-dsql).

`flyway baseline` as a standalone command does not work on Aurora DSQL,
because it creates the history table and inserts the marker row in one
transaction, which mixes DDL and DML. Use `flyway.baselineOnMigrate=true`
instead, which does the equivalent during `migrate`.

## Running the test suite

```bash
make test                    # both tests, in order
make test-happy              # end-to-end apply + 24 structural assertions
make test-occ                # concurrent-migrate race
```

`test-occ` starts two `migrate` runs in parallel. It is a demonstration of
the failure mode rather than a passing guarantee: see limitation 2 in
[`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md) for what we observed and
why you should serialize migrations in your pipeline regardless.

## Troubleshooting

**`security token ... is expired`** means your AWS credentials aged out.
Refresh them however your environment does it, then retry. Check the active
identity with `aws sts get-caller-identity`.

**`ERROR: ddl and dml are not supported in the same transaction`** means a
migration file mixes schema changes with data changes. Split it into
separate files, one logical change each. V4, V5, and V6 are the canonical
example: add the column, backfill it, then set the default.

**`ALTER TABLE ADD COLUMN with constraint not supported`** means an inline
constraint on `ADD COLUMN`. Aurora DSQL rejects those. Use the same
three-step split as above.

**`Validate failed: Detected failed migration to version N`** means a
previous run left a failed row in `flyway_schema_history`. Run
`make repair`, then `make migrate`.

**`CALL sys.wait_for_job not supported in transaction block`** means you
are calling it by hand inside a migration script. Let
`flyway.dsql.awaitAsyncIndexes=true` handle the wait instead.

**`no job_id was found in its result`** after a `CREATE INDEX ASYNC IF NOT
EXISTS` on an index that already exists. This is a real interaction between
`IF NOT EXISTS` and `awaitAsyncIndexes`; see limitation 3 in
[`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md).

**`SSL SYSCALL error: EOF detected` from psql** is a transient at the
Aurora DSQL frontend. The sample's psql helpers retry. Flyway's own JDBC
path does not see it.

For the full set of constraints this sample ran into, see
[`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md).
