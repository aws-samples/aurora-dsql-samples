// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * HTTP Server Entry Point for the Booking API (deno-postgres)
 *
 * Starts a `Deno.serve()` HTTP server that routes requests to the booking
 * handlers. On startup the admin user creates the bookings table and a
 * non-admin role. On shutdown (SIGINT / SIGTERM) the table is dropped only
 * if `CLEANUP_ON_EXIT=true` — by default the schema is preserved so the
 * server can safely run against a shared sample cluster.
 *
 * The module also exports a default `{ fetch }` handler so that the server
 * can be started with `deno serve` for multi-instance and serverless
 * deployment patterns (e.g., Deno Deploy).
 *
 * Required environment variables:
 *   - `CLUSTER_ENDPOINT` — Aurora DSQL cluster hostname
 *   - `CLUSTER_USER` — PostgreSQL user (e.g., "admin")
 *
 * Optional environment variables:
 *   - `PORT` — HTTP listening port (default: 8000)
 *   - `HOST` — HTTP bind address (default: "127.0.0.1" for safe-by-default
 *             localhost binding; set to "0.0.0.0" only when deploying
 *             behind a trusted reverse proxy or load balancer)
 *   - `CLEANUP_ON_EXIT` — If "true", drop the bookings table on graceful
 *             shutdown. Default is "false" so sample runs don't destroy
 *             bookings on a shared cluster.
 *   - `AWS_REGION` — AWS region for IAM token generation
 *
 * @module main
 */

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
// Schema setup (admin)
// ---------------------------------------------------------------------------

await setupSchema({ endpoint: ENDPOINT, user: USER, isAdmin: true });

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

const cleanup = async () => {
  if (!CLEANUP_ON_EXIT) {
    console.log(
      "Shutting down — preserving schema " +
        "(set CLEANUP_ON_EXIT=true to drop the bookings table).",
    );
    Deno.exit(0);
  }
  console.log("Shutting down — dropping bookings table (CLEANUP_ON_EXIT=true)...");
  try {
    await teardownSchema({ endpoint: ENDPOINT!, user: USER!, isAdmin: true });
  } catch (error) {
    logError("Teardown error", error);
  }
  Deno.exit(0);
};

Deno.addSignalListener("SIGINT", cleanup);
Deno.addSignalListener("SIGTERM", cleanup);

// ---------------------------------------------------------------------------
// Default export for `deno serve` compatibility
// ---------------------------------------------------------------------------

/**
 * Default export for `deno serve` — enables multi-instance and serverless
 * deployment without changing the module.
 */
export default {
  fetch(req: Request): Promise<Response> {
    return handleRequest(req, { endpoint: ENDPOINT!, user: USER! });
  },
};

// ---------------------------------------------------------------------------
// Start HTTP server
// ---------------------------------------------------------------------------

Deno.serve({ port: PORT, hostname: HOST }, (req) =>
  handleRequest(req, { endpoint: ENDPOINT!, user: USER! }),
);
