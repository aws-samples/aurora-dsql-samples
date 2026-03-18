// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const { main } = require("../src/main");

test("Batch operations demo runs successfully", async () => {
  await main();
}, 120000);
