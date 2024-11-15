# Node-js with Aurora DSQL

## Table of Contents

1. Prerequisites

2. Example using Node-js with Aurora DSQL

## Prerequisites

### Create Cluster

* You must have already provisioned a Aurora DSQL cluster following the [user guide](TBD)

### Driver Dependencies

Before using the Node-Postgres driver, ensure you have the following prerequisites installed:
Node: Ensure you have node v18+ installed.

Verify install

```bash
node --version
```

It should output something similar to `v18.x"`.

### Install Aurora DSQL Connection

- All the required dependencies are present in the `package.json` file. To get all the required dependencies, the following command

```bash
npm install
```

### Example using Node-js with Aurora DSQL

```javascript
import { v4 as uuidv4 } from 'uuid';
import { DsqlSigner } from "@aws-sdk/dsql-signer";
import pg from "pg";
import assert from "node:assert";
const { Client } = pg;

let client;
try {
  // The token expiration time is optional, and the default value 900 seconds
  // If you are not using admin user, use `DbConnect` action instead.
  const signer = new DsqlSigner({
    // Please replace with your own cluster endpoint
    hostname: 'foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws',
    action: "DbConnectAdmin",
    region,
  });
  const token = await signer.getAuthToken();
  const client = new Client({
    host: clusterEndpoint,
    user: "admin",
    password: token,
    database: "postgres",
    port: 5432,
    ssl: true
  });

  // Connect
  await client.connect();

  // Create a new table
  await client.query(`CREATE TABLE IF NOT EXISTS owner (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(30) NOT NULL,
    city VARCHAR(80) NOT NULL,
    telephone VARCHAR(20)
  )`);

  // Insert some data
  await client.query("INSERT INTO owner(name, city, telephone) VALUES($1, $2, $3)", 
    ["John Doe", "Anytown", "555-555-5555"]
  );

  // Check that data is inserted by reading it back
  const result = await client.query("SELECT id, city FROM owner where name='John Doe'");
  assert.deepEqual(result.rows[0].city, "Anytown")
  assert.notEqual(result.rows[0].id, null)

} catch (error) {
  console.error(error);
  raise
} finally {
  client?.end()
}
```