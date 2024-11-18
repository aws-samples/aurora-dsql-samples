# Postgres-js with Aurora DSQL

## Table of Contents

1. Prerequisites

2. Example using Postgres-js with Aurora DSQL

## Prerequisites

### Create Cluster

* You must have already provisioned a Aurora DSQL cluster following the [user guide](TBD)

### Driver Dependencies

Before using the PostgreSQL driver, ensure you have the following prerequisites installed:
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

### Example using Postgres-js with Aurora DSQL

```javascript
import { DsqlSigner } from "@aws-sdk/dsql-signer";
import postgres from "postgres"

import assert from "node:assert";

let client;
try {
  // Please replace with your own cluster endpoint
  const clusterEndpoint = "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws"
  // Generate a password token
  // The token expiration time is optional, and the default value 900 seconds
  // If you are not using admin user, use `DbConnect` action instead.
  const signer = new DsqlSigner({
    hostname: clusterEndpoint,
    region,
  });
  const token = await signer.getDbConnectAdminAuthToken();

  // Setup connection
  client = postgres({
      host: clusterEndpoint,
      user: "admin",
      password: token,
      database: "postgres",
      port: 5432,
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
  await client`INSERT INTO owner(name, city, telephone) VALUES('John Doe', 'Anytown', '555-555-1900')`

  // Check that data is inserted by reading it back
  const result = await client`SELECT id, city FROM owner where name='John Doe'`;
  assert.deepEqual(result[0].city, "Anytown")
  assert.notEqual(result[0].id, null)

} catch (error) {
  console.error(error);
  raise
} finally {  
  client?.end();
}
```

[!Important]
>
> Prepared statements do not work with postgres-js during preview. This is because,
> Aurora DSQL does not support Flush postgres message. Postgres-js uses Flush
> while executing a prepared statement.
