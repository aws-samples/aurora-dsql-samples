/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { example } from "../../../src/alternatives/no_connection_pool/example_with_no_connection_pool.js";

test("Example with no connection pool", async () => {
  await example();
}, 20000);
