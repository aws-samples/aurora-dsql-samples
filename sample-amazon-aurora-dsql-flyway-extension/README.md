# Flyway + Aurora DSQL POC

A working proof of concept that runs the stock [Flyway](https://flywaydb.org/)
CLI against [Amazon Aurora DSQL](https://aws.amazon.com/rds/aurora/dsql/)
via a small database-type extension JAR. The extension translates the
places vanilla Flyway and Aurora DSQL disagree, so `flyway migrate`
succeeds end-to-end against a real DSQL cluster.

> **Status: sample pattern, not an official AWS product.** This POC
> demonstrates how to extend Flyway for Aurora DSQL. It is not a
> supported Flyway plugin and not covered by AWS Support. See
> [`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md) for the trade-offs
> you must accept before adopting this pattern.

## What this POC proves

- `flyway migrate` applies 16 varied migrations (DDL + DML + async
  indexes + long-running + varied constraint patterns) against a real
  Aurora DSQL cluster.
- The extension handles six behavioral mismatches between the stock
  Flyway PostgreSQL plugin and Aurora DSQL (URL regex, driver class,
  `SET role`, advisory locks, `ALTER TABLE ADD CONSTRAINT`, multi-DDL
  per transaction).
- Concurrent `flyway migrate` races surface both DSQL error codes
  (SQLSTATE 23505 and 40001) and recover cleanly through a bounded
  shell retry loop.
- The whole thing runs inside Docker with a pinned Flyway version so
  the toolchain is reproducible.

## Pinned versions

| Component | Version | Why pinned |
|---|---|---|
| Flyway OSS | **11.20.3** | The extension subclasses `org.flywaydb.database.postgresql.*` which Flyway does not treat as a stable public API. Upgrading Flyway requires re-testing the extension. |
| Aurora DSQL JDBC Connector | 1.0.0 | Matches the `jdbc:aws-dsql:postgresql://` URL prefix handled by the extension. |
| Base Docker image | `flyway/flyway:11-alpine` | Ships Flyway 11.20.3 + bundled PostgreSQL 17 psql + Alpine with glibc-compat not required. |
| Builder image | `gradle:8.10-jdk17` | Multi-arch; builds the extension JAR without a local JDK/Gradle. |

## Prerequisites

- An Aurora DSQL cluster. Any region works, this POC was developed
  against us-east-1.
- AWS credentials with `dsql:DbConnectAdmin` on the cluster. The POC
  reads whichever `~/.aws` profile is active.
- Docker (Desktop, Rancher, Colima, or Podman with a Docker-compatible
  CLI).
- GNU Make (ships with macOS Command Line Tools; `apt install make` on
  Linux).

## Quick start

```bash
cd poc

cp .env.example .env
$EDITOR .env                     # fill in DSQL_ENDPOINT

make build                       # build the Docker image + extension JAR (first time: ~15min)
make info                        # read current migration state from the cluster
make migrate                     # apply pending migrations (V1 through V16)
make verify-schema               # inspect tables, indexes, constraints
```

If the migration fails due to a transient error, use `make repair` to
clear the failed row from `flyway_schema_history`, then retry
`make migrate`.

## All Make targets

```
$ make help
  help               Show this help
  build              Build the flyway-dsql-poc Docker image (compiles the extension too)
  info               Show Flyway migration status against the configured cluster
  migrate            Apply pending migrations through the Flyway + DSQL extension
  repair             Clear failed migrations from flyway_schema_history
  validate           Validate applied migrations against the migration files
  verify-schema      Inspect the cluster: tables, flyway_schema_history, indexes
  reset              Drop every POC-created object (DANGEROUS; dev only)
  reproduce-occ      Run two concurrent migrate to force an OCC conflict
  test               Run every POC test in order (test-happy + test-occ)
  test-happy         End-to-end apply + schema verification
  test-occ           Prove the retry loop recovers from a concurrent migrate race
  clean              Remove local Docker image, network, and tmp files
```

## File layout

```
poc/
├── README.md                   <- this file
├── KNOWN_LIMITATIONS.md        <- trade-offs this pattern makes; read before adopting
├── Dockerfile                  <- multi-stage: builder (Gradle+JDK17) + runtime (Flyway)
├── docker-compose.yml          <- runs the image with env + volume mounts
├── Makefile                    <- make migrate, make test, etc.
├── flyway.conf.example         <- Flyway config template; copied + substituted at run time
├── .env.example                <- environment template (copy to .env)
├── flyway-dsql-ext/            <- the extension JAR source
│   ├── build.gradle.kts        <- Gradle build; produces thin jar + runtime deps/
│   ├── settings.gradle.kts
│   └── src/main/
│       ├── java/com/example/flyway/dsql/
│       │   ├── AuroraDsqlDatabaseType.java   <- URL regex, driver class, createDatabase
│       │   ├── AuroraDsqlDatabase.java       <- supportsDdlTransactions=false, getRawCreateScript
│       │   └── AuroraDsqlConnection.java     <- doRestoreOriginalState no-op, lock no-op
│       └── resources/META-INF/services/
│           └── org.flywaydb.core.extensibility.Plugin   <- Flyway SPI registration
├── migrations/                 <- V*.sql files; mounted into /flyway/migrations
│   ├── V1__init_users.sql
│   ├── V2__add_sessions.sql
│   ├── V3__add_sessions_user_id_index.sql
│   ├── V4__add_user_role_column.sql
│   ├── V5__backfill_user_role.sql
│   ├── V6__set_user_role_default.sql
│   ├── V7__add_sessions_created_at_index.sql
│   ├── V8__add_users_last_login_at.sql
│   ├── V9__backfill_users_last_login_at.sql
│   ├── V10__refresh_users_last_login_at.sql
│   ├── V11__add_audit_log_with_fk.sql
│   ├── V12__add_products_with_check.sql
│   ├── V13__drop_sessions_revoked_at.sql
│   ├── V14__rename_products_name.sql
│   ├── V15__add_sessions_expires_at_index.sql
│   └── V16__long_running_demo.sql
├── scripts/
│   ├── run-flyway.sh             <- Flyway wrapper with retry on OCC / token-expiry
│   ├── mint-token.sh             <- mint a DSQL IAM auth token (via boto3)
│   ├── reset-db.sh               <- DANGEROUS; drops every POC-created table
│   ├── verify-schema.sh          <- inspect tables / history / indexes
│   ├── seed-data.sh              <- 50 users + 200 sessions (for V10 populated-table test)
│   ├── bulk-seed-sessions.sh     <- larger dataset for CREATE INDEX ASYNC testing
│   └── reproduce-occ-conflict.sh <- race two migrates to prove retry recovers
└── tests/
    ├── test-happy-path.sh        <- end-to-end apply + 24 structural assertions
    └── test-occ-handling.sh      <- bounded concurrent-migrate race test
```

## How it works

```
┌──────────────────────────────────────────────────────────────────┐
│  Developer or CI shell                                           │
│    make migrate  ->  docker compose run flyway scripts/run-flyway.sh  │
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  Docker container (flyway-dsql-poc:latest)                       │
│                                                                  │
│  /flyway/drivers/                                                │
│    flyway-dsql-ext-1.0.0.jar     <- our 3-class extension        │
│    aurora-dsql-jdbc-connector-*.jar                              │
│    pgJDBC-*.jar                                                  │
│                                                                  │
│  Flyway CLI starts up, discovers the extension via Plugin SPI,   │
│  recognises jdbc:aws-dsql:postgresql://, uses our Database +     │
│  Connection subclasses, applies migrations.                      │
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼ JDBC + IAM-minted token (DSQL Connector)
┌──────────────────────────────────────────────────────────────────┐
│  Amazon Aurora DSQL cluster                                      │
│                                                                  │
│  flyway_schema_history         <- Flyway's own tracking table    │
│  users | sessions | audit_log | products   <- POC schema         │
└──────────────────────────────────────────────────────────────────┘
```

## Running the test suite

```bash
make test                    # both tests, in order
make test-happy              # end-to-end apply + verify (24 structural assertions)
make test-occ                # bounded concurrent-migrate race
```

The OCC test runs two `make migrate` processes in parallel. Across our
test runs, one of them always wins and the other hits either SQLSTATE
23505 or 40001 and recovers via the shell retry loop.

## Troubleshooting

**"security token ... is expired"** — your AWS credentials expired.
Refresh (e.g. `ada credentials update --account=... --role=Admin
--profile=default --once`) and retry.

**"SSL SYSCALL error: EOF detected" from psql** — a known transient at
the DSQL frontend. The POC scripts retry automatically. Flyway's own
JDBC path doesn't see this.

**"CALL sys.wait_for_job not supported in transaction block"** — call it
alone with autocommit on, not combined with other statements. See V3,
V7, V15 for the pattern, and `KNOWN_LIMITATIONS.md` for the production
alternative (Java-based migration).

**"ERROR: ddl and dml are not supported in the same transaction"** —
you have DDL and DML in the same migration file. Split into separate
files (one logical change per file). See V4/V5/V6 as the canonical
example.

**"ALTER TABLE ADD COLUMN with constraint not supported"** — DSQL
rejects inline constraints on ADD COLUMN. Three-step pattern:
`ADD COLUMN (plain)` → `UPDATE backfill` → `ALTER COLUMN SET DEFAULT`.
See V4/V5/V6.

**"Validate failed: Detected failed migration to version N"** — run
`make repair` to clear the failed row, then `make migrate`.

For a full list of DSQL quirks and the extension's limitations, see
[`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md).
