// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

/**
 * Main entry point for Aurora DSQL batch operations demo (Node.js).
 *
 * Usage:
 *   node main.js --endpoint <cluster-endpoint> [--user admin] \
 *                [--batch-size 1000] [--num-workers 4]
 */

const { AuroraDSQLPool } = require("@aws/aurora-dsql-node-postgres-connector");
const { batchDelete, parallelBatchDelete } = require("./batchDelete");
const { batchUpdate, parallelBatchUpdate } = require("./batchUpdate");

function parseArgs() {
  const args = process.argv.slice(2);
  const config = { endpoint: null, user: "admin", batchSize: 1000, numWorkers: 4 };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--endpoint": config.endpoint = args[++i]; break;
      case "--user": config.user = args[++i]; break;
      case "--batch-size": config.batchSize = parseInt(args[++i], 10); break;
      case "--num-workers": config.numWorkers = parseInt(args[++i], 10); break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }

  if (!config.endpoint) {
    console.error(
      "Usage: node main.js --endpoint <cluster-endpoint> " +
        "[--user admin] [--batch-size 1000] [--num-workers 4]"
    );
    process.exit(1);
  }
  return config;
}

function createPool(endpoint, user, numWorkers) {
  return new AuroraDSQLPool({
    host: endpoint,
    user: user,
    max: numWorkers,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
}

async function runOperation(label, fn) {
  console.log();
  console.log("=".repeat(60));
  console.log(`  ${label}`);
  console.log("=".repeat(60));
  const start = Date.now();
  const total = await fn();
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  console.log();
  console.log(`  Summary: ${total} rows affected in ${elapsed}s`);
  console.log("=".repeat(60));
  return total;
}

async function main() {
  const config = parseArgs();
  const pool = createPool(config.endpoint, config.user, config.numWorkers);
  const table = "batch_test";
  const { batchSize, numWorkers } = config;

  try {
    await runOperation("Sequential Batch DELETE (category = 'electronics')",
      () => batchDelete(pool, table, "category = 'electronics'", batchSize));

    await runOperation("Sequential Batch UPDATE (clothing -> processed)",
      () => batchUpdate(pool, table, "status = 'processed'",
        "category = 'clothing' AND status != 'processed'", batchSize));

    await runOperation(`Parallel Batch DELETE (category = 'food') [${numWorkers} workers]`,
      () => parallelBatchDelete(pool, table, "category = 'food'", numWorkers, batchSize));

    await runOperation(`Parallel Batch UPDATE (books -> archived) [${numWorkers} workers]`,
      () => parallelBatchUpdate(pool, table, "status = 'archived'",
        "category = 'books' AND status != 'archived'", numWorkers, batchSize));
  } finally {
    await pool.end();
    console.log("\nConnection pool closed. Demo complete.");
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err.message);
    process.exit(1);
  });
}

module.exports = { main };
