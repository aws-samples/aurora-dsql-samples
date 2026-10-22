# Flyway on Amazon Aurora DSQL

A runnable sample that applies 16 Flyway migrations to a real
[Amazon Aurora DSQL](https://aws.amazon.com/rds/aurora/dsql/) cluster
using the official Flyway Aurora DSQL module.

Aurora DSQL support comes from a community database module you add to
Flyway, not from Flyway itself. Aurora DSQL
[launched support for Flyway on 25 February 2026](https://aws.amazon.com/about-aws/whats-new/2026/02/aurora-dsql-launches-tortoise-flyway-prisma/),
and the module is published on Maven Central as
`org.flywaydb:flyway-database-dsql`. You do not need to write or build
anything. Drop the module and the Aurora DSQL JDBC Connector on the Flyway
classpath and `flyway migrate` works.

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
- `flyway.dsql.awaitAsyncIndexes` configured so a migration blocks until a
  `CREATE INDEX ASYNC` build reaches `VALID`, rather than returning while
  the index is still building.
- `flyway.dsql.occMaxRetries` configured to retry a migration transaction
  that loses an optimistic concurrency check. The sample sets it; no test
  asserts it, because it only fires under contention.
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
cd sample-amazon-aurora-dsql-flyway-migrations

cp .env.example .env
$EDITOR .env                     # set DSQL_ENDPOINT

make build                       # pull the Flyway image + module jars
make create-schema               # create the schema (migrate does this too)
make info                        # read migration state from the cluster
make migrate                     # apply V1 through V16
make verify-schema               # inspect tables, index validity, constraints
```

Everything the sample creates goes into one schema, `flyway_sample` by
default. Override it with `DSQL_SCHEMA`. The table names here are generic, and
`users` and `sessions` in particular are also created by the
`aurora-dsql-auth-session-mgmt` sample, so keeping them in their own schema
means the two can share a cluster and `make reset` cannot reach across.

If `migrate` stops on a failed migration, run `make repair` to clear the
failed row from `flyway_schema_history`, then `make migrate` again. If the
failure was a `CREATE INDEX ASYNC` migration, drop the index first: repair and
migrate alone will loop on the same failure. See the troubleshooting section.

### Choosing the cluster, the schema and the credentials

`make` resolves `DSQL_ENDPOINT`, `AWS_REGION`, `AWS_PROFILE` and
`DSQL_SCHEMA` in this order, highest first:

1. `make DSQL_ENDPOINT=my-other-cluster.dsql.us-east-1.on.aws migrate`
2. an exported value in your shell
3. `.env`

GNU Make resolves variables from an `include`d file above ones inherited from
the environment, which is the opposite of what you want here, so the Makefile
restores the order explicitly for these four.

Worth knowing because `make reset` and the test targets drop a schema. If you
keep a cluster in `.env` and then point your shell somewhere else, the shell
wins. `AWS_PROFILE` is in the list for the same reason: it selects the
credentials, so letting `.env` silently override your shell would mean a
target could act on a different account than the one
`aws sts get-caller-identity` just reported.

`make reset` prints the endpoint and the schema it is about to drop, and asks
for confirmation first. It refuses to touch `public`.

## All Make targets

```
$ make help
  help               Show this help
  build              Build the Docker image (Flyway CLI + Aurora DSQL module)
  info               Show Flyway migration status against the configured cluster
  create-schema      Create the dedicated schema (required once before migrate)
  migrate            Apply pending migrations
  repair             Clear failed migrations from flyway_schema_history so retry can proceed
  validate           Validate applied migrations against the migration files
  verify-schema      Inspect the cluster: tables, flyway_schema_history, indexes
  reset              Drop the sample's schema and everything in it (DANGEROUS; dev only)
  reproduce-occ      Run two concurrent migrate against one cluster
  test               Run the deterministic test suite
  test-happy         End-to-end apply + verify
  test-occ           Demonstrate a concurrent-migrate race; non-deterministic, not part of `make test`
  clean              Remove local Docker image and tmp files
```

## File layout

```
sample-amazon-aurora-dsql-flyway-migrations/
├── README.md                   <- this file
├── KNOWN_LIMITATIONS.md        <- read before adopting this in production
├── Dockerfile                  <- Flyway CLI + module jars from Maven Central
├── docker-compose.yml          <- runs the image with env + volume mounts
├── Makefile                    <- make migrate, make test, etc.
├── flyway.conf.example         <- Flyway config template, substituted at run time
├── .env.example                <- environment template (copy to .env)
├── migrations/                 <- V*.sql files; mounted at /flyway/migrations
│   ├── V1__init_users.sql                  <- CREATE TABLE, inline PK + UNIQUE
│   ├── V2__add_sessions.sql                <- CREATE TABLE, no constraints
│   ├── V3__add_sessions_user_id_index.sql  <- CREATE INDEX ASYNC
│   ├── V4__add_user_role_column.sql        <- ADD COLUMN, no inline constraint
│   ├── V5__backfill_user_role.sql          <- DML, separate file from the DDL
│   ├── V6__set_user_role_default.sql       <- ALTER COLUMN SET DEFAULT
│   ├── V7__add_sessions_created_at_index.sql <- the race target in test-occ
│   ├── V8__add_users_last_login_at.sql     <- ADD COLUMN, nullable
│   ├── V9__backfill_users_last_login_at.sql <- backfill, the wrong way
│   ├── V10__refresh_users_last_login_at.sql <- backfill, the right way
│   ├── V11__add_audit_log_with_fk.sql      <- FK declared at CREATE TABLE time
│   ├── V12__add_products_with_check.sql    <- CHECK constraint
│   ├── V13__drop_sessions_revoked_at.sql   <- DROP COLUMN
│   ├── V14__rename_products_name.sql       <- RENAME COLUMN
│   ├── V15__add_sessions_expires_at_index.sql <- CREATE INDEX ASYNC, awaited
│   └── V16__long_running_demo.sql          <- long-running statement
├── scripts/
│   ├── create-schema.sh          <- create $DSQL_SCHEMA; migrate depends on it
│   ├── run-flyway.sh             <- Flyway wrapper; retries token expiry
│   ├── mint-token.sh             <- mint a DSQL IAM auth token for psql
│   ├── reset-db.sh               <- DANGEROUS; DROP SCHEMA $DSQL_SCHEMA CASCADE
│   ├── verify-schema.sh          <- inspect tables / history / index validity
│   ├── seed-data.sh              <- 50 users + 200 sessions; NOT run by migrate
│   ├── bulk-seed-sessions.sh     <- larger dataset; NOT run by migrate
│   └── reproduce-occ-conflict.sh <- race two migrates
└── tests/
    ├── test-happy-path.sh        <- end-to-end apply + 25 structural assertions
    └── test-occ-handling.sh      <- concurrent-migrate race; non-deterministic
```

The two seed scripts are not part of the migration path. `make migrate` and
`make test` apply the migrations to an empty schema, so the tables are empty
throughout. Run the seed scripts by hand between migrations if you want to
exercise the backfills and the index builds against real rows.

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

Three settings come from the module rather than Flyway core. All three are set
in [`flyway.conf.example`](./flyway.conf.example) with the reasoning inline.

| Setting | Upstream default | Value here | Effect |
|---|---|---|---|
| `flyway.dsql.awaitAsyncIndexes` | `false` | `true` | After a statement that matches `CREATE INDEX ASYNC`, read the returned `job_id` and block on `sys.wait_for_job` until the build finishes. Without it, the migration reports success while the index is still building. |
| `flyway.dsql.occMaxRetries` | `0` | `3` | Retry the migration transaction when Aurora DSQL rejects it with an optimistic concurrency conflict. `0` disables retries. |
| `flyway.dsql.occMaxRetryDelaySeconds` | `5` | `5` | Upper bound on the exponential backoff between those retries. |

The index waiting and the OCC retry are both opt-in. If you copy the
migrations out of this sample without also copying the config, you get
neither. The equivalent environment variables are
`FLYWAY_DSQL_AWAIT_ASYNC_INDEXES`, `FLYWAY_DSQL_OCC_MAX_RETRIES`, and
`FLYWAY_DSQL_OCC_MAX_RETRY_DELAY_SECONDS`.

The module's own documentation lists these and the per-transaction limits:
[flyway-database-dsql](https://github.com/flyway/flyway-community-db-support/tree/main/flyway-database-dsql).

### Two Flyway settings that do not work here

`flyway.createSchemas=true` does not work. Flyway issues the `CREATE SCHEMA`
and the `CREATE TABLE` for the history table in one transaction, Aurora DSQL
rejects two DDL statements in a transaction, nothing commits, and after a few
retries it fails with `SQLSTATE 3F000, schema does not exist`, which points
nowhere near the cause. `make create-schema` creates the schema in its own
statement instead, and `make migrate` depends on it.

**Baselining is unavailable.** `flyway baseline` mixes DDL and DML in one
transaction, so Aurora DSQL rejects it. `flyway.baselineOnMigrate=true` is not
a substitute: on a non-empty schema it logs a successful baseline, writes no
baseline row, and migrates from V1 over your existing tables, leaving the
history claiming a version the schema does not match. See limitation 10 in [`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md) for
the full output.

## Running the test suite

```bash
make test                    # the deterministic suite: test-happy
make test-happy              # end-to-end apply + 25 structural assertions
make test-occ                # concurrent-migrate race; run this one on its own
```

`make test` runs `test-happy` only. It resets the schema, applies all 16
migrations, and asserts 25 post-conditions, including that each
`CREATE INDEX ASYNC` index came out `indisvalid`. That catches a **failed
index build**, which a presence check in `pg_indexes` would not: a failed
build leaves the index listed but invalid.

It does not prove that `awaitAsyncIndexes` did the waiting. V16 sleeps for 60
seconds after the last index migration, so the builds have time to finish
either way. Showing the await itself works means checking the index state
immediately after the migration that creates it.

`test-occ` is deliberately **not** part of `make test`. It starts two
`migrate` runs in parallel and the outcome is not deterministic: sometimes one
run recovers, sometimes both fail and the schema needs repair. It demonstrates
the failure mode rather than asserting a pass, so putting it in the suite
would make the suite flaky for no benefit. Run it when you want to see the
race. See limitation 2 in
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

**`no job_id was found in its result`** after `CREATE INDEX ASYNC IF NOT
EXISTS` on an index that already exists. This is a module bug, and it is why
the index migrations here do not use `IF NOT EXISTS`. See limitation 3 in
[`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md).

**`42P07 relation already exists`** on an index migration. This is what a
re-run of a bare `CREATE INDEX ASYNC` reports when the index survived a
failed migration. Drop the index, then repair and migrate; see limitation 3.

**A failed index migration that `repair` will not fix.** `make repair` plus
`make migrate` loops on the same error, because the module commits the
`CREATE INDEX ASYNC` before it waits, so the index survives the failed
migration. You have to drop the index first, whatever state it is in. The
procedure is in limitation 3 of
[`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md), which is the only place it
is written down.

**`Unable to load credentials` or an SSO error inside Flyway** while the AWS
CLI works on the same machine. Resolving an IAM Identity Center profile
(`sso_session`) or an assume-role profile (`role_arn` with `source_profile`)
needs five jars that have nothing to do with Aurora DSQL: `sso`, `ssooidc`,
`sts`, `aws-query-protocol`, and `commons-logging`. The Dockerfile installs
all five and asserts at build time that they are present. Drop any of them
from a trimmed image and those profile types fail at the moment the credential
chain runs, with a `NoClassDefFoundError` rather than anything that mentions
credentials.

**The Flyway CLI exits 1 with no output at all**, on every command, including
ones that never reach AWS. If you have changed the jars, suspect
`commons-logging`. This image pins 1.2; version 1.3.5 and the `jcl-over-slf4j`
bridge both kill the JVM before Flyway logs a single line, because the base
image already bundles `slf4j-nop`. There is no error message to search for,
which is what makes it worth knowing.

**`SSL SYSCALL error: EOF detected` from psql** is a transient at the
Aurora DSQL frontend. The sample's psql helpers retry. Flyway's own JDBC
path does not see it.

For the full set of constraints this sample ran into, see
[`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md).
