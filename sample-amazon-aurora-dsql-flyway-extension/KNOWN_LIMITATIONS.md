# Known Limitations

Constraints we hit running Flyway against Amazon Aurora DSQL with the
official `org.flywaydb:flyway-database-dsql` module. Read before adopting
this in production.

Everything below is a property of Aurora DSQL or of the module, not of
this sample. None of it is worked around by writing your own Flyway
extension; these are the real edges.

## 1. No DDL atomicity

Aurora DSQL rejects more than one DDL statement per transaction, so the
module reports `supportsDdlTransactions() == false`. Flyway therefore runs
each statement with autocommit on.

Consequence: a migration that fails on statement 3 of 5 leaves statements
1 and 2 applied. There is no automatic rollback.

Mitigation:

- Make migrations idempotent.
  - `CREATE TABLE IF NOT EXISTS`
  - `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
  - `UPDATE ... WHERE ... IS DISTINCT FROM ...` to guard against double-apply
  - See limitation 3 before reaching for `CREATE INDEX ASYNC IF NOT EXISTS`
- Keep one logical change per migration file. Smaller blast radius when a
  migration half-applies.

## 2. Concurrent `flyway migrate` runs are not safe, and the retry does not make them safe

Aurora DSQL has no PostgreSQL advisory locks (`pg_try_advisory_xact_lock`),
which is the mechanism vanilla Flyway uses to serialize concurrent runs.
The module cannot provide an equivalent, so nothing stops two developers
or two CI jobs from running `flyway migrate` against one cluster at the
same time.

`flyway.dsql.occMaxRetries` retries a transaction that loses an optimistic
concurrency check. That is a transaction-level safety net. It is not a
substitute for the lock, and we were able to drive two parallel runs into
a state where **both runs fail and the schema needs manual repair.**

Reproduction: Flyway 11.20.3, module 10.26.0, connector 1.5.0, two
containers started in parallel against one `us-east-1` cluster, 16
migrations from an empty schema, `occMaxRetries=3`,
`awaitAsyncIndexes=true`.

Run A fails on the index migration and leaves a failed row behind:

```
| job_id 7iojselbl5evxhbj2rtbktir3i |
ERROR: Schema "public" contains a failed migration to version 3 !
```

Run B hits the OCC retry, then fails differently:

```
Retrying migration transaction after Aurora DSQL OCC conflict (attempt 1 of 3)
WARNING: DB: relation "idx_sessions_user_id" already exists, skipping (SQL State: 42P07)
| No row |
ERROR: Aurora DSQL async index build could not be awaited: awaitAsyncIndexes is
       enabled and this statement matched CREATE INDEX ASYNC, but no job_id was
       found in its result: CREATE INDEX ASYNC IF NOT EXISTS idx_sessions_user_id
```

Recovery is `flyway repair` followed by `flyway migrate`. The underlying
`IF NOT EXISTS` interaction is limitation 3.

Mitigation: serialize migration runs outside Flyway. Treat this as
mandatory, not as a hardening step.

- GitHub Actions: `concurrency: { group: deploy-migrations, cancel-in-progress: false }`
- CodeDeploy: a deployment group configured one-at-a-time
- Anything else: a single designated runner per environment

## 3. `CREATE INDEX ASYNC IF NOT EXISTS` and `awaitAsyncIndexes` conflict

`flyway.dsql.awaitAsyncIndexes=true` is the right default. Aurora DSQL has
no synchronous index creation: `CREATE INDEX ASYNC` returns a `job_id` and
builds in the background. With the setting on, the module reads that
`job_id` and blocks on `sys.wait_for_job` until the index is `VALID`, so a
later migration cannot run against an index that is not ready yet.

The problem is the combination with `IF NOT EXISTS`. When the index
already exists, Aurora DSQL skips the build and returns no `job_id`, but
the statement still matches the module's `CREATE INDEX ASYNC` pattern. The
module then fails the migration because it has nothing to wait on:

```
ERROR: Aurora DSQL async index build could not be awaited: awaitAsyncIndexes is
       enabled and this statement matched CREATE INDEX ASYNC, but no job_id was
       found in its result
```

So the two idempotency tools pull against each other. `IF NOT EXISTS` is
what makes a migration safe to re-run after a partial failure
(limitation 1), and it is exactly what breaks the await.

There is a second edge in the same area: a failed async build leaves an
`INVALID` index behind, and `IF NOT EXISTS` will accept that invalid index
on a re-run rather than rebuilding it. Check `pg_index.indisvalid` and drop
explicitly before retrying.

This sample keeps `IF NOT EXISTS` on its index migrations (V3, V7, V15)
because re-runnability matters more here, and documents the failure rather
than hiding it. In your own project, pick one:

- Drop `IF NOT EXISTS` on index migrations and rely on `flyway repair` plus
  a manual index drop when a run fails partway.
- Keep `IF NOT EXISTS` and set `awaitAsyncIndexes=false`, then wait for the
  index yourself in a Java migration where you control the `job_id`.

A `BaseJavaMigration` gives you full control of both:

```java
public class V17__add_sessions_last_seen_index extends BaseJavaMigration {
    @Override
    public void migrate(Context ctx) throws Exception {
        try (Statement stmt = ctx.getConnection().createStatement();
             ResultSet rs = stmt.executeQuery(
                 "CREATE INDEX ASYNC idx_sessions_last_seen ON sessions (last_seen_at)")) {
            if (rs.next()) {
                String jobId = rs.getString("job_id");
                // Fresh connection: CALL sys.wait_for_job cannot run in a transaction block.
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

This sample does not ship a `BaseJavaMigration` example; it would need a
JDK and a build step, which the Docker-only setup here deliberately avoids.

## 4. Connection lifetime: 1 hour

Aurora DSQL closes a connection after 1 hour. A migration whose statement
runs past that will fail.

Observed: `SELECT pg_sleep(60)` in V16 ran cleanly. We did not test near
the 1-hour boundary.

Mitigation: break genuinely long work into smaller migrations, or move it
out of Flyway into a script that reconnects.

## 5. IAM token lifetime: 15 minutes

Aurora DSQL IAM auth tokens live 15 minutes. The Aurora DSQL JDBC
Connector mints a fresh token when a connection is established, and the
token is not re-checked after that.

- Flyway opens one connection per `migrate` invocation.
- A single `migrate` safely spans the 15-minute mark as long as the
  connection stays open, up to the 1-hour cap in limitation 4.
- The next `migrate` gets a fresh token.

No action needed. Recorded here for the reader who wonders whether a long
migration will be cut off mid-run.

## 6. Per-transaction caps: 3,000 rows, 10 MiB, 5 minutes

Aurora DSQL caps a single transaction at 3,000 modified rows, 10 MiB of
modified data, and 5 minutes of wall clock. A backfill written as one
`UPDATE` over a large table will hit one of these.

`scripts/bulk-seed-sessions.sh` inserts 1,000 rows per transaction for this
reason, and refuses a `BATCH_SIZE` at or above 3,000.

Mitigation: batch backfills in your own code, or move them out of Flyway.
A backfill migration is DML, so it is already in its own file
(limitation 1); make it loop.

## 7. What this sample exercised, and what it did not

Tested and working:

- `CREATE TABLE` with inline PRIMARY KEY, FOREIGN KEY, CHECK, UNIQUE
- `ALTER TABLE ADD COLUMN`, plain, with no inline constraint
- `ALTER TABLE ALTER COLUMN SET DEFAULT`
- `ALTER TABLE DROP COLUMN`
- `ALTER TABLE RENAME COLUMN`
- `CREATE INDEX ASYNC` on empty and on populated tables
- `UPDATE` with correlated subqueries and `IS DISTINCT FROM`
- `SELECT pg_sleep(N)` as a long-running proxy

Not tested, may hold more edges:

- `CREATE OR REPLACE VIEW`
- Materialized views
- Triggers
- JSON and JSONB operations
- Generated columns
- Partitioning
- Full-text search

Two patterns Aurora DSQL rejects outright, so there is nothing to test:

- An inline constraint on `ALTER TABLE ADD COLUMN`. Add the column, backfill
  it, then set the default or add the constraint separately. V4, V5, and V6
  are the worked example.
- DDL and DML in one transaction, which means in one migration file.

## 8. `make reset` is destructive

`make reset` drops every table the migrations create (`audit_log`,
`products`, `sessions`, `users`) plus `flyway_schema_history`. Run it only
against a cluster you are willing to lose. It requires the `admin` role and
prompts for confirmation; `RESET_DB_ASSUME_YES=true` skips the prompt for
CI.

If you run it by accident, `make migrate` rebuilds everything from V1.

## 9. Flyway version compatibility

The module is versioned `10.26.0`, which is the project version of
`flyway-community-db-support` rather than a Flyway version. That release
targets Flyway 11.9.0, declared as `version.flyway` in the project's parent
pom.

This sample runs it on the Flyway 11.20.3 CLI, where it loads and behaves
correctly. That is a tested combination, not a supported matrix. Before you
bump either side:

1. Confirm the module release you are moving to still resolves against your
   Flyway version.
2. Re-run `make build && make test`.
3. Check that the module still registers. A silent fallback to the stock
   PostgreSQL plugin is the failure mode to watch for, because migrations
   then fail in confusing ways rather than cleanly. `flyway info` prints
   this line when the module is active:

   ```
   Aurora DSQL is a community contributed database, see https://rd.gt/3SXtLDt for more details
   ```

   Note that the `Database:` line above it still reports
   `jdbc:postgresql://... (PostgreSQL 16.15)`, because Aurora DSQL presents
   a PostgreSQL version string over the wire. That line is not a reliable
   signal either way; the community-database banner is.

## 10. Reporting problems

The module source lives in the Flyway community database support project,
and AWS republishes it as
[`software.amazon.dsql:aurora-dsql-flyway-support`](https://github.com/awslabs/aurora-dsql-tools/tree/main/flyway).
Bugs in the module itself, including limitations 2 and 3 above, belong
upstream rather than in this sample's issue tracker.

Load one artifact, not both. The two carry the same `DatabaseType`, and the
AWS README warns against putting both on the classpath.
