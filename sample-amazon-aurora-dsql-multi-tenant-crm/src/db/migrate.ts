import type { PoolClient } from "pg";
import { pool, closePool } from "./pool.js";

/**
 * Aurora DSQL requires each DDL statement to run in its own transaction, and a
 * transaction may contain only one DDL statement. This runner executes the
 * statements below one at a time.
 *
 * Ordering matters: tables carrying a foreign key must be created after the
 * table they reference. The array below is ordered parents-first
 * (tenants -> users -> accounts -> contacts/opportunities -> activities).
 *
 * Run once against a fresh cluster (as a role allowed to create tables):
 *   DSQL_ENDPOINT=... DSQL_USER=admin npm run migrate
 */
const DDL_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS tenants (
     id UUID PRIMARY KEY,
     name VARCHAR(200) NOT NULL,
     status VARCHAR(20) NOT NULL DEFAULT 'active',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS users (
     id UUID PRIMARY KEY,
     tenant_id UUID NOT NULL REFERENCES tenants (id),
     email VARCHAR(254) NOT NULL,
     name VARCHAR(200) NOT NULL,
     role VARCHAR(30) NOT NULL DEFAULT 'member',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (tenant_id, email)
   )`,
  `CREATE TABLE IF NOT EXISTS accounts (
     id UUID PRIMARY KEY,
     tenant_id UUID NOT NULL REFERENCES tenants (id),
     name VARCHAR(200) NOT NULL,
     industry VARCHAR(100),
     website VARCHAR(254),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS contacts (
     id UUID PRIMARY KEY,
     tenant_id UUID NOT NULL REFERENCES tenants (id),
     account_id UUID NOT NULL REFERENCES accounts (id),
     first_name VARCHAR(100) NOT NULL,
     last_name VARCHAR(100) NOT NULL,
     email VARCHAR(254),
     phone VARCHAR(40),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS opportunities (
     id UUID PRIMARY KEY,
     tenant_id UUID NOT NULL REFERENCES tenants (id),
     account_id UUID NOT NULL REFERENCES accounts (id),
     name VARCHAR(200) NOT NULL,
     stage VARCHAR(30) NOT NULL DEFAULT 'prospecting',
     amount NUMERIC(14,2) NOT NULL DEFAULT 0,
     close_date DATE,
     owner_id UUID REFERENCES users (id),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS activities (
     id UUID PRIMARY KEY,
     tenant_id UUID NOT NULL REFERENCES tenants (id),
     related_type VARCHAR(20) NOT NULL,
     related_id UUID NOT NULL,
     subject VARCHAR(200) NOT NULL,
     notes TEXT,
     due_at TIMESTAMPTZ,
     done BOOLEAN NOT NULL DEFAULT FALSE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX ASYNC IF NOT EXISTS idx_users_tenant ON users (tenant_id)`,
  `CREATE INDEX ASYNC IF NOT EXISTS idx_accounts_tenant ON accounts (tenant_id)`,
  `CREATE INDEX ASYNC IF NOT EXISTS idx_contacts_tenant_acct ON contacts (tenant_id, account_id)`,
  `CREATE INDEX ASYNC IF NOT EXISTS idx_opps_tenant_stage ON opportunities (tenant_id, stage)`,
  `CREATE INDEX ASYNC IF NOT EXISTS idx_activities_tenant_rel ON activities (tenant_id, related_id)`,
];

/**
 * Aurora DSQL job identifiers are 26-character lowercase alphanumeric strings,
 * for example `its3zomaw5fwzjdnz3ojgcotji`. They are not UUIDs. The check below
 * is strict about the character set, which is what makes it safe to inline the
 * value as a SQL literal: no quote or escape character can pass it.
 */
const JOB_ID_RE = /^[0-9a-z]{26}$/;

/**
 * Block until an async index build finishes, then confirm it actually
 * succeeded.
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
 * worked, reporting the outcome in `succeeded`. A failed build leaves an
 * invalid index behind, and because the DDL uses `IF NOT EXISTS`, re-running
 * the migration would skip it and leave the index permanently broken. So treat
 * `succeeded = false` as fatal and tell the operator how to recover.
 */
async function waitForIndexJob(
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

async function migrate(): Promise<void> {
  for (const sql of DDL_STATEMENTS) {
    const client = await pool.connect();
    const label = sql.trim().split("\n")[0];
    try {
      await client.query("BEGIN");
      const result = await client.query(sql);
      await client.query("COMMIT");

      // CREATE INDEX ASYNC returns a job_id; block until the index is VALID so
      // migrations are deterministic (useful in CI and for large tables).
      const jobId = (result.rows?.[0] as { job_id?: string } | undefined)?.job_id;
      if (jobId) {
        await waitForIndexJob(client, jobId, label);
      }
      console.log(`ok: ${label}`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error(`failed: ${label}`);
      throw err;
    } finally {
      client.release();
    }
  }
  console.log("migration complete");
}

migrate()
  .then(closePool)
  .catch(async (err) => {
    console.error(err);
    await closePool();
    process.exit(1);
  });
