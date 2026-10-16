import type { PoolClient } from "pg";
import { ApiError } from "../types.js";

/**
 * Assert a user exists within the tenant.
 *
 * `opportunities.owner_id` declares a foreign key to `users (id)`, which
 * Aurora DSQL enforces, so the foreign key proves the user exists. It cannot
 * express "and belongs to the same tenant", because that would require a
 * composite key on `(tenant_id, id)`. This check closes that gap: without it a
 * caller could set `owner_id` to a user in another tenant.
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
