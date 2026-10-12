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
 * at 10 MiB of changed data. The row cap is the easy one to reason about, but
 * the byte cap bites first when rows are wide: `activities.notes` is TEXT, so
 * 3,000 rows carrying a few KiB of notes each exceeds 10 MiB and the whole
 * batch fails with SQLSTATE 54000.
 *
 * 1,000 keeps a batch under the byte cap for notes up to the length
 * MAX_NOTES_LENGTH allows, while still bounding the number of round trips.
 */
const BATCH_SIZE = 1000;

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
 * Mark every open activity for a record as done. A busy tenant can have more
 * than 3,000 open activities, which would exceed the Aurora DSQL per-
 * transaction row limit in a single UPDATE. We loop in batches; the
 * `done = FALSE` predicate makes each iteration idempotent and resumable.
 * Returns the total number of activities completed.
 */
export async function completeActivitiesFor(
  tenantId: string,
  relatedId: string,
): Promise<number> {
  let total = 0;
  for (;;) {
    const affected = await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE activities SET done = TRUE
          WHERE id IN (
            SELECT id FROM activities
             WHERE tenant_id = $1 AND related_id = $2 AND done = FALSE
             LIMIT $3
          )`,
        [tenantId, relatedId, BATCH_SIZE],
      );
      return result.rowCount ?? 0;
    });
    total += affected;
    if (affected < BATCH_SIZE) break;
  }
  return total;
}
