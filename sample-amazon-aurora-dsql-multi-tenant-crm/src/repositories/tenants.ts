import { randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import { withTransaction } from "../db/occ.js";
import type { Tenant } from "../types.js";

/**
 * Tenant registry. This is the one repository that is NOT tenant-scoped --
 * it manages the tenants themselves. Creating a tenant is an administrative
 * operation; in production it would sit behind admin-only authorization.
 */
export async function createTenant(name: string): Promise<Tenant> {
  const id = randomUUID();
  return withTransaction(async (client) => {
    const { rows } = await client.query<Tenant>(
      `INSERT INTO tenants (id, name) VALUES ($1, $2)
       RETURNING id, name, status, created_at`,
      [id, name],
    );
    return rows[0];
  });
}

export async function listTenants(): Promise<Tenant[]> {
  const { rows } = await pool.query<Tenant>(
    "SELECT id, name, status, created_at FROM tenants ORDER BY created_at DESC",
  );
  return rows;
}

/** Look up a single tenant by id, or null if it does not exist. */
export async function getTenant(id: string): Promise<Tenant | null> {
  const { rows } = await pool.query<Tenant>(
    "SELECT id, name, status, created_at FROM tenants WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}
