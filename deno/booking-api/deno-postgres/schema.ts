// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Schema Management for the Booking API (deno-postgres)
 *
 * Manages the `bookings` table lifecycle in Aurora DSQL. On startup the admin
 * user creates the table (if it doesn't already exist), creates a non-admin
 * database role, and grants that role the minimum privileges needed to operate
 * the booking CRUD endpoints. On shutdown the table is dropped for clean
 * sample teardown.
 *
 * Aurora DSQL constraints reflected in the schema:
 *   - No sequences or SERIAL types → UUIDs via `gen_random_uuid()`
 *   - No exclusion constraints or triggers → overlap detection in application SQL
 *   - No foreign keys → single-table design
 *
 * @module schema
 */

import { createConnection, type ConnectionOptions } from "./db.ts";

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
 * Creates the bookings table and non-admin role if they don't already exist.
 *
 * This function connects as the admin user, runs the DDL statements, and
 * disconnects. It is idempotent — safe to call on every startup.
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

    // Create a non-admin role for least-privilege demonstration.
    // Aurora DSQL supports CREATE ROLE but not IF NOT EXISTS for roles,
    // so we catch the "already exists" error gracefully.
    try {
      await client.queryArray(
        `CREATE ROLE non_admin_user`,
      );
    } catch (error: unknown) {
      // Role already exists — safe to ignore (SQLSTATE 42710)
      const record = error as Record<string, unknown>;
      const code =
        record.code ??
        (record.fields as Record<string, unknown> | undefined)?.code;
      if (code !== "42710") {
        throw error;
      }
    }

    await client.queryArray(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON bookings TO non_admin_user`,
    );

    console.log("Schema setup complete — bookings table and non_admin_user role ready");
  } finally {
    await client.end();
  }
}

/**
 * Drops the bookings table for clean sample teardown.
 *
 * Called during graceful shutdown (SIGINT / SIGTERM) to leave the cluster
 * in a clean state after running the sample.
 *
 * @param options - Schema teardown options (endpoint, admin user, region)
 * @throws {Error} If the database connection or DROP TABLE fails
 */
export async function teardownSchema(options: SchemaOptions): Promise<void> {
  const client = await createConnection({
    endpoint: options.endpoint,
    user: options.user,
    region: options.region,
    isAdmin: options.isAdmin,
  });

  try {
    await client.queryArray(`DROP TABLE IF EXISTS bookings`);
    console.log("Schema teardown complete — bookings table dropped");
  } finally {
    await client.end();
  }
}
