import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { withTransaction } from "../db/occ.js";
import { ApiError, type Account } from "../types.js";

const COLUMNS = "id, tenant_id, name, industry, website, created_at";

export interface AccountInput {
  name: string;
  industry?: string | null;
  website?: string | null;
}

export async function createAccount(
  tenantId: string,
  input: AccountInput,
): Promise<Account> {
  const id = randomUUID();
  return withTransaction(async (client) => {
    const { rows } = await client.query<Account>(
      `INSERT INTO accounts (id, tenant_id, name, industry, website)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${COLUMNS}`,
      [id, tenantId, input.name, input.industry ?? null, input.website ?? null],
    );
    return rows[0];
  });
}

export async function listAccounts(
  tenantId: string,
  limit = 50,
): Promise<Account[]> {
  const { rows } = await pool.query<Account>(
    `SELECT ${COLUMNS} FROM accounts
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [tenantId, limit],
  );
  return rows;
}

export async function getAccount(
  tenantId: string,
  id: string,
): Promise<Account> {
  const { rows } = await pool.query<Account>(
    `SELECT ${COLUMNS} FROM accounts WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  );
  if (rows.length === 0) {
    throw new ApiError(404, "Account not found");
  }
  return rows[0];
}

/**
 * Assert an account exists within the tenant. Used by other repositories to
 * enforce referential integrity in the application layer (Aurora DSQL has no
 * foreign keys). Runs inside the caller's transaction for consistency.
 */
export async function assertAccountInTenant(
  client: PoolClient,
  tenantId: string,
  accountId: string,
): Promise<void> {
  const { rows } = await client.query(
    "SELECT 1 FROM accounts WHERE tenant_id = $1 AND id = $2",
    [tenantId, accountId],
  );
  if (rows.length === 0) {
    throw new ApiError(400, "account_id does not exist for this tenant");
  }
}
