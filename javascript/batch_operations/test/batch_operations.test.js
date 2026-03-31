// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require("path");
const { execSync } = require("child_process");

const SETUP_SQL_PATH = path.join(__dirname, "..", "batch_test_setup.sql");

function extractRegion(endpoint) {
  const m = endpoint.match(/\.dsql\.([^.]+)\.on\.aws/);
  if (!m) throw new Error(`Cannot extract region from endpoint: ${endpoint}`);
  return m[1];
}

function seedDatabase() {
  const endpoint = process.env.CLUSTER_ENDPOINT;
  if (!endpoint) throw new Error("CLUSTER_ENDPOINT environment variable is required");
  const user = process.env.CLUSTER_USER || "admin";
  const region = extractRegion(endpoint);

  const token = execSync(
    `aws dsql generate-db-connect-admin-auth-token --hostname ${endpoint} --region ${region} --expires-in 3600`,
    { encoding: "utf8" }
  ).trim();

  execSync(
    `psql "host=${endpoint} dbname=postgres user=${user} sslmode=verify-full sslrootcert=system connect_timeout=10" -f ${SETUP_SQL_PATH}`,
    { env: { ...process.env, PGPASSWORD: token }, stdio: "inherit" }
  );
}

beforeAll(() => {
  seedDatabase();
}, 120000);

test("Batch operations demo runs successfully", async () => {
  // Set process.argv so main()'s parseArgs picks up the endpoint
  const endpoint = process.env.CLUSTER_ENDPOINT;
  const user = process.env.CLUSTER_USER || "admin";
  process.argv = ["node", "main.js", "--endpoint", endpoint, "--user", user];

  const { main } = require("../src/main");
  await main();
}, 120000);
