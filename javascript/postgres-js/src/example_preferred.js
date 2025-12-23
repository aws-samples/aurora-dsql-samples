/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert";
import { auroraDSQLPostgres } from "@aws/aurora-dsql-postgresjs-connector";

const NUM_CONCURRENT_QUERIES = 8;

function createPooledConnection(clusterEndpoint, user) {
  return auroraDSQLPostgres({
    host: clusterEndpoint,
    user: user,
    max: 10, // Connection pool size
    idle_timeout: 30, // Idle connection timeout in seconds
    connect_timeout: 10, // Connection timeout in seconds
  });
}

async function worker(sql, workerId) {
  const result = await sql`SELECT ${workerId}::int as worker_id`;
  console.log(`Worker ${workerId} result: ${result[0].worker_id}`);
  assert.strictEqual(result[0].worker_id, workerId);
}

async function example() {
  const clusterEndpoint = process.env.CLUSTER_ENDPOINT;
  assert(clusterEndpoint, "CLUSTER_ENDPOINT environment variable is not set");
  const user = process.env.CLUSTER_USER;
  assert(user, "CLUSTER_USER environment variable is not set");

  const sql = createPooledConnection(clusterEndpoint, user);

  try {
    // Run concurrent queries using the connection pool
    const workers = [];
    for (let i = 1; i <= NUM_CONCURRENT_QUERIES; i++) {
      workers.push(worker(sql, i));
    }

    // Wait for all workers to complete
    await Promise.all(workers);

    console.log("Connection pool with concurrent connections exercised successfully");
  } catch (error) {
    console.error(error);
    throw error;
  } finally {
    await sql.end();
  }
}

export { example };
