import { DsqlSigner } from "@aws-sdk/dsql-signer";
import postgres from "postgres"

import assert from "node:assert";

const ADMIN = "admin";
const PUBLIC = "public";
const NON_ADMIN_SCHEMA = "myschema";

async function getConnection(clusterEndpoint, user, region) {
  
  let client = postgres({
    host: clusterEndpoint,
    user: user,
    // We can pass a function to password instead of a value, which will be triggered whenever
    // connections are opened.
    password: async () => await getPasswordToken(clusterEndpoint, user, region),
    database: "postgres",
    port: 5432,
    idle_timeout: 2,
    ssl: {
      rejectUnauthorized: true,
    }
    // max: 1, // Optionally set maximum connection pool size
  })

  return client;
}

async function getPasswordToken(clusterEndpoint, user, region) {
  const signer = new DsqlSigner({
    hostname: clusterEndpoint,
    region,
  });
  if (user === ADMIN) {
    return await signer.getDbConnectAdminAuthToken();
  }
  else {
    signer.user = user;
    return await signer.getDbConnectAuthToken()
  }
}

async function example() {
  let client;

  const clusterEndpoint = process.env.CLUSTER_ENDPOINT;
  assert(clusterEndpoint);
  const user = process.env.CLUSTER_USER;
  assert(user);
  const region = process.env.REGION;
  assert(region);
  
  try {
    
    client = await getConnection(clusterEndpoint, user, region)
    let schema = user === ADMIN ? PUBLIC : NON_ADMIN_SCHEMA;

    // Note that due to connection pooling, we cannot execute 'set search_path=myschema'
    // because we cannot assume the same connection will be used.
    await client`CREATE TABLE IF NOT EXISTS ${client(schema)}.owner (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(30) NOT NULL,
      city VARCHAR(80) NOT NULL,
      telephone VARCHAR(20)
    )`;

    // Insert some data
    await client`INSERT INTO ${client(schema)}.owner(name, city, telephone) VALUES('John Doe', 'Anytown', '555-555-0150')`

    // Check that data is inserted by reading it back
    const result = await client`SELECT id, city FROM ${client(schema)}.owner where name='John Doe'`;
    assert.deepEqual(result[0].city, "Anytown")
    assert.notEqual(result[0].id, null)

    // Delete data we just inserted
    await client`DELETE FROM ${client(schema)}.owner where name='John Doe'`

  } catch (error) {
    console.error(error);
    throw error;
  } finally {  
    await client?.end();
  }
}

export { example }
