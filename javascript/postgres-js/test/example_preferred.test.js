/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { example } from "../src/example_preferred.js";

test("Preferred example (connection pool concurrent)", async () => {
  await example();
}, 20000);
