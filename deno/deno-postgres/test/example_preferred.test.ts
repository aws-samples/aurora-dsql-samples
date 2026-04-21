/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * Integration test for the deno-postgres preferred example.
 *
 * Requires CLUSTER_ENDPOINT and CLUSTER_USER environment variables.
 * Skips if not set (no DSQL cluster available).
 */

import { example } from "../src/example_preferred.ts";

const skip = !Deno.env.get("CLUSTER_ENDPOINT") || !Deno.env.get("CLUSTER_USER");

Deno.test({
  name: "Preferred example (concurrent connections)",
  ignore: skip,
  async fn() {
    await example();
  },
});
