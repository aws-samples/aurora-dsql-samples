// ---------------------------------------------------------------------------
// Session Housekeeping
// ---------------------------------------------------------------------------
//
// Purges expired and long-revoked rows from `sessions`. Without this, the
// table grows unboundedly and every `token_hash` lookup pays for the larger
// index. Run on a schedule (cron, EventBridge-triggered Lambda, or an ECS
// scheduled task).
//
// Aurora DSQL caps a single transaction at 3,000 rows, so the cleanup is a
// batched, idempotent loop. The 30-day grace window lets you debug auth
// issues against recently revoked tokens without leaking active access.
// Adjust the threshold to match your retention policy.
//
// Invocation:
//   ts-node src/scripts/housekeeping.ts
//   node dist/scripts/housekeeping.js
//
// Required environment:
//   DSQL_ENDPOINT  — e.g. "<cluster-id>.dsql.us-east-1.on.aws"
//   AWS_REGION     — e.g. "us-east-1"
//   AWS_*          — credentials for an IAM principal mapped to a DB role
//                    that has DELETE on `sessions`
// ---------------------------------------------------------------------------

import { closePool, getPool } from '../db/connection';

/** DSQL caps any single DML transaction at 3,000 rows. */
const BATCH_SIZE = 3_000;

/** Default retention grace window for revoked or expired sessions. */
const DEFAULT_RETENTION_DAYS = 30;

/**
 * Delete sessions that are either expired or have been revoked for more
 * than `retentionDays`. Loops until a batch returns fewer rows than the
 * cap, at which point all eligible rows have been purged.
 *
 * @param retentionDays - Sessions older than this (after expiry/revocation)
 *                        are eligible for deletion. Defaults to 30 days.
 * @returns The total number of rows deleted across all batches.
 */
export async function purgeOldSessions(
  retentionDays: number = DEFAULT_RETENTION_DAYS,
): Promise<number> {
  const pool = getPool();
  let totalDeleted = 0;

  // Loop until a batch revoked fewer rows than the cap — that's the signal
  // that no more eligible rows remain.
  while (true) {
    const client = await pool.connect();
    let batchDeleted = 0;
    try {
      // Each batch is its own transaction. We don't need OCC retry here
      // because the housekeeping job is the only writer touching old rows
      // in practice; if it ever conflicts with concurrent revocation, the
      // job is idempotent and can simply be re-run.
      await client.query('BEGIN');

      const result = await client.query(
        `DELETE FROM sessions
          WHERE id IN (
            SELECT id FROM sessions
             WHERE expires_at < NOW() - $1::interval
                OR (revoked_at IS NOT NULL
                    AND revoked_at < NOW() - $1::interval)
             LIMIT $2
          )`,
        [`${retentionDays} days`, BATCH_SIZE],
      );

      await client.query('COMMIT');
      batchDeleted = result.rowCount ?? 0;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // swallow
      }
      throw error;
    } finally {
      client.release();
    }

    totalDeleted += batchDeleted;
    if (batchDeleted < BATCH_SIZE) break;
  }

  return totalDeleted;
}

// ---------------------------------------------------------------------------
// Entry point — only runs when invoked directly, not when imported.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const retention = parseInt(
    process.env.SESSION_RETENTION_DAYS ?? '',
    10,
  );
  const retentionDays = Number.isFinite(retention) && retention > 0
    ? retention
    : DEFAULT_RETENTION_DAYS;

  console.log(
    `[housekeeping] purging sessions older than ${retentionDays} days …`,
  );
  const deleted = await purgeOldSessions(retentionDays);
  console.log(`[housekeeping] deleted ${deleted} row(s)`);
  await closePool();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[housekeeping] failed:', error);
    process.exit(1);
  });
}
