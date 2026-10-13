import type { PoolClient } from "pg";

/**
 * Aurora DSQL job identifiers are 26-character lowercase alphanumeric strings,
 * for example `its3zomaw5fwzjdnz3ojgcotji`. They are not UUIDs. The check below
 * is strict about the character set, which is what makes it safe to inline the
 * value as a SQL literal: no quote or escape character can pass it.
 */
export const JOB_ID_RE = /^[0-9a-z]{26}$/;

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
 *  2. `CALL` cannot run inside a transaction block, and Aurora DSQL rejects a
 *     subquery as the argument. The caller commits before reaching this
 *     function, so the connection is in autocommit, and the job id is
 *     validated and inlined as a literal.
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
  if (!JOB_ID_RE.test(jobId)) {
    throw new Error(
      `Refusing to wait on a malformed job id: ${jobId}\n` +
        "  Expected 26 lowercase alphanumeric characters.",
    );
  }
  const { rows } = await client.query(`CALL sys.wait_for_job('${jobId}')`);
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
