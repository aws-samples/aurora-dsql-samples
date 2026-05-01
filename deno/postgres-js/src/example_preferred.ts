/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Aurora DSQL with postgres.js (via @aws/aurora-dsql-postgresjs-connector) — Preferred Example
 *
 * Demonstrates how to connect to an Aurora DSQL cluster from Deno using the
 * Aurora DSQL Connector for Postgres.js, which wraps `postgres` with
 * automatic IAM token generation and refresh. The connector ships as an npm
 * package and works unchanged from Deno via the `npm:` specifier.
 *
 * Deno runs TypeScript natively — no build step, no node_modules, no
 * package.json. Just `deno task start`.
 *
 * Prerequisites:
 *   - Deno 2.x installed
 *   - AWS credentials configured (default credential chain)
 *   - An active Aurora DSQL cluster
 *
 * Environment variables:
 *   CLUSTER_ENDPOINT - Aurora DSQL cluster endpoint
 *                      (e.g., "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws")
 *   CLUSTER_USER     - Database user (e.g., "admin")
 *   AWS_REGION       - Optional, auto-detected from the endpoint
 *
 * Usage:
 *   export CLUSTER_ENDPOINT="<your endpoint>"
 *   export CLUSTER_USER="admin"
 *   deno task start
 */

import { auroraDSQLPostgres } from "@aws/aurora-dsql-postgresjs-connector";

const NUM_CONCURRENT_QUERIES = 8;

/**
 * Creates a pooled postgres.js client backed by the DSQL connector.
 *
 * The connector handles:
 *   - IAM token generation (admin vs regular based on username)
 *   - Token refresh inside the pool
 *   - SSL/TLS (required by DSQL) with sensible defaults
 *   - Region auto-discovery from the hostname
 *
 * All standard postgres.js pool options pass through.
 */
function createPooledConnection(clusterEndpoint: string, user: string) {
  return auroraDSQLPostgres({
    host: clusterEndpoint,
    user,
    max: 10, // Connection pool size
    idle_timeout: 30, // Idle connection timeout in seconds
    connect_timeout: 10, // Connection timeout in seconds
  });
}

/**
 * Runs a single worker query to verify the connection pool works.
 * Each worker executes a simple SELECT and asserts the result.
 */
async function worker(
  sql: ReturnType<typeof createPooledConnection>,
  workerId: number,
): Promise<void> {
  const rows = await sql<[{ worker_id: number }]>`
    SELECT ${workerId}::int as worker_id
  `;
  console.log(`Worker ${workerId} result: ${rows[0].worker_id}`);

  if (rows[0].worker_id !== workerId) {
    throw new Error(
      `Worker ${workerId}: expected ${workerId}, got ${rows[0].worker_id}`,
    );
  }
}

/**
 * Main example function.
 *
 * Connects to Aurora DSQL via the connector's pooled client, runs concurrent
 * queries to verify connectivity, and cleans up. This mirrors the same
 * pattern as the Node.js postgres-js example in this repository.
 */
async function example(): Promise<void> {
  const clusterEndpoint = Deno.env.get("CLUSTER_ENDPOINT");
  if (!clusterEndpoint) {
    console.error("CLUSTER_ENDPOINT environment variable is not set");
    Deno.exit(1);
  }

  const user = Deno.env.get("CLUSTER_USER");
  if (!user) {
    console.error("CLUSTER_USER environment variable is not set");
    Deno.exit(1);
  }

  const sql = createPooledConnection(clusterEndpoint, user);

  try {
    // Fire N concurrent queries through the shared pool.
    const workers: Promise<void>[] = [];
    for (let i = 1; i <= NUM_CONCURRENT_QUERIES; i++) {
      workers.push(worker(sql, i));
    }

    await Promise.all(workers);

    console.log(
      "Connection pool with concurrent connections exercised successfully",
    );
  } catch (error) {
    console.error(error);
    throw error;
  } finally {
    await sql.end();
  }
}

export { example };

// Run the example when executed directly (not when imported by tests)
if (import.meta.main) {
  example();
}
