/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert";
import { auroraDSQLPostgres } from "@aws/aurora-dsql-postgresjs-connector";

const ADMIN = "admin";
const PUBLIC = "public";
const NON_ADMIN_SCHEMA = "myschema";

function getConnection(clusterEndpoint, user) {
  return auroraDSQLPostgres({
    host: clusterEndpoint,
    user: user,
    // Other DSQL options:
    // region: 'us-east-1',
    // profile: awsProfile,
    // tokenDurationSecs: 30,
    // customCredentialsProvider: credentialsProvider,
    //
    // Other Postgres.js settings are also valid here, see Postgres.js documentation for more information
    // https://github.com/porsager/postgres#all-postgres-options
  });
}

async function example() {
  const clusterEndpoint = process.env.CLUSTER_ENDPOINT;
  assert(clusterEndpoint, "CLUSTER_ENDPOINT environment variable is not set");
  const user = process.env.CLUSTER_USER;
  assert(user, "CLUSTER_USER environment variable is not set");

  let client;
  try {
    client = getConnection(clusterEndpoint, user);
    const schema = user === ADMIN ? PUBLIC : NON_ADMIN_SCHEMA;

    // Note that due to connection pooling, we cannot execute 'set search_path=myschema'
    // because we cannot assume the same connection will be used.
    await client`CREATE TABLE IF NOT EXISTS ${client(schema)}.owner
                 (
                     id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                     name      VARCHAR(30) NOT NULL,
                     city      VARCHAR(80) NOT NULL,
                     telephone VARCHAR(20)
                 )`;

    // Insert some data
    await client`INSERT INTO ${client(schema)}.owner(name, city, telephone)
                 VALUES ('John Doe', 'Anytown', '555-555-0150')`;

    // Check that data is inserted by reading it back
    const result = await client`SELECT id, city
                                FROM ${client(schema)}.owner
                                where name = 'John Doe'`;
    assert.deepEqual(result[0].city, "Anytown");
    assert.notEqual(result[0].id, null);

    // Delete data we just inserted
    await client`DELETE
                 FROM ${client(schema)}.owner
                 where name = 'John Doe'`;

    console.log("Completed successfully");
  } catch (error) {
    console.error(error);
    throw error;
  } finally {
    await client?.end();
  }
}

export { example };
