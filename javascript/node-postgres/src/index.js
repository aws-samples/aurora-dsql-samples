import { AuroraDSQLClient } from "@aws/aurora-dsql-node-postgres-connector";
import assert from "node:assert";

const ADMIN = "admin";
const NON_ADMIN_SCHEMA = "myschema";

async function getConnection(clusterEndpoint, user) {
  const client = new AuroraDSQLClient({
    host: clusterEndpoint,
    user: user,
  });

  await client.connect();
  console.log("Successfully opened connection");
  return client;
}

async function example() {
  const clusterEndpoint = process.env.CLUSTER_ENDPOINT;
  assert(clusterEndpoint);
  const user = process.env.CLUSTER_USER;
  assert(user);

  let client;
  try {
    client = await getConnection(clusterEndpoint, user);

    if (user !== ADMIN) {
      await client.query("SET search_path=" + NON_ADMIN_SCHEMA);
    }

    // Create a new table
    await client.query(`CREATE TABLE IF NOT EXISTS owner (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(30) NOT NULL,
      city VARCHAR(80) NOT NULL,
      telephone VARCHAR(20)
    )`);

    // Insert some data
    await client.query(
      "INSERT INTO owner(name, city, telephone) VALUES($1, $2, $3)",
      ["John Doe", "Anytown", "555-555-1900"]
    );

    // Check that data is inserted by reading it back
    const result = await client.query(
      "SELECT id, city FROM owner where name='John Doe'"
    );
    assert.deepEqual(result.rows[0].city, "Anytown");
    assert.notEqual(result.rows[0].id, null);

    await client.query("DELETE FROM owner where name='John Doe'");
  } catch (error) {
    console.error(error);
    throw error;
  } finally {
    client?.end();
  }
}

export { example };
