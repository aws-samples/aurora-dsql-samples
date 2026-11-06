import type { PoolClient } from "pg";
import { ApiError } from "../types.js";

/**
 * Assert a user exists within the tenant.
 *
 * `opportunities.owner_id` declares a foreign key to `users (id)`, which
 * Aurora DSQL enforces, so the foreign key proves the user exists. On its own
 * it does not express "and belongs to the same tenant": without this check a
 * caller could set `owner_id` to a user in another tenant.
 *
 * The database can enforce it instead. Add `UNIQUE (tenant_id, id)` to
 * `users`, keep the UUID primary key, and declare
 * `FOREIGN KEY (tenant_id, owner_id) REFERENCES users (tenant_id, id)`;
 * Aurora DSQL accepts a unique constraint as a foreign-key target, and a
 * cross-tenant write is then rejected with SQLSTATE 23503. Checking in the
 * application is a choice, not the only option: it keeps the rule beside the
 * query that depends on it.
 *
 * Runs inside the caller's transaction so the check and the write commit
 * together.
 */
export async function assertUserInTenant(
  client: PoolClient,
  tenantId: string,
  userId: string,
): Promise<void> {
  const { rows } = await client.query(
    "SELECT 1 FROM users WHERE tenant_id = $1 AND id = $2",
    [tenantId, userId],
  );
  if (rows.length === 0) {
    throw new ApiError(400, "owner_id does not exist for this tenant");
  }
}
