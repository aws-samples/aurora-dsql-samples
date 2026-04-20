// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

/**
 * Integration test: verifies multi-region failover behavior against live DSQL clusters.
 *
 * Prerequisites:
 *   - CLUSTER_ENDPOINT and CLUSTER_ENDPOINT_SECONDARY env vars set
 *   - Valid AWS credentials with DSQL access
 *   - Tables created via `npm run prisma:migrate-up`
 *
 * Usage:
 *   npm run test:failover
 */

import { MultiRegionDsqlClient } from "./dsql-client";

let dsql: MultiRegionDsqlClient;
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failed++;
    console.error(`  ✗ ${message}`);
  } else {
    passed++;
    console.log(`  ✓ ${message}`);
  }
}

async function main() {
  if (!process.env.CLUSTER_ENDPOINT_SECONDARY) {
    console.error("CLUSTER_ENDPOINT_SECONDARY is required to run failover tests");
    process.exit(1);
  }

  dsql = new MultiRegionDsqlClient();
  await dsql.connect();

  const info = dsql.getRegionInfo();
  console.log(`\nPrimary:   ${info.primaryEndpoint}`);
  console.log(`Secondary: ${info.secondaryEndpoint}\n`);

  // --- Test 1: Primary connectivity ---
  console.log("Test 1: Primary region serves queries");
  const client = await dsql.getClient();
  const ping = await client.$queryRaw<[{ result: number }]>`SELECT 1 AS result`;
  assert(ping[0]?.result === 1, "SELECT 1 returns expected result");

  // --- Test 2: Write via primary, read back ---
  console.log("\nTest 2: Write and read on primary");
  const tag = `failover-test-${Date.now()}`;
  const order = await client.order.create({
    data: { product: tag, quantity: 1, region: info.localRegion },
  });
  assert(!!order.id, `Order created: ${order.id}`);

  const fetched = await client.order.findUnique({ where: { id: order.id } });
  assert(fetched?.product === tag, "Order readable on primary");

  // --- Test 3: Failover switches to secondary ---
  console.log("\nTest 3: Failover to secondary region");
  const secondary = await dsql.failover();
  assert(secondary !== client, "Active client changed after failover");

  const secondaryPing = await secondary.$queryRaw<[{ result: number }]>`SELECT 1 AS result`;
  assert(secondaryPing[0]?.result === 1, "Secondary responds to queries");

  // --- Test 4: Data visible on secondary (DSQL multi-region replication) ---
  console.log("\nTest 4: Data replicated to secondary");
  // DSQL replication is near-instant but allow a brief window
  let replicated = false;
  for (let i = 0; i < 10; i++) {
    const found = await secondary.order.findUnique({ where: { id: order.id } });
    if (found?.product === tag) {
      replicated = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert(replicated, "Order replicated to secondary region");

  // --- Cleanup ---
  console.log("\nCleanup");
  await secondary.order.delete({ where: { id: order.id } }).catch(() => {});
  await dsql.dispose();

  // --- Summary ---
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test failed:", err);
  dsql?.dispose().catch(() => {});
  process.exit(1);
});
