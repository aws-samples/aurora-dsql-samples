// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

/**
 * Schema Management for the Booking API (postgres.js)
 *
 * Manages the `bookings` table lifecycle in Aurora DSQL via the
 * postgres.js connector. On startup the admin user creates the table
 * (idempotent), creates async indexes for overlap queries and
 * identical-window uniqueness, and creates a non-admin database role
 * with CRUD privileges.
 *
 * Aurora DSQL design notes reflected in the schema:
 *   - UUID primary keys via `gen_random_uuid()` — UUIDs spread writes
 *     across storage nodes. Sequences and IDENTITY are also supported
 *     if you need compact integer keys.
 *   - Application-layer overlap detection — to express "no overlapping
 *     ranges per resource," the app does a SELECT-based check inside the
 *     transaction, plus a UNIQUE index on the exact window triple so
 *     identical-window double-bookings are caught at the database layer.
 *   - Application-layer referential integrity — the Aurora DSQL
 *     migration guide recommends enforcing relationships in the app
 *     layer. This sample stores `booked_by` as a plain string.
 *   - Each DDL statement is its own implicit transaction in Aurora DSQL
 *     — each `sql.unsafe(...)` call below is issued separately. Do NOT
 *     combine multiple DDL statements in a single call.
 *
 * @module schema
 */

import { createClient, type Sql } from "./db.ts";

/**
 * Options for schema setup and teardown operations.
 *
 * @property endpoint - The Aurora DSQL cluster hostname
 * @property user - The PostgreSQL user (must be admin for DDL operations)
 * @property region - AWS region (optional, auto-discovered from endpoint)
 */
export interface SchemaOptions {
  endpoint: string;
  user: string;
  region?: string;
}

/**
 * Creates the `bookings` table, supporting async indexes, and a non-admin
 * database role. Idempotent — safe to call on every startup.
 *
 * DSQL-specific notes:
 *   - Each DDL is issued in its own `sql.unsafe(...)` call (separate
 *     transaction).
 *   - Indexes are created with `CREATE INDEX ASYNC` — Aurora DSQL uses
 *     asynchronous index builds for zero-downtime DDL. Indexes are
 *     usable for reads while they finish building.
 *   - CREATE ROLE does not have an `IF NOT EXISTS` variant, so
 *     SQLSTATE 42710 (duplicate role) is caught and ignored for
 *     idempotent startup.
 *
 * @param options - Schema setup options (endpoint, admin user, region)
 * @throws {Error} If the database connection or DDL execution fails
 */
export async function setupSchema(options: SchemaOptions): Promise<void> {
  const sql = createClient({
    endpoint: options.endpoint,
    user: options.user,
    region: options.region,
    max: 1,
    // Suppress the NOTICE that `CREATE TABLE IF NOT EXISTS` emits when the
    // table already exists. The idempotent DDLs in this function are
    // expected to be no-ops on restart; logging the server-side NOTICE
    // every time is noise.
    onNotice: () => {},
  });

  try {
    // DDL 1: bookings table (idempotent).
    await sql.unsafe(`
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
    // AND end_time > $3`) index-driven. Catch 42P07 to stay idempotent.
    await ignoreSqlState("42P07", () =>
      sql.unsafe(
        `CREATE INDEX ASYNC idx_bookings_resource_start
           ON bookings (resource_name, start_time)`,
      )
    );

    // DDL 3: UNIQUE async index on (resource_name, start_time, end_time) —
    // prevents two bookings from sharing an identical window triple at the
    // database layer. Backstop for the SELECT-then-INSERT race in
    // createBooking: under concurrent load the app's overlap check may not
    // prevent identical-window double-bookings, but this index guarantees
    // DSQL rejects the second INSERT with SQLSTATE 40001 (OC000). The app
    // maps that to HTTP 503 after retries.
    //
    // Consideration: this index enforces EXACT-match windows. Partially
    // overlapping windows with different endpoints are not caught — the
    // unique-index mechanism matches all three columns identically. See
    // README for production guidance on serializing overlapping writes.
    await ignoreSqlState("42P07", () =>
      sql.unsafe(
        `CREATE UNIQUE INDEX ASYNC idx_bookings_uniq_window
           ON bookings (resource_name, start_time, end_time)`,
      )
    );

    // DDL 4: non-admin role (no IF NOT EXISTS support → catch 42710).
    //
    // NOTE: This sample creates `non_admin_user` with CRUD privileges but
    // the runtime pool still connects as `CLUSTER_USER` (typically admin).
    // In production, map `non_admin_user` to an IAM role and run CRUD
    // through that client; reserve the admin client for DDL/setup only.
    // See the Aurora DSQL docs on database roles and IAM authentication:
    // https://docs.aws.amazon.com/aurora-dsql/latest/userguide/using-database-and-iam-roles.html
    await ignoreSqlState("42710", () =>
      sql.unsafe(`CREATE ROLE non_admin_user`)
    );

    // DDL 5: grant CRUD on bookings to the non-admin role. GRANT is
    // idempotent — safe to re-run.
    await sql.unsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON bookings TO non_admin_user`,
    );

    console.log(
      "Schema setup complete — bookings table, indexes, and non_admin_user role ready",
    );
  } finally {
    await sql.end();
  }
}

/**
 * Drops the `bookings` table, its async indexes, and the `non_admin_user`
 * role. Destructive — only call when you own the cluster and want a clean
 * slate. Prefer `cleanupTestRows()` for test teardown on shared clusters.
 *
 * @param options - Schema teardown options (endpoint, admin user, region)
 * @throws {Error} If the database connection or DROP fails
 */
export async function teardownSchema(options: SchemaOptions): Promise<void> {
  const sql = createClient({
    endpoint: options.endpoint,
    user: options.user,
    region: options.region,
    max: 1,
  });

  try {
    await sql.unsafe(`DROP TABLE IF EXISTS bookings`);
    // 2BP01 = "dependent objects still exist"; tolerated so teardown is
    // idempotent on clusters where the role owns grants outside our table.
    await ignoreSqlState("2BP01", () =>
      sql.unsafe(`DROP ROLE IF EXISTS non_admin_user`)
    );
    console.log(
      "Schema teardown complete — bookings table, indexes, and non_admin_user role dropped",
    );
  } finally {
    await sql.end();
  }
}

/**
 * Deletes rows inserted by tests without touching the table definition.
 *
 * Tests should tag their rows by setting `booked_by` to a known prefix
 * (e.g., `"test-integration-…"`, `"test-occ-race-…"`). This function
 * deletes only rows whose `booked_by` starts with the given prefix, so
 * integration tests can share a cluster with a running booking-API server
 * or with each other without collateral damage.
 *
 * Prefer this over `teardownSchema()` in test teardown.
 *
 * @param options - Schema options (endpoint, admin user, region)
 * @param bookedByPrefix - `booked_by` prefix to match (minimum 4 chars)
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

  const sql = createClient({
    endpoint: options.endpoint,
    user: options.user,
    region: options.region,
    max: 1,
  });

  try {
    await sql`
      DELETE FROM bookings WHERE booked_by LIKE ${bookedByPrefix + "%"}
    `;
  } finally {
    await sql.end();
  }
}

/**
 * Runs an async DDL operation; rethrows unless the thrown error carries
 * the given SQLSTATE, in which case it's swallowed. Used to keep DDL steps
 * idempotent across re-runs of `setupSchema`.
 */
async function ignoreSqlState(
  sqlstate: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
  } catch (error: unknown) {
    if (extractSqlState(error) !== sqlstate) throw error;
  }
}

/**
 * Extracts the PostgreSQL SQLSTATE code from an unknown error object.
 * postgres.js puts it at `error.code` directly.
 */
function extractSqlState(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as Record<string, unknown>;
  if (typeof record.code === "string") return record.code;
  return undefined;
}
