// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

/**
 * HTTP Server Entry Point for the Booking API (postgres.js)
 *
 * Starts a `Deno.serve()` HTTP server that routes requests to the booking
 * handlers. On startup the admin user runs `setupSchema` (idempotent). On
 * shutdown (SIGINT / SIGTERM) the schema is preserved by default; set
 * `CLEANUP_ON_EXIT=true` to drop the bookings table and role.
 *
 * Required environment variables:
 *   - `CLUSTER_ENDPOINT` — Aurora DSQL cluster hostname
 *   - `CLUSTER_USER` — PostgreSQL user (e.g., "admin" for DDL, or a
 *     non-admin role for CRUD). The connector picks admin vs regular IAM
 *     token based on the username.
 *
 * Optional environment variables:
 *   - `PORT` — HTTP listening port (default: 8000)
 *   - `HOST` — HTTP bind address (default: "127.0.0.1"; set "0.0.0.0"
 *     only when deploying behind a trusted reverse proxy)
 *   - `CLEANUP_ON_EXIT` — if "true", drop schema on graceful shutdown
 *   - `AWS_REGION` — optional; auto-discovered from CLUSTER_ENDPOINT
 *
 * @module main
 */

import { createClient } from "./db.ts";
import { handleRequest, logError } from "./handlers.ts";
import { setupSchema, teardownSchema } from "./schema.ts";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(Deno.env.get("PORT") ?? "8000", 10);
const HOST = Deno.env.get("HOST") ?? "127.0.0.1";
const ENDPOINT = Deno.env.get("CLUSTER_ENDPOINT");
const USER = Deno.env.get("CLUSTER_USER");
const CLEANUP_ON_EXIT =
  (Deno.env.get("CLEANUP_ON_EXIT") ?? "false").toLowerCase() === "true";

if (!ENDPOINT || !USER) {
  console.error(
    "CLUSTER_ENDPOINT and CLUSTER_USER environment variables are required",
  );
  Deno.exit(1);
}

// ---------------------------------------------------------------------------
// Schema setup (admin) and pooled runtime client
// ---------------------------------------------------------------------------

await setupSchema({ endpoint: ENDPOINT, user: USER });

const sql = createClient({ endpoint: ENDPOINT, user: USER });

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

const cleanup = async () => {
  if (!CLEANUP_ON_EXIT) {
    console.log(
      "Shutting down — preserving schema " +
        "(set CLEANUP_ON_EXIT=true to drop the bookings table).",
    );
    await sql.end({ timeout: 5 });
    Deno.exit(0);
  }
  console.log("Shutting down — dropping bookings table (CLEANUP_ON_EXIT=true)...");
  try {
    await sql.end({ timeout: 5 });
    await teardownSchema({ endpoint: ENDPOINT!, user: USER! });
  } catch (error) {
    logError("Teardown error", error);
  }
  Deno.exit(0);
};

Deno.addSignalListener("SIGINT", cleanup);
Deno.addSignalListener("SIGTERM", cleanup);

// ---------------------------------------------------------------------------
// Start HTTP server
// ---------------------------------------------------------------------------

Deno.serve({ port: PORT, hostname: HOST }, (req) =>
  handleRequest(req, { sql })
);
