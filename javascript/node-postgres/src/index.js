import { DsqlSigner } from "@aws-sdk/dsql-signer";
import pg from "pg";
import assert from "node:assert";
const { Client } = pg;

const ADMIN = "admin";
const NON_ADMIN_SCHEMA = "myschema";

async function getConnection(clusterEndpoint, user, region) {
      const signer = new DsqlSigner({
        hostname: clusterEndpoint,
        region,
      });
      let token;
      // Generate a fresh password token for each connection, to ensure the token is
      // not expired when the connection is established
      if (user === ADMIN) {
        token = await signer.getDbConnectAdminAuthToken();
      }
      else {
        signer.user = user;
        token = await signer.getDbConnectAuthToken()
      }
      let client = new Client({
        host: clusterEndpoint,
        user: user,
        password: token,
        database: "postgres",
        port: 5432,
        ssl: {
          rejectUnauthorized: true,
        }
      });
  
      // Connect
      await client.connect();
      console.log("Successfully opened connection");
      return client;
}

async function example() {

  const clusterEndpoint = process.env.CLUSTER_ENDPOINT;
  assert(clusterEndpoint);
  const user = process.env.CLUSTER_USER;
  assert(user);
  const region = process.env.REGION;
  assert(region);

  let client;
  try {
    client = await getConnection(clusterEndpoint, user, region);

    if (user !== ADMIN) {
      await client.query("SET search_path=" + NON_ADMIN_SCHEMA)
    }

    // Create a new table
    await client.query(`CREATE TABLE IF NOT EXISTS owner (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(30) NOT NULL,
      city VARCHAR(80) NOT NULL,
      telephone VARCHAR(20)
    )`);

    // Insert some data
    await client.query("INSERT INTO owner(name, city, telephone) VALUES($1, $2, $3)", 
      ["John Doe", "Anytown", "555-555-1900"]
    );

    // Check that data is inserted by reading it back
    const result = await client.query("SELECT id, city FROM owner where name='John Doe'");
    assert.deepEqual(result.rows[0].city, "Anytown")
    assert.notEqual(result.rows[0].id, null)

    await client.query("DELETE FROM owner where name='John Doe'");

  } catch (error) {
    console.error(error);
    raise
  } finally {
    client?.end()
  }
  Promise.resolve()
}

export { example }
