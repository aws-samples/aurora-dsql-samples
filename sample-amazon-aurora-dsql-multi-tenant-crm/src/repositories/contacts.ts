import { randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import { withTransaction } from "../db/occ.js";
import { ApiError, type Contact } from "../types.js";
import { assertAccountInTenant } from "./accounts.js";

const COLUMNS =
  "id, tenant_id, account_id, first_name, last_name, email, phone, created_at";

export interface ContactInput {
  account_id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
}

export async function createContact(
  tenantId: string,
  input: ContactInput,
): Promise<Contact> {
  const id = randomUUID();
  return withTransaction(async (client) => {
    // Application-layer referential integrity: the account must belong to the
    // same tenant. Enforced inside the transaction (no foreign keys in DSQL).
    await assertAccountInTenant(client, tenantId, input.account_id);

    const { rows } = await client.query<Contact>(
      `INSERT INTO contacts
         (id, tenant_id, account_id, first_name, last_name, email, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${COLUMNS}`,
      [
        id,
        tenantId,
        input.account_id,
        input.first_name,
        input.last_name,
        input.email ?? null,
        input.phone ?? null,
      ],
    );
    return rows[0];
  });
}

export async function listContacts(
  tenantId: string,
  accountId?: string,
  limit = 50,
): Promise<Contact[]> {
  if (accountId) {
    const { rows } = await pool.query<Contact>(
      `SELECT ${COLUMNS} FROM contacts
        WHERE tenant_id = $1 AND account_id = $2
        ORDER BY created_at DESC
        LIMIT $3`,
      [tenantId, accountId, limit],
    );
    return rows;
  }
  const { rows } = await pool.query<Contact>(
    `SELECT ${COLUMNS} FROM contacts
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [tenantId, limit],
  );
  return rows;
}

export async function getContact(
  tenantId: string,
  id: string,
): Promise<Contact> {
  const { rows } = await pool.query<Contact>(
    `SELECT ${COLUMNS} FROM contacts WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  );
  if (rows.length === 0) {
    throw new ApiError(404, "Contact not found");
  }
  return rows[0];
}
