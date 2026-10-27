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
 * Assert an account exists within the tenant.
 *
 * The schema already declares `account_id REFERENCES accounts (id)`, and
 * Aurora DSQL enforces that, so the foreign key proves the account exists.
 * This check proves what the single-column foreign key does not: that the
 * account belongs to the calling tenant. Without it a caller could attach a
 * contact or opportunity to another tenant's account.
 *
 * A composite foreign key can enforce the same rule in the database. Add
 * `UNIQUE (tenant_id, id)` to `accounts`, keep the UUID primary key, and
 * declare `FOREIGN KEY (tenant_id, account_id) REFERENCES accounts
 * (tenant_id, id)`. This sample keeps the check in the application so the
 * rule sits beside the query, which is a choice rather than a necessity.
 *
 * Runs inside the caller's transaction so the check and the insert commit
 * together.
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
