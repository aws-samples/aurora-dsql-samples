# Known Limitations

Constraints we hit running Flyway against Amazon Aurora DSQL with the
official `org.flywaydb:flyway-database-dsql` module. Read before adopting
this in production.

Everything below is a property of Aurora DSQL or of the module, not of
this sample, and none of it is avoided by writing a database-type
extension of your own. These are the real edges.

## 1. One statement per migration file, unless you opt out of the transaction

Aurora DSQL rejects more than one DDL statement in a transaction, and rejects
DDL and DML in the same transaction:

```
BEGIN; CREATE TABLE a (...); CREATE TABLE b (...); COMMIT;
  -> ERROR: multiple ddl statements not supported in a transaction

BEGIN; CREATE TABLE a (...); INSERT INTO a ...; COMMIT;
  -> ERROR: ddl and dml are not supported in the same transaction
```

Flyway runs each migration **file** in one transaction by default. It does not
autocommit statement by statement, which an earlier version of this document
claimed. Putting two DDL statements in one file therefore fails:

```
Migrating schema "demo" to version "1 - two ddl in one file"
ERROR: Failed to execute script V1__two_ddl_in_one_file.sql
Message    : ERROR: multiple ddl statements not supported in a transaction
```

and neither table is created. That is the rule behind "one logical change per
migration file": it is not a style preference, it is the only thing that fits
in a transaction.

The module does report `supportsDdlTransactions() == false`, which is why
Flyway does not try to roll a failed DDL migration back. That is a separate
point from how the statements are grouped.

To put several statements in one file, opt that file out of the transaction
with a script config file beside it:

```
# V2__seed_users.sql.conf
executeInTransaction=false
```

Flyway then logs `[non-transactional]` and each statement commits on its own,
so both of the files above apply. Two trade-offs come with it:

- **This is where you lose atomicity.** A file that fails on statement 3 of 5
  leaves statements 1 and 2 applied, with no rollback. In the default
  transactional mode that situation cannot arise, because the file would not
  have run at all.
- OCC retry does not apply to a migration running outside a transaction, so
  the file is also opted out of `flyway.dsql.occMaxRetries`.

Mitigation, in order of preference:

- One logical change per file, and let Flyway keep the transaction.
- Make migrations idempotent so a failed run can be re-applied.
  - `CREATE TABLE IF NOT EXISTS`
  - `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
  - `UPDATE ... WHERE ... IS DISTINCT FROM ...` to guard against double-apply
  - See limitation 3 before reaching for `CREATE INDEX ASYNC IF NOT EXISTS`
- Reach for `executeInTransaction=false` only when the statements genuinely
  belong together and you accept partial application.

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

Recovery is **not** just `flyway repair` followed by `flyway migrate`, which
is what this document used to say. That sequence loops on the same failure.

`repair` clears the failed row from `flyway_schema_history`, so `migrate`
retries migration 3. The index that Run B created is still there, so
`CREATE INDEX ASYNC IF NOT EXISTS` skips the build again, returns no `job_id`
again, and `awaitAsyncIndexes` fails the migration again. The module commits
the `CREATE INDEX ASYNC` before it waits, so the index outlives the failed
migration and the retry is stuck.

The index has to go first:

```sql
-- check what state it is in, and whether it is valid
SELECT i.relname, x.indisvalid, x.indisready
  FROM pg_index x
  JOIN pg_class i ON i.oid = x.indexrelid
  JOIN pg_namespace n ON n.oid = i.relnamespace
 WHERE n.nspname = 'flyway_sample';

DROP INDEX idx_sessions_user_id;
```

then `flyway repair` and `flyway migrate`. `make verify-schema` prints
`indisvalid` and `indisready` for every index so you can see which one is the
problem. The underlying `IF NOT EXISTS` interaction is limitation 3.

Mitigation: serialize migration runs outside Flyway. Treat this as
mandatory, not as a hardening step.

- GitHub Actions: `concurrency: { group: deploy-migrations, cancel-in-progress: false }`
- CodeDeploy: a deployment group configured one-at-a-time
- Anything else: a single designated runner per environment

## 3. `CREATE INDEX ASYNC IF NOT EXISTS` and `awaitAsyncIndexes` conflict

`flyway.dsql.awaitAsyncIndexes=true` is the setting you want, and it is not
the default. Upstream it defaults to `false`, on the reasoning that
fire-and-forget is faster for a pure performance index. Aurora DSQL has no
synchronous index creation: `CREATE INDEX ASYNC` returns a `job_id` and
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

A `BaseJavaMigration` gives you full control of both. Two things the obvious
version of this gets wrong: it waits on an index build that has not been
committed yet, and it throws away the result of the wait.

```java
public class V17__add_sessions_last_seen_index extends BaseJavaMigration {

    // Runs outside Flyway's transaction, so the CREATE INDEX ASYNC below is
    // committed before anything waits on it. Without this the wait happens
    // inside the same uncommitted transaction, and sys.wait_for_job is
    // looking for a job the cluster has not been told to start.
    @Override
    public boolean canExecuteInTransaction() {
        return false;
    }

    @Override
    public void migrate(Context ctx) throws Exception {
        String jobId;
        try (Statement stmt = ctx.getConnection().createStatement();
             ResultSet rs = stmt.executeQuery(
                 "CREATE INDEX ASYNC idx_sessions_last_seen "
                 + "ON sessions (last_seen_at)")) {
            if (!rs.next()) {
                // No job_id. Either the index already existed, or the
                // statement did not start a build. Do not report success.
                throw new FlywayException(
                    "CREATE INDEX ASYNC returned no job_id, so there is "
                    + "nothing to wait on");
            }
            jobId = rs.getString("job_id");
        }

        // Fresh connection with autocommit: CALL sys.wait_for_job is rejected
        // inside a transaction block.
        try (Connection c = ctx.getConfiguration().getDataSource().getConnection()) {
            c.setAutoCommit(true);
            // A bind parameter works here. A subquery does not.
            try (PreparedStatement ps =
                     c.prepareStatement("CALL sys.wait_for_job(?)")) {
                ps.setString(1, jobId);
                try (ResultSet rs = ps.executeQuery()) {
                    // The wait returning is not the same as the build
                    // succeeding. sys.wait_for_job reports whether the job
                    // finished successfully, and a unique index over
                    // duplicate values comes back succeeded = false with the
                    // index left indisvalid = false.
                    if (rs.next() && !rs.getBoolean("succeeded")) {
                        throw new FlywayException(
                            "async index build failed for job " + jobId);
                    }
                }
            }
        }
    }
}
```

This sample does not ship a `BaseJavaMigration` example; it would need a
JDK and a build step, which the Docker-only setup here deliberately avoids.

## 4. How long a migration may run: 5 minutes, not 1 hour

Two different limits get confused here, and this document previously quoted
the wrong one as the migration limit.

| Limit | Value | What it applies to |
|---|---|---|
| Transaction duration | 5 minutes | One migration file, since Flyway runs each file in one transaction |
| Connection lifetime | 1 hour | The session, across all the statements on it |

**5 minutes is the one that binds.** A migration file is one transaction
(limitation 1), so a statement that runs past 5 minutes fails there, with the
1-hour connection cap nowhere near. Quoting 1 hour as the ceiling for a
migration is wrong by a factor of twelve.

The 1-hour figure matters only for something holding a single connection open
across many statements, which Flyway does not do within one `migrate`.

Observed: `SELECT pg_sleep(60)` in V16 runs cleanly, well inside the
5-minute cap. We did not test at the boundary.

Mitigation: break genuinely long work into smaller migrations, or move it out
of Flyway into a script that commits in batches and reconnects. A migration
file that cannot finish in 5 minutes does not belong in Flyway on this
database.

## 5. IAM token lifetime: 15 minutes

Aurora DSQL IAM auth tokens live 15 minutes. The Aurora DSQL JDBC
Connector mints a fresh token when a connection is established, and the
token is not re-checked after that.

- Flyway opens one connection per `migrate` invocation.
- A `migrate` that takes longer than 15 minutes in total is not cut off,
  because the token is only checked when the connection is opened.
- Any single migration inside it still has to finish within the 5-minute
  transaction cap (limitation 4). The token lifetime is never the binding
  limit on a migration.
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

Exercised by the migrations in this sample:

- `CREATE TABLE` with inline PRIMARY KEY, FOREIGN KEY, CHECK, UNIQUE
- `ALTER TABLE ADD COLUMN`, plain, with no inline constraint
- `ALTER TABLE ALTER COLUMN SET DEFAULT`
- `ALTER TABLE DROP COLUMN`
- `ALTER TABLE RENAME COLUMN`
- `CREATE INDEX ASYNC`, with `awaitAsyncIndexes` on
- `UPDATE` with correlated subqueries and `IS DISTINCT FROM`
- `SELECT pg_sleep(N)` as a long-running proxy

Checked directly against a `us-east-1` cluster, outside the migrations.
**Rejected**, so there is nothing to work around:

| Statement | Response |
|---|---|
| `CREATE MATERIALIZED VIEW` | `ERROR: unsupported statement: CreateTableAs` |
| `CREATE FUNCTION ... LANGUAGE plpgsql` | `ERROR: CREATE FUNCTION with language plpgsql not supported` |
| `CREATE TRIGGER` | `ERROR: CREATE TRIGGER not supported` |
| `CREATE TABLE ... PARTITION BY RANGE` | `ERROR: PARTITION BY clause not supported for CREATE TABLE` |
| `ALTER TABLE ADD CONSTRAINT`, validating form | `ERROR: unsupported ALTER TABLE ADD CONSTRAINT statement` |
| An inline constraint on `ALTER TABLE ADD COLUMN` | rejected; V4, V5, V6 are the three-step workaround |
| Two DDL statements in one transaction | `ERROR: multiple ddl statements not supported in a transaction` |
| DDL and DML in one transaction | `ERROR: ddl and dml are not supported in the same transaction` |

Triggers are worth calling out: they are unsupported twice over, since
`plpgsql` is unavailable as well as `CREATE TRIGGER` itself. These were
previously listed as "not tested", which understated things. They are not
edges to be careful of, they are unavailable.

**Accepted** in the same checks:

| Statement | Response |
|---|---|
| `CREATE OR REPLACE VIEW` | accepted |
| `CREATE SCHEMA` | accepted |
| `DROP SCHEMA ... CASCADE` | accepted |
| Generated column, `GENERATED ALWAYS AS (...) STORED` | accepted |
| `ALTER TABLE ADD CONSTRAINT ... CHECK (...) NOT VALID` | accepted; existing rows never checked |
| `ALTER TABLE ADD CONSTRAINT ... FOREIGN KEY ... NOT VALID` | accepted; existing rows never checked |

Still not tested:

- JSON and JSONB operations
- Full-text search
- `ALTER TABLE ALTER COLUMN TYPE`

## 8. `make reset` is destructive

`make reset` runs `DROP SCHEMA $DSQL_SCHEMA CASCADE`, which destroys every
table, index and row in the sample's schema, including
`flyway_schema_history`. It requires the `admin` role and prompts for
confirmation; `RESET_DB_ASSUME_YES=true` skips the prompt for CI.

The blast radius is one schema. Objects in other schemas, including `public`,
are untouched, and the script refuses to run against `public` at all.

That was not previously true. Everything used to live in `public` and reset
dropped a hard-coded list of table names, including `users` and `sessions`,
which are also created by the `aurora-dsql-auth-session-mgmt` sample. Running
this sample's reset or tests on a shared cluster destroyed that sample's data.
The list had also drifted out of step with the migrations. Both problems are
why the sample now migrates into `$DSQL_SCHEMA`, default `flyway_sample`.

If you run it by accident, `make migrate` recreates the schema and rebuilds
everything from V1.

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

## 10. Baselining an existing schema does not work

Neither mechanism Flyway offers for adopting a schema that already has objects
in it works on Aurora DSQL.

**`flyway baseline`**, the standalone command, creates the history table and
inserts the marker row in one transaction. That mixes DDL and DML, which
Aurora DSQL rejects (limitation 1).

**`flyway.baselineOnMigrate=true`** looks like the workaround, and this sample
used to set it. It is worse than not working, because it fails silently. Run
against a schema that already contains a `users` table:

```
Schema history table "demo"."flyway_schema_history" does not exist yet
Creating Schema History table "demo"."flyway_schema_history" with baseline ...
Successfully baselined schema with version: 1
Migrating schema "demo" to version "1 - init users"
WARNING: DB: relation "users" already exists, skipping (SQL State: 42P07)
Migrating schema "demo" to version "2 - add marker"
Successfully applied 2 migrations to schema "demo", now at version v2
```

It reports a successful baseline, then migrates from V1 anyway. The history
table afterwards:

```
installed_rank | version | description | type | success
             1 | 1       | init users  | SQL  | t
             2 | 2       | add marker  | SQL  | t
```

There is no `BASELINE` row. The baseline was logged and not written, so
nothing told Flyway to skip V1.

The damaging part is what that leaves behind. V1 ran against the existing
table and was skipped statement by statement by its own `IF NOT EXISTS`, so
the pre-existing table was left exactly as it was, missing the columns V1
declares. The history now records v1 as applied successfully. `flyway
validate` passes. The schema does not match the migration that supposedly
built it, and nothing in Flyway will tell you.

Without `IF NOT EXISTS` you would at least get a loud `42P07 relation already
exists` failure, which is the better outcome.

So: do not use `baselineOnMigrate` on Aurora DSQL to adopt an existing schema.
Either migrate into a fresh schema from V1, or reconcile the history table by
hand and verify the result against the migrations.

## 11. Reporting problems

The module source lives in the Flyway community database support project,
and AWS republishes it as
[`software.amazon.dsql:aurora-dsql-flyway-support`](https://github.com/awslabs/aurora-dsql-tools/tree/main/flyway).
Bugs in the module itself, including limitations 2 and 3 above, belong
upstream rather than in this sample's issue tracker.

Load one artifact, not both. The two carry the same `DatabaseType`, and the
AWS README warns against putting both on the classpath.
