import { randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import { withTransaction } from "../db/occ.js";
import {
  ApiError,
  type Opportunity,
  type OpportunityStage,
} from "../types.js";
import { assertAccountInTenant } from "./accounts.js";

const COLUMNS =
  "id, tenant_id, account_id, name, stage, amount, close_date, owner_id, created_at";

const VALID_STAGES: OpportunityStage[] = [
  "prospecting",
  "qualification",
  "proposal",
  "negotiation",
  "closed_won",
  "closed_lost",
];

export interface OpportunityInput {
  account_id: string;
  name: string;
  stage?: OpportunityStage;
  amount?: number;
  close_date?: string | null;
  owner_id?: string | null;
}

export async function createOpportunity(
  tenantId: string,
  input: OpportunityInput,
): Promise<Opportunity> {
  const id = randomUUID();
  const stage = input.stage ?? "prospecting";
  if (!VALID_STAGES.includes(stage)) {
    throw new ApiError(400, `Invalid stage: ${stage}`);
  }
  return withTransaction(async (client) => {
    await assertAccountInTenant(client, tenantId, input.account_id);
    const { rows } = await client.query<Opportunity>(
      `INSERT INTO opportunities
         (id, tenant_id, account_id, name, stage, amount, close_date, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${COLUMNS}`,
      [
        id,
        tenantId,
        input.account_id,
        input.name,
        stage,
        input.amount ?? 0,
        input.close_date ?? null,
        input.owner_id ?? null,
      ],
    );
    return rows[0];
  });
}

export async function listOpportunities(
  tenantId: string,
  stage?: OpportunityStage,
  limit = 50,
): Promise<Opportunity[]> {
  if (stage) {
    const { rows } = await pool.query<Opportunity>(
      `SELECT ${COLUMNS} FROM opportunities
        WHERE tenant_id = $1 AND stage = $2
        ORDER BY created_at DESC
        LIMIT $3`,
      [tenantId, stage, limit],
    );
    return rows;
  }
  const { rows } = await pool.query<Opportunity>(
    `SELECT ${COLUMNS} FROM opportunities
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [tenantId, limit],
  );
  return rows;
}

/**
 * Advance an opportunity to a new stage. This is a read-modify-write against a
 * single row, so it is exactly the kind of operation OCC protects: if two
 * requests update the same opportunity concurrently, one commits and the other
 * gets a 40001 serialization error and is retried transparently by
 * withTransaction.
 */
export async function updateStage(
  tenantId: string,
  id: string,
  stage: OpportunityStage,
): Promise<Opportunity> {
  if (!VALID_STAGES.includes(stage)) {
    throw new ApiError(400, `Invalid stage: ${stage}`);
  }
  return withTransaction(async (client) => {
    const { rows } = await client.query<Opportunity>(
      `UPDATE opportunities SET stage = $3
        WHERE tenant_id = $1 AND id = $2
        RETURNING ${COLUMNS}`,
      [tenantId, id, stage],
    );
    if (rows.length === 0) {
      throw new ApiError(404, "Opportunity not found");
    }
    return rows[0];
  });
}
