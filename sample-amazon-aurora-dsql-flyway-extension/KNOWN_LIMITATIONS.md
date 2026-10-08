# Known Limitations

Trade-offs this POC makes. Read before adopting the pattern in a
production setting.

## This is a sample pattern, not a supported product

- The extension JAR is not an official Flyway plugin.
- It is not covered by AWS Support.
- It subclasses Flyway internal classes (`org.flywaydb.database.postgresql.*`)
  which the Flyway project does not treat as a stable public API.
- Pin to Flyway **11.20.3** (the version this POC was tested against) and
  test the extension yourself before promoting any Flyway upgrade.

## 1. No DDL atomicity

The extension overrides `supportsDdlTransactions()` to return `false`
because Aurora DSQL rejects multi-DDL per transaction. This means Flyway
runs each statement with autocommit on.

Consequence: a migration that fails on statement 3 of 5 leaves
statements 1 and 2 applied. There is no automatic rollback.

Mitigation:
- Design migrations to be idempotent.
  - `CREATE TABLE IF NOT EXISTS`
  - `ADD COLUMN IF NOT EXISTS`
  - `CREATE INDEX ASYNC IF NOT EXISTS`
  - `UPDATE ... WHERE ... IS DISTINCT FROM ...` (guards against double-apply)
- Prefer one logical change per migration file. Smaller blast radius if a
  migration half-applies.

## 2. No cross-process coordination between concurrent `flyway migrate` runs

Aurora DSQL does not support PostgreSQL advisory locks (`pg_try_advisory_xact_lock`),
so the extension no-ops Flyway's `lock(Table, Callable)`. Nothing
prevents two developers (or two CI jobs) from running `flyway migrate`
against the same cluster at the same time.

Observed behavior in the race (across 4 reproduce-occ rounds):

- **3 of 4 rounds**: the losing run gets SQLSTATE 23505 (duplicate PK on
  `flyway_schema_history`). The shell retry wrapper catches it; on retry
  the losing Flyway sees the schema already migrated and exits cleanly.
- **1 of 4 rounds**: the losing run gets SQLSTATE 40001 (DSQL serialization
  conflict, internal code OC000). Same recovery path.

**Caveat**: in the 40001 case, both runs can make partial progress before
one is rejected. The result is **duplicate rows for the same version** in
`flyway_schema_history`, flagged as "Out of Order" by `flyway info`. The
schema itself is correct; the history table is cosmetically noisy.

Vanilla Flyway prevents this via the advisory lock we had to disable.
There is no clean extension-level fix because Flyway intentionally
allows multiple rows per version (for the retry-after-failure pattern).

Mitigation: use external coordination to prevent concurrent runs.
Options:
- GitHub Actions `concurrency: group: deploy-migrations` + `cancel-in-progress: false`
- CodeDeploy single-at-a-time deployment groups
- EventBridge scheduled task with a lock-table-based distributed lock
- Any pipeline tool that serializes deploys per environment

## 3. `CREATE INDEX ASYNC` in SQL migrations does not wait for the index to be VALID

SQL migrations cannot capture the `job_id` returned by `CREATE INDEX
ASYNC` and feed it to `CALL sys.wait_for_job(...)` in the same file
because:

- `CALL sys.wait_for_job(<subquery>)` is rejected ("cannot use subquery
  in CALL argument").
- `CALL sys.wait_for_job(...)` cannot run inside a transaction block,
  which rules out combining it with other statements in one script.

The migrations in this POC (V3, V7, V15) accept this: on an empty or
small table, the index build completes in milliseconds. The migration
returns, the next migration runs, and nothing notices.

**On a large populated table this is a correctness hazard.** The next
migration (or application query) could run before the index is in VALID
state and silently use a sequential scan.

Mitigation: use a Java-based Flyway migration (`BaseJavaMigration`) for
production index builds on populated tables. Pattern:

```java
public class V17__add_sessions_last_seen_index extends BaseJavaMigration {
    @Override
    public void migrate(Context ctx) throws Exception {
        try (Statement stmt = ctx.getConnection().createStatement();
             ResultSet rs = stmt.executeQuery(
                 "CREATE INDEX ASYNC IF NOT EXISTS idx_sessions_last_seen " +
                 "ON sessions (last_seen_at)")) {
            if (rs.next()) {
                String jobId = rs.getString("job_id");
                // Fresh connection -- CALL sys.wait_for_job cannot run in a transaction block.
                try (Connection c = ctx.getConfiguration().getDataSource().getConnection()) {
                    c.setAutoCommit(true);
                    try (Statement s = c.createStatement()) {
                        s.execute("CALL sys.wait_for_job('" + jobId + "')");
                    }
                }
            }
        }
    }
}
```

This POC does not ship a BaseJavaMigration example; add one in your own
project when you need production-grade async index builds.

## 4. Connection cap: 1 hour maximum

Aurora DSQL caps individual connections at 1 hour. A migration whose
`SELECT` or long-running statement exceeds that will fail.

Observed: `SELECT pg_sleep(60)` migration ran cleanly (V16). We did not
test near the 1-hour boundary; it's assumed to behave as DSQL documents.

Mitigation: break genuinely long work into smaller migrations, or run
outside Flyway (standalone script that reconnects periodically).

## 5. IAM token lifetime: 15 minutes

Aurora DSQL IAM tokens live 15 minutes. The DSQL JDBC Connector mints a
fresh token at **connection establishment** only; once the connection
is open, the token is not re-validated.

- Flyway opens one connection per `migrate` invocation.
- A single migration safely spans the 15-minute mark as long as the
  connection remains open (up to the 1-hour cap in Limitation 4).
- A new `migrate` invocation gets a fresh token.

No action needed; the connector handles it. Documented here for the
reader who wonders.

## 6. DSQL per-transaction mutation cap

Aurora DSQL caps per-transaction mutations at roughly 10,000 rows. A
single `INSERT ... SELECT generate_series(1, 20000)` fails.

Our bulk-seed script (`scripts/bulk-seed-sessions.sh`) uses 2,000 rows
per transaction to stay well under the cap. If you have a backfill
migration that would touch >5,000 rows, batch it in your own code, or
move the backfill outside Flyway.

## 7. DSQL feature coverage this POC exercises

This POC has only touched a subset of DSQL's capability. These features
were tested and work via the extension:

- `CREATE TABLE` with inline PRIMARY KEY, FOREIGN KEY, CHECK, UNIQUE
- `ALTER TABLE ADD COLUMN` (plain, no inline constraints)
- `ALTER TABLE ALTER COLUMN SET DEFAULT`
- `ALTER TABLE DROP COLUMN`
- `ALTER TABLE RENAME COLUMN`
- `CREATE INDEX ASYNC` (on both empty and populated tables)
- `UPDATE` with correlated subqueries, `IS DISTINCT FROM`
- `SELECT pg_sleep(N)` (as a long-running proxy)

These features were **not** tested and may surface additional edge cases:

- `CREATE OR REPLACE VIEW`
- `CREATE MATERIALIZED VIEW`
- Trigger-based migrations
- JSON/JSONB-specific operations
- Generated columns
- Partitioning
- Full-text search features

If you adopt the extension and hit a new behavior, open an issue (or
contribute back) with the SQLSTATE and the exact statement.

## 8. Reset is destructive

`make reset` drops every POC-created table (`audit_log`, `products`,
`sessions`, `users`, `flyway_schema_history`, legacy `demo_*` tables).
Only run against a dedicated development cluster. The script requires
the `admin` role.

If you run `reset` by accident, the migrations are safe to re-apply:
`make migrate` will rebuild everything from V1.

## 9. Flyway version dependency

The extension subclasses:
- `org.flywaydb.database.postgresql.PostgreSQLDatabaseType`
- `org.flywaydb.database.postgresql.PostgreSQLDatabase`
- `org.flywaydb.database.postgresql.PostgreSQLConnection`

These are internal classes. Flyway maintainers can change them in minor
releases. If you upgrade Flyway, you must:

1. Rebuild the extension against the new Flyway version.
2. Re-run the full test suite (`make build && make test`).
3. Verify behaviors specific to the extension still work:
   - URL parsing picks up `jdbc:aws-dsql:postgresql://`
   - `SET role` is still no-op'd on close
   - `lock()` is still bypassed
   - `getRawCreateScript` still emits an inline-PK schema history table
   - `supportsDdlTransactions=false` still has the expected effect

4. Only after that, update the pinned version in this POC.

## 10. Not an official contribution path

AWS and Flyway/Red Gate have not announced an official DSQL plugin as
of October 2026. This POC is a sample for teams who want to adopt
Flyway on DSQL today. Watch Flyway release notes for a future native
plugin; migrate off this extension when one lands.

If you'd like to contribute improvements, open a GitHub issue on the
hosting repo (or discuss with the Aurora DSQL team).
