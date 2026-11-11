# Known Limitations

Constraints we hit running Flyway against Amazon Aurora DSQL with the
official `org.flywaydb:flyway-database-dsql` module. Read before adopting
this in production.

Everything below is a property of Aurora DSQL or of the module rather than of
this sample.

## 1. One statement per migration file, unless you opt out of the transaction

Aurora DSQL rejects more than one DDL statement in a transaction, and rejects
DDL and DML in the same transaction:

```
BEGIN; CREATE TABLE a (...); CREATE TABLE b (...); COMMIT;
  -> ERROR: multiple ddl statements not supported in a transaction

BEGIN; CREATE TABLE a (...); INSERT INTO a ...; COMMIT;
  -> ERROR: ddl and dml are not supported in the same transaction
```

Flyway runs each migration **file** in one transaction by default, rather than
autocommitting statement by statement. Putting two DDL statements in one file
therefore fails:

```
Migrating schema "demo" to version "1 - two ddl in one file"
ERROR: Failed to execute script V1__two_ddl_in_one_file.sql
Message    : ERROR: multiple ddl statements not supported in a transaction
```

and neither table is created. That is the rule behind "one logical change per
migration file": it is not a style preference, it is the only thing that fits
in a transaction.

Flyway does roll a failed migration back. The module reports
`supportsDdlTransactions() == false`, which affects what Flyway tells you
afterwards, not whether the transaction is rolled back. Measured on a cluster
with a transactional file whose second `INSERT` violated a primary key: the
first `INSERT` did not survive, so the rollback happened.

What the flag does change is the cleanup you owe afterwards. Flyway records a
`success=false` row in `flyway_schema_history` either way, and that row blocks
the next `migrate`, so **run `flyway repair` before re-migrating** regardless
of whether anything was left behind in the schema.

To put several statements in one file, opt that file out of the transaction
with a script config file beside it:

```
# V2__seed_users.sql.conf
executeInTransaction=false
```

Flyway then logs `[non-transactional]` and each statement commits on its own,
so both of the files above apply. Two trade-offs come with it:

- **This is where you lose the rollback.** A file that fails on statement 3 of
  5 leaves statements 1 and 2 committed, because each one committed as it ran.
  In the default transactional mode the transaction is rolled back instead.
  Either way you still need `flyway repair`, because the `success=false` row
  is written in both modes.
- OCC retry does not apply to a migration running outside a transaction, so
  the file is also opted out of `flyway.dsql.occMaxRetries`.

Mitigation, in order of preference:

- One logical change per file, and let Flyway keep the transaction.
- Make migrations idempotent so a failed run can be re-applied.
  - `CREATE TABLE IF NOT EXISTS`
  - `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
  - `UPDATE ... WHERE ... IS DISTINCT FROM ...` to guard against double-apply
  - `CREATE INDEX ASYNC IF NOT EXISTS`. An index left `INVALID` by a failed
    build still has to be dropped; see limitation 3.
- Reach for `executeInTransaction=false` only when the statements genuinely
  belong together and you accept partial application.

## 2. Concurrent `flyway migrate` runs are not safe, and the retry does not make them safe

Aurora DSQL has no PostgreSQL advisory locks (`pg_try_advisory_xact_lock`),
which is the mechanism vanilla Flyway uses to serialize concurrent runs.
The module cannot provide an equivalent, so nothing stops two developers
or two CI jobs from running `flyway migrate` against one cluster at the
same time.

`flyway.dsql.occMaxRetries` retries a transaction that loses an optimistic
concurrency check. That is a transaction-level safety net, not a substitute
for the lock. Two parallel runs both execute the same migrations, and only
the schema history tells them apart.

Reproduction: Flyway 11.20.3, module 10.26.2, connector 1.5.0, two
containers started in parallel against one `us-east-1` cluster, 16
migrations from an empty schema, `occMaxRetries=3`,
`awaitAsyncIndexes=true`, five races with `make reproduce-occ`.

In every race both runs executed some of the same migrations. The second run
to finish one fails to insert its history row with `23505`, because the other
run already wrote a row with that `installed_rank`:

```
Migrating schema "flyway_sample" to version "3 - add sessions user id index"
WARNING: DB: relation "idx_sessions_user_id" already exists, skipping (SQL State: 42P07)
SEVERE: Unable to insert row for version '3' in Schema History table "flyway_sample"."flyway_schema_history"
SQL State  : 23505
  Detail: Key (installed_rank)=(3) already exists.
```

`scripts/run-flyway.sh` retries Flyway on that `23505`. In four races both
runs then exited 0 with all 16 migrations applied. In the fifth, one run lost
the history insert on all three attempts and exited 1 with
`Flyway failed after 3 attempts`, although the other run had applied
everything.

Every race ended consistent only because every migration here is
idempotent. A migration that is not, such as an `UPDATE` without a guard,
would have been applied twice.

Mitigation: serialize migration runs outside Flyway. Treat this as
mandatory, not as a hardening step.

- GitHub Actions: `concurrency: { group: deploy-migrations, cancel-in-progress: false }`
- CodeDeploy: run migrations from one deployment group, which CodeDeploy
  limits to one deployment at a time. If migrate runs in an instance
  lifecycle hook, also use `CodeDeployDefault.OneAtATime`.
- Anything else: a single designated runner per environment

If a run fails with `Unable to commit transaction` and SQL state `40001`,
check that the migration's changes are actually there before trusting
`flyway_schema_history`. The module records the migration before it commits,
so the history can show a migration that was rolled back. Observed on a live
cluster: a losing migration left its version in the history with
`success = t` while none of its writes had been applied. This is why
`scripts/run-flyway.sh` does not retry a `40001`.

## 3. A failed index migration leaves its index behind

`flyway.dsql.awaitAsyncIndexes=true` is the setting you want, and it is not
the default. Upstream it defaults to `false`, on the reasoning that
fire-and-forget is faster for a pure performance index. Aurora DSQL has no
synchronous index creation: `CREATE INDEX ASYNC` returns a `job_id` and
builds in the background. With the setting on, the module reads that
`job_id` and blocks on `sys.wait_for_job` until the index is `VALID`, so a
later migration cannot run against an index that is not ready yet.

The module commits the `CREATE INDEX ASYNC` before it waits, so the index
stays even when the migration fails, for example when the build fails. The
index migrations here use `IF NOT EXISTS`, so a re-run checks that index:

| Leftover index | Re-run |
|---|---|
| `VALID` | Passes. |
| Still building | Waits for the build, then passes or fails on its result. |
| `INVALID` | Fails. Drop the index first, as below. |

### Recovering a failed index migration

This is the only copy of this procedure; everywhere else links here.

1. `make repair` to clear the `success=false` row, then `make migrate`. If
   the leftover index is `VALID` or still building, that is all you need.

2. If the re-run fails with `async index build did not succeed` or
   `is INVALID from an earlier failed build`, the index is `INVALID`. Fix what
   made the build fail, such as duplicate values for a unique index, then drop
   the index the migration creates:

   ```sql
   DROP INDEX flyway_sample.idx_sessions_user_id;
   ```

3. `make repair` and `make migrate` again.

Re-running alone never fixes an `INVALID` index: `IF NOT EXISTS` finds it, and
the module will not accept it.

A `BaseJavaMigration` gives you full control of the build and the wait. Two
things the obvious version of this gets wrong: it waits on an index build that
has not been committed yet, and it throws away the result of the wait.

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
                    // No row is a failure too, not a pass.
                    if (!rs.next() || !rs.getBoolean("succeeded")) {
                        throw new FlywayException(
                            "async index build failed or reported nothing "
                            + "for job " + jobId);
                    }
                }
            }
        }
    }
}
```

This sample does not ship a `BaseJavaMigration` example; it would need a
JDK and a build step, which the Docker-only setup here deliberately avoids.

## 4. Two time limits, and both of them bind

| Limit | Value | What it applies to |
|---|---|---|
| Transaction duration | 5 minutes | One migration file, since Flyway runs each file in one transaction |
| Connection lifetime | 1 hour | The whole `migrate` run, because Flyway holds its connections open from start to finish |

So there are two deadlines to design against:

- **Each migration file must finish within 5 minutes.** A file is one
  transaction (limitation 1), so a single long statement fails here first.
- **The whole `migrate` must finish within 1 hour.** Flyway does not open and
  close a connection per migration; it holds on for the duration of the run,
  so a long enough sequence of individually legal migrations can still run the
  connection out.

Observed: `SELECT pg_sleep(60)` in V16 runs cleanly, well inside the
5-minute cap. We did not test at either boundary.

Mitigation: break genuinely long work into smaller migrations, and if the full
suite is long enough to approach an hour, split it across more than one
`migrate` invocation. Work that cannot fit either deadline belongs in a script
that commits in batches and reconnects, not in Flyway.

## 5. IAM token lifetime: 15 minutes

Aurora DSQL IAM auth tokens live 15 minutes. The Aurora DSQL JDBC
Connector mints a fresh token when a connection is established, and the
token is not re-checked after that.

- Tokens are minted when a connection is opened, and Flyway holds its
  connections for the whole `migrate` run.
- A `migrate` that takes longer than 15 minutes is therefore not cut off, as
  the token is not re-checked on an open connection.
- The next `migrate` gets a fresh token.
- The token lifetime is never the limit that bites. The 5-minute transaction
  cap and the 1-hour connection lifetime are the ones to design against; see
  limitation 4.

No action needed. Recorded here for the reader who wonders whether a long
migration will be cut off mid-run.

## 6. Per-transaction caps: 3,000 rows, 10 MiB, 5 minutes

Aurora DSQL caps a single transaction at 3,000 modified rows, 10 MiB of
modified data, and 5 minutes of wall clock. A backfill written as one
`UPDATE` over a large table will hit one of these.

`scripts/bulk-seed-sessions.sh` inserts 1,000 rows per transaction for this
reason, and refuses a `BATCH_SIZE` at or above 3,000.

Mitigation: batch backfills in your own code, or move them out of Flyway.
A SQL migration cannot loop, because Aurora DSQL rejects PL/pgSQL (`DO with
language plpgsql not supported`), and the row cap is per transaction rather
than per statement. Use a Java migration whose `canExecuteInTransaction()`
returns false and commits each batch, or a script outside Flyway.

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
| `ALTER TABLE ... VALIDATE CONSTRAINT`, without `ASYNC` | `ERROR: unsupported ALTER TABLE VALIDATE CONSTRAINT statement` |
| `ALTER TABLE ALTER COLUMN ... TYPE` | `ERROR: unsupported ALTER TABLE ALTER COLUMN ... SET DATA TYPE statement` |
| An inline constraint on `ALTER TABLE ADD COLUMN` | rejected; V4, V5, V6 are the three-step workaround |
| Two DDL statements in one transaction | `ERROR: multiple ddl statements not supported in a transaction` |
| DDL and DML in one transaction | `ERROR: ddl and dml are not supported in the same transaction` |

Triggers are worth calling out: they are unsupported twice over, since
`plpgsql` is unavailable as well as `CREATE TRIGGER` itself. They are not
edges to be careful of, they are unavailable.

**Accepted** in the same checks:

| Statement | Response |
|---|---|
| `CREATE OR REPLACE VIEW` | accepted |
| `CREATE SCHEMA` | accepted |
| `DROP SCHEMA ... CASCADE` | accepted |
| Generated column, `GENERATED ALWAYS AS (...) STORED` | accepted |
| `ALTER TABLE ADD CONSTRAINT ... CHECK (...) NOT VALID` | accepted |
| `ALTER TABLE ADD CONSTRAINT ... FOREIGN KEY ... NOT VALID` | accepted |
| `ALTER TABLE ASYNC ... VALIDATE CONSTRAINT` | accepted, returns a `job_id`; `convalidated` becomes true once the job succeeds |
| `CREATE UNIQUE INDEX ASYNC` then `ADD CONSTRAINT ... UNIQUE USING INDEX` | accepted once the index is `VALID`, and the constraint enforces |

So a constraint **can** be added to a populated table and then validated
against the rows already in it. It takes two statements, and the second is an
async job. `awaitAsyncIndexes` does not wait on it, because the module only
waits on `CREATE [UNIQUE] INDEX ASYNC`, so follow the job in `sys.jobs`
outside the SQL migration.

Still not tested:

- JSON and JSONB operations
- Full-text search

## 8. `make reset` is destructive

`make reset` runs `DROP SCHEMA $DSQL_SCHEMA CASCADE`, which destroys every
table, index and row in the sample's schema, including
`flyway_schema_history`. It requires the `admin` role and prompts for
confirmation; `RESET_DB_ASSUME_YES=true` skips the prompt for CI.

The blast radius is one schema. Objects in other schemas, including `public`,
are untouched, and the script refuses to run against `public` at all.

That matters on a shared cluster, because `users` and `sessions` are also
created by the `aurora-dsql-auth-session-mgmt` sample. Dropping one schema
cannot reach them, and it cannot drift out of step with the migrations the way
a hard-coded table list would.

If you run it by accident, `make migrate` recreates the schema and rebuilds
everything from V1.

## 9. Flyway version compatibility

The module is versioned `10.26.2`, which is the project version of
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

## 10. Flyway's baseline commands do not work on Aurora DSQL

Neither mechanism Flyway offers for adopting a schema that already has objects
in it works on Aurora DSQL. The module's README recommends
`baselineOnMigrate=true` instead of `flyway baseline`; it fails the same way.
Two workarounds that do work are at the end of this section.

**`flyway baseline`**, the standalone command, does not fail. It logs
`Successfully baselined schema with version: 1` and writes no `BASELINE` row,
because the module's history-table create script drops the marker. The next
`migrate` then runs from V1.

```
Creating Schema History table "demo"."flyway_schema_history" with baseline ...
Successfully baselined schema with version: 1
```

The command exits 0, the history table exists, and it is empty. `flyway info`
afterwards reports `Schema version: << Empty Schema >>` with every migration
still `Pending`.

**`flyway.baselineOnMigrate=true`** looks like the workaround and fails the
same silent way. Run against a schema that already contains a `users` table:

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

So do not use `baselineOnMigrate` on Aurora DSQL to adopt an existing schema.

### Workarounds

Start with no `flyway_schema_history` table in the schema. Both assume the
schema matches the migrations up to the version you give, so check that
first.

**Record the existing migrations without running them.** Flyway's
`skipExecutingMigrations` option writes a success row for each migration up
to the target and executes none of them. Then migrate as usual:

```bash
docker compose run --rm flyway bash scripts/run-flyway.sh migrate \
  -skipExecutingMigrations=true -target=5
make migrate
```

**Or run `flyway baseline`, then write the row it skipped.** This gives you a
real `BASELINE` row. `flyway baseline` still creates the history table, empty:

```bash
docker compose run --rm flyway bash scripts/run-flyway.sh baseline -baselineVersion=5
```

Then insert the row Flyway would have written, in its own transaction, with
`version` set to your baseline version:

```sql
INSERT INTO flyway_sample.flyway_schema_history
  (installed_rank, version, description, type, script, checksum,
   installed_by, execution_time, success)
VALUES (1, '5', '<< Flyway Baseline >>', 'BASELINE',
        '<< Flyway Baseline >>', NULL, 'admin', 0, true);
```

`make info` then shows V1 to V4 as `Below Baseline` and the baseline at 5,
and `make migrate` applies V6 onwards.

## 11. Reporting problems

The module source lives in the Flyway community database support project,
and AWS republishes it as
[`software.amazon.dsql:aurora-dsql-flyway-support`](https://github.com/awslabs/aurora-dsql-tools/tree/main/flyway).
Bugs in the module itself, such as limitation 10 above, belong upstream
rather than in this sample's issue tracker.

Load one artifact, not both. The two carry the same `DatabaseType`, and the
AWS README warns against putting both on the classpath.
