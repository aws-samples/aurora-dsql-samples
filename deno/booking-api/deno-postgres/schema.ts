// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Schema Management for the Booking API (deno-postgres)
 *
 * Manages the `bookings` table lifecycle in Aurora DSQL. On startup the admin
 * user creates the table (idempotent), creates an async index for overlap
 * queries, and creates a non-admin database role with CRUD privileges.
 *
 * Aurora DSQL constraints reflected in the schema:
 *   - No sequences or SERIAL types → UUIDs via `gen_random_uuid()`
 *   - No exclusion constraints or triggers → overlap detection in application SQL
 *   - No foreign keys → single-table design
 *   - Only one DDL statement per transaction → each `queryArray` below is
 *     its own implicit transaction (deno-postgres autocommits bare
 *     statements). Do NOT combine multiple DDL statements into a single
 *     `queryArray` call — DSQL will reject the combined statement.
 *
 * @module schema
 */

import { createConnection } from "./db.ts";

/**
 * Options for schema setup and teardown operations.
 *
 * @property endpoint - The Aurora DSQL cluster hostname
 * @property user - The PostgreSQL user (must be admin for DDL operations)
 * @property region - AWS region (optional, defaults via token generator)
 * @property isAdmin - Must be `true` for schema operations that require DDL
 */
export interface SchemaOptions {
  endpoint: string;
  user: string;
  region?: string;
  isAdmin: boolean;
}

/**
 * Creates the `bookings` table, a supporting async index, and a non-admin
 * database role. Idempotent — safe to call on every startup.
 *
 * DSQL-specific notes:
 *   - Each DDL is issued in its own `queryArray` call (separate transaction).
 *   - The index is created with `CREATE INDEX ASYNC` — DSQL does not support
 *     synchronous index creation. The index is still usable for reads while
 *     it finishes building.
 *   - CREATE ROLE is not idempotent in DSQL (no `IF NOT EXISTS` for roles),
 *     so SQLSTATE 42710 is caught and ignored.
 *
 * @param options - Schema setup options (endpoint, admin user, region)
 * @throws {Error} If the database connection or DDL execution fails
 */
export async function setupSchema(options: SchemaOptions): Promise<void> {
  const client = await createConnection({
    endpoint: options.endpoint,
    user: options.user,
    region: options.region,
    isAdmin: options.isAdmin,
  });

  try {
    // DDL 1: bookings table (idempotent).
    await client.queryArray(`
      CREATE TABLE IF NOT EXISTS bookings (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        resource_name VARCHAR(255) NOT NULL,
        start_time TIMESTAMPTZ NOT NULL,
        end_time TIMESTAMPTZ NOT NULL,
        booked_by VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        CONSTRAINT valid_time_range CHECK (end_time > start_time)
      )
    `);

    // DDL 2: async index on (resource_name, start_time) to make the
    // overlap-detection query (`WHERE resource_name = $1 AND start_time < $2
    // AND end_time > $3`) index-driven. Without this, the overlap check
    // performs a full table scan.
    // Catch 42P07 ("relation already exists") to keep setupSchema idempotent.
    try {
      await client.queryArray(
        `CREATE INDEX ASYNC idx_bookings_resource_start
           ON bookings (resource_name, start_time)`,
      );
    } catch (error: unknown) {
      const code = extractSqlState(error);
      if (code !== "42P07") throw error;
    }

    // DDL 3: non-admin role for least-privilege CRUD.
    // DSQL does not support `CREATE ROLE IF NOT EXISTS`, so we catch
    // SQLSTATE 42710 ("role already exists") and proceed.
    try {
      await client.queryArray(`CREATE ROLE non_admin_user`);
    } catch (error: unknown) {
      const code = extractSqlState(error);
      if (code !== "42710") throw error;
    }

    // DDL 4: grant CRUD on bookings to the non-admin role.
    // GRANT is idempotent in PostgreSQL — safe to re-run.
    await client.queryArray(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON bookings TO non_admin_user`,
    );

    console.log(
      "Schema setup complete — bookings table, async index, and non_admin_user role ready",
    );
  } finally {
    await client.end();
  }
}

/**
 * Drops the `bookings` table, its async index, and the `non_admin_user` role.
 *
 * Destructive — only call when you own the cluster and want a clean slate.
 * Application code and integration tests should prefer `cleanupTestRows()`
 * below, which deletes only rows written by tests and leaves the table
 * available for other callers sharing the cluster.
 *
 * @param options - Schema teardown options (endpoint, admin user, region)
 * @throws {Error} If the database connection or DROP fails
 */
export async function teardownSchema(options: SchemaOptions): Promise<void> {
  const client = await createConnection({
    endpoint: options.endpoint,
    user: options.user,
    region: options.region,
    isAdmin: options.isAdmin,
  });

  try {
    // DROP TABLE cascades to indexes and constraints.
    await client.queryArray(`DROP TABLE IF EXISTS bookings`);
    // Revoke and drop the role last so it outlives table recreation if
    // someone re-runs setupSchema concurrently.
    try {
      await client.queryArray(`DROP ROLE IF EXISTS non_admin_user`);
    } catch (error: unknown) {
      // Ignore dependent-object errors — the role may still own other
      // grants in a shared cluster.
      const code = extractSqlState(error);
      if (code !== "2BP01") throw error; // dependent objects still exist
    }
    console.log(
      "Schema teardown complete — bookings table, index, and non_admin_user role dropped",
    );
  } finally {
    await client.end();
  }
}

/**
 * Deletes rows inserted by tests without touching the table definition.
 *
 * Tests should tag their rows by setting `booked_by` to a known prefix
 * (e.g., `"test-integration-…"`, `"test-overlap-race-…"`). This function
 * deletes only rows whose `booked_by` matches the given prefix, which lets
 * integration tests share a cluster with a running booking-API server or
 * with each other without collateral damage.
 *
 * Prefer this over `teardownSchema()` in test teardown — it is safe on
 * shared clusters.
 *
 * @param options - Connection options
 * @param bookedByPrefix - `booked_by` prefix to match (e.g., `"test-integration-"`)
 */
export async function cleanupTestRows(
  options: SchemaOptions,
  bookedByPrefix: string,
): Promise<void> {
  if (!bookedByPrefix || bookedByPrefix.length < 4) {
    throw new Error(
      `cleanupTestRows: bookedByPrefix must be at least 4 chars (got "${bookedByPrefix}")`,
    );
  }

  const client = await createConnection({
    endpoint: options.endpoint,
    user: options.user,
    region: options.region,
    isAdmin: options.isAdmin,
  });

  try {
    // Parameterized LIKE — the prefix itself is user-controlled test data
    // but the shape of the query is fixed.
    await client.queryArray(
      `DELETE FROM bookings WHERE booked_by LIKE $1`,
      [`${bookedByPrefix}%`],
    );
  } finally {
    await client.end();
  }
}

/**
 * Extracts the PostgreSQL SQLSTATE code from an unknown error object.
 *
 * deno-postgres attaches SQLSTATE at `error.fields.code`; node-postgres
 * puts it at `error.code`. Checks both for portability.
 */
function extractSqlState(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as Record<string, unknown>;
  if (typeof record.code === "string") return record.code;
  const fields = record.fields;
  if (fields && typeof fields === "object") {
    const code = (fields as Record<string, unknown>).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}
