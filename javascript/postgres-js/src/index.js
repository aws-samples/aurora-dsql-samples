import { auroraDSQLPostgres } from "@aws/aurora-dsql-postgresjs-connector";
import assert from "node:assert";

const ADMIN = "admin";
const PUBLIC = "public";
const NON_ADMIN_SCHEMA = "myschema";

async function getConnection(clusterEndpoint, user) {
  const client = auroraDSQLPostgres({
    host: clusterEndpoint,
    user: user,
    idle_timeout: 2,
    // max: 1, // Optionally set maximum connection pool size
  });

  return client;
}

async function example() {
  let client;

  const clusterEndpoint = process.env.CLUSTER_ENDPOINT;
  assert(clusterEndpoint);
  const user = process.env.CLUSTER_USER;
  assert(user);

  try {
    client = await getConnection(clusterEndpoint, user);
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
    await client`INSERT INTO ${client(schema)}.owner(name, city, telephone) VALUES('John Doe', 'Anytown', '555-555-0150')`;

    // Check that data is inserted by reading it back
    const result =
      await client`SELECT id, city FROM ${client(schema)}.owner where name='John Doe'`;
    assert.deepEqual(result[0].city, "Anytown");
    assert.notEqual(result[0].id, null);

    // Delete data we just inserted
    await client`DELETE FROM ${client(schema)}.owner where name='John Doe'`;
  } catch (error) {
    console.error(error);
    throw error;
  } finally {
    await client?.end();
  }
}

export { example };
