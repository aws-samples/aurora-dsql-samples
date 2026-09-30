/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert";
import { AuroraDSQLPool } from "@aws/aurora-dsql-node-postgres-connector";

const NUM_CONCURRENT_QUERIES = 8;

function createPool(clusterEndpoint, user) {
  return new AuroraDSQLPool({
    host: clusterEndpoint,
    user: user,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    retry: { maxRetries: 5 },
  });
}

async function worker(pool, workerId) {
  const result = await pool.query("SELECT $1::int as worker_id", [workerId]);
  console.log(`Worker ${workerId} result: ${result.rows[0].worker_id}`);
  assert.strictEqual(result.rows[0].worker_id, workerId);
}

async function example() {
  const clusterEndpoint = process.env.CLUSTER_ENDPOINT;
  assert(clusterEndpoint, "CLUSTER_ENDPOINT environment variable is not set");
  const user = process.env.CLUSTER_USER;
  assert(user, "CLUSTER_USER environment variable is not set");

  const pool = createPool(clusterEndpoint, user);

  try {
    // Run concurrent queries using the connection pool
    const workers = [];
    for (let i = 1; i <= NUM_CONCURRENT_QUERIES; i++) {
      workers.push(worker(pool, i));
    }

    // Wait for all workers to complete
    await Promise.all(workers);

    console.log("Connection pool with concurrent connections exercised successfully");

    // Create table
    await pool.query(`CREATE TABLE IF NOT EXISTS owner (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(30) NOT NULL,
      city VARCHAR(80) NOT NULL,
      telephone VARCHAR(20)
    )`);

    // Transactional write with OCC retry
    await pool.transaction(async (client) => {
      await client.query(
        "INSERT INTO owner(name, city, telephone) VALUES($1, $2, $3)",
        ["John Doe", "Anytown", "555-555-1900"],
      );
    });

    // Verify the write
    const result = await pool.query("SELECT name, city FROM owner WHERE name = $1", ["John Doe"]);
    assert.strictEqual(result.rows[0].name, "John Doe");
    assert.strictEqual(result.rows[0].city, "Anytown");
    console.log(`Inserted: name=${result.rows[0].name}, city=${result.rows[0].city}`);

    // Clean up
    await pool.query("DELETE FROM owner WHERE name = $1", ["John Doe"]);

    console.log("Transactional write with OCC retry exercised successfully");
  } catch (error) {
    console.error(error);
    throw error;
  } finally {
    await pool.end();
  }
}

export { example };
