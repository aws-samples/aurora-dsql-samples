import type { PoolClient } from "pg";

/**
 * Block until an async index build finishes, then confirm it actually
 * succeeded.
 *
 * Kept in its own module, separate from the migration runner, so the failure
 * branch below can be covered by a test. migrate.ts runs on import.
 *
 * Two Aurora DSQL details matter here:
 *
 *  1. `sys.wait_for_job` is a stored procedure, so it must be invoked with
 *     `CALL`. Using `SELECT` raises SQLSTATE 42809 (wrong object type).
 *  2. `CALL` cannot run inside a transaction block: Aurora DSQL raises
 *     SQLSTATE 0A000, "CALL sys.wait_for_job not supported in transaction
 *     block". The caller commits before reaching this function, so the
 *     connection is in autocommit.
 *
 * The job id is passed as a bind parameter. Aurora DSQL does reject a
 * *subquery* as the argument (0A000, "cannot use subquery in CALL argument"),
 * but a bind parameter is accepted, so there is no reason to interpolate the
 * value into the SQL text.
 *
 * The procedure returns normally when the build finishes, whether or not it
 * worked, reporting the outcome in `succeeded`. Verified against a live
 * cluster: a `CREATE UNIQUE INDEX ASYNC` over duplicate values returns
 * `[{ succeeded: false }]` and leaves the index with `indisvalid = false`.
 * Because the DDL uses `IF NOT EXISTS`, re-running the migration would skip
 * that broken index and leave it permanently invalid. So treat
 * `succeeded = false` as fatal and tell the operator how to recover.
 */
export async function waitForIndexJob(
  client: PoolClient,
  jobId: string,
  label: string,
): Promise<void> {
  const { rows } = await client.query("CALL sys.wait_for_job($1)", [jobId]);
  const succeeded = (rows?.[0] as { succeeded?: boolean } | undefined)
    ?.succeeded;
  if (succeeded === false) {
    throw new Error(
      `Async index build failed for: ${label}\n` +
        `  job id: ${jobId}\n` +
        "  The index exists but is invalid. Because the statement uses " +
        "IF NOT EXISTS, re-running this migration will skip it. Drop the " +
        "index manually, then re-run:\n" +
        `  DROP INDEX <index name>;`,
    );
  }
  console.log(`  async index job ${jobId} finished`);
}
