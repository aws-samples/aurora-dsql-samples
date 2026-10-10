import { randomUUID } from "node:crypto";
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

// Aurora DSQL caps a single transaction at 3,000 modified rows.
const BATCH_SIZE = 3000;

export interface ActivityInput {
  related_type: ActivityRelatedType;
  related_id: string;
  subject: string;
  notes?: string | null;
  due_at?: string | null;
}

export async function createActivity(
  tenantId: string,
  input: ActivityInput,
): Promise<Activity> {
  if (!VALID_TYPES.includes(input.related_type)) {
    throw new ApiError(400, `Invalid related_type: ${input.related_type}`);
  }
  const id = randomUUID();
  return withTransaction(async (client) => {
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
