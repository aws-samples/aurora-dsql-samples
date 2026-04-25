// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * HTTP Server Entry Point for the Booking API (deno-postgres)
 *
 * Starts a `Deno.serve()` HTTP server that routes requests to the booking
 * handlers. On startup the admin user creates the bookings table and a
 * non-admin role; on shutdown (SIGINT / SIGTERM) the table is dropped for
 * clean sample teardown.
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
 *   - `AWS_REGION` — AWS region for IAM token generation
 *
 * @module main
 */

import { handleRequest } from "./handlers.ts";
import { setupSchema, teardownSchema } from "./schema.ts";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(Deno.env.get("PORT") ?? "8000", 10);
const ENDPOINT = Deno.env.get("CLUSTER_ENDPOINT");
const USER = Deno.env.get("CLUSTER_USER");

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
  console.log("Shutting down — cleaning up resources...");
  try {
    await teardownSchema({ endpoint: ENDPOINT!, user: USER!, isAdmin: true });
  } catch (error) {
    console.error("Teardown error:", error);
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

Deno.serve({ port: PORT }, (req) =>
  handleRequest(req, { endpoint: ENDPOINT!, user: USER! }),
);
