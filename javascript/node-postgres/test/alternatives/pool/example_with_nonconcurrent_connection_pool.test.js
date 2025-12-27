/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from "@jest/globals";
import { example } from "../../../src/alternatives/pool/example_with_nonconcurrent_connection_pool.js";

test("Example with nonconcurrent connection pool", async () => {
  await example();
});
