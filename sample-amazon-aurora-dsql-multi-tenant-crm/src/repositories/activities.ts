import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { withTransaction } from "../db/occ.js";
import {
  ApiError,
  type Activity,
  type ActivityRelatedType,
} from "../types.js";

const COLUMNS =
  "id, tenant_id, related_type, related_id, subject, notes, due_at, done, created_at";

const VALID_TYPES: ActivityRelatedType[] = [
  "account",
  "contact",
  "opportunity",
];

/**
 * Aurora DSQL caps a single transaction two ways: at 3,000 modified rows and
 * at 10 MiB of changed data. Exceeding either fails the whole batch with
 * SQLSTATE 54000 (`program_limit_exceeded`).
 *
 * No fixed row count is safe, which is the point worth taking away. The row
 * cap is a count, but the byte cap depends on the data, and `activities.notes`
 * is TEXT. Whatever constant you pick is either too small for narrow rows or
 * too large for wide ones. So start at BATCH_SIZE and halve on 54000 down to
 * BATCH_SIZE_FLOOR, which adapts to whatever the rows actually weigh.
 */
const BATCH_SIZE = 1000;
const BATCH_SIZE_FLOOR = 50;

/** SQLSTATE 54000: a transaction exceeded a per-transaction Aurora DSQL cap. */
const PROGRAM_LIMIT_EXCEEDED = "54000";

function isLimitExceeded(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === PROGRAM_LIMIT_EXCEEDED
  );
}

/**
 * Cap on `notes` length. TEXT itself is unbounded, so without a ceiling here a
 * caller could store notes large enough that even a small batch breaches the
 * 10 MiB per-transaction limit, leaving the complete endpoint permanently
 * failing for that record.
 */
export const MAX_NOTES_LENGTH = 20_000;

export interface ActivityInput {
  related_type: ActivityRelatedType;
  related_id: string;
  subject: string;
  notes?: string | null;
  due_at?: string | null;
}

/** Table holding each related_type, used to verify related_id. */
const RELATED_TABLES: Record<ActivityRelatedType, string> = {
  account: "accounts",
  contact: "contacts",
  opportunity: "opportunities",
};

/**
 * Verify that related_id points at a record of the stated type inside this
 * tenant.
 *
 * `activities.related_id` is a bare UUID with no foreign key, because it is
 * polymorphic: it may reference an account, a contact or an opportunity. That
 * means the database cannot check it at all, so nothing but this function
 * stops a caller from attaching an activity to an arbitrary id, including one
 * belonging to another tenant.
 *
 * The table name is looked up from a fixed map rather than interpolated from
 * caller input, and related_type is validated against VALID_TYPES first.
 */
async function assertRelatedRecordInTenant(
  client: PoolClient,
  tenantId: string,
  relatedType: ActivityRelatedType,
  relatedId: string,
): Promise<void> {
  const table = RELATED_TABLES[relatedType];
  const { rows } = await client.query(
    `SELECT 1 FROM ${table} WHERE tenant_id = $1 AND id = $2`,
    [tenantId, relatedId],
  );
  if (rows.length === 0) {
    throw new ApiError(
      400,
      `related_id does not match an existing ${relatedType} for this tenant`,
    );
  }
}

export async function createActivity(
  tenantId: string,
  input: ActivityInput,
): Promise<Activity> {
  if (!VALID_TYPES.includes(input.related_type)) {
    throw new ApiError(400, `Invalid related_type: ${input.related_type}`);
  }
  if (input.notes && input.notes.length > MAX_NOTES_LENGTH) {
    throw new ApiError(
      400,
      `Field 'notes' must be ${MAX_NOTES_LENGTH} characters or fewer`,
    );
  }
  const id = randomUUID();
  return withTransaction(async (client) => {
    await assertRelatedRecordInTenant(
      client,
      tenantId,
      input.related_type,
      input.related_id,
    );
    const { rows } = await client.query<Activity>(
      `INSERT INTO activities
         (id, tenant_id, related_type, related_id, subject, notes, due_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${COLUMNS}`,
      [
        id,
        tenantId,
        input.related_type,
        input.related_id,
        input.subject,
        input.notes ?? null,
        input.due_at ?? null,
      ],
    );
    return rows[0];
  });
}

export async function listActivities(
  tenantId: string,
  relatedId?: string,
  limit = 50,
): Promise<Activity[]> {
  if (relatedId) {
    const { rows } = await pool.query<Activity>(
      `SELECT ${COLUMNS} FROM activities
        WHERE tenant_id = $1 AND related_id = $2
        ORDER BY created_at DESC
        LIMIT $3`,
      [tenantId, relatedId, limit],
    );
    return rows;
  }
  const { rows } = await pool.query<Activity>(
    `SELECT ${COLUMNS} FROM activities
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [tenantId, limit],
  );
  return rows;
}

/**
 * Mark every open activity for a record as done.
 *
 * A busy tenant can have more open activities than one Aurora DSQL
 * transaction may modify, so this loops in batches. The `done = FALSE`
 * predicate makes each iteration idempotent and resumable: a batch that fails
 * leaves its rows unchanged, and the next pass picks them up again.
 *
 * The batch size adapts. If a batch trips a per-transaction cap (SQLSTATE
 * 54000) the size is halved and retried, because the 10 MiB byte cap depends
 * on how wide the rows are and no fixed row count is right for every tenant.
 * Shrinking is sticky for the rest of the call, since later batches hold
 * similar data.
 *
 * Returns the total number of activities completed.
 */
export async function completeActivitiesFor(
  tenantId: string,
  relatedId: string,
): Promise<number> {
  let total = 0;
  let batchSize = BATCH_SIZE;

  for (;;) {
    let affected: number;
    try {
      affected = await withTransaction(async (client) => {
        const result = await client.query(
          `UPDATE activities SET done = TRUE
            WHERE id IN (
              SELECT id FROM activities
               WHERE tenant_id = $1 AND related_id = $2 AND done = FALSE
               LIMIT $3
            )`,
          [tenantId, relatedId, batchSize],
        );
        return result.rowCount ?? 0;
      });
    } catch (err) {
      if (isLimitExceeded(err) && batchSize > BATCH_SIZE_FLOOR) {
        batchSize = Math.max(BATCH_SIZE_FLOOR, Math.floor(batchSize / 2));
        console.warn(
          `activities.complete: transaction limit hit, retrying with batch ${batchSize}`,
        );
        continue;
      }
      throw err;
    }

    total += affected;
    if (affected < batchSize) break;
  }
  return total;
}
