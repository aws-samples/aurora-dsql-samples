import { DsqlSigner } from "@aws-sdk/dsql-signer";
import postgres from "postgres"

import assert from "node:assert";

async function example() {
  let client;
  const clusterEndpoint = "qiabttni4hrjfjbfepfsklcvuq.dsql-gamma.us-east-1.on.aws";
  const region = "us-east-1";
  try {
    // Generate a password token
    // The token expiration time is optional, and the default value 900 seconds
    const signer = new DsqlSigner({
      hostname: clusterEndpoint,
      region,
    });
    const token = await signer.getDbConnectAdminAuthToken();

    // Setup connection
    // <https://github.com/porsager/postgres?tab=readme-ov-file#all-postgres-options>
    // By default `rejectUnauthorized` is true in TLS options
    // <https://nodejs.org/api/tls.html#tls_tls_connect_options_callback>
    // The config does not offer any specific parameter to set sslmode to verify-full
    // Settings are controlled either via connection string or by setting
    // rejectUnauthorized to false in ssl options
    client = postgres({
        host: clusterEndpoint,
        user: "admin",
        password: token,
        database: "postgres",
        port: 5432,
        // <https://node-postgres.com/announcements> for version 8.0
        ssl: true,
      });

    // Create a table
    await client`CREATE TABLE IF NOT EXISTS owner (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(30) NOT NULL,
      city VARCHAR(80) NOT NULL,
      telephone VARCHAR(20)
    )`;

    // Insert some data
    await client`INSERT INTO owner(name, city, telephone) VALUES('John Doe', 'Anytown', '555-555-0150')`

    // Check that data is inserted by reading it back
    const result = await client`SELECT id, city FROM owner where name='John Doe'`;
    assert.deepEqual(result[0].city, "Anytown")
    assert.notEqual(result[0].id, null)

    // Delete data we just inserted
    await client`DELETE FROM owner where name='John Doe'`

  } catch (error) {
    console.error(error);
    raise
  } finally {  
    client?.end();
  }
  Promise.resolve()
}

export { example }
