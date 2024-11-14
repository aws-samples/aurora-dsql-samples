# Postgres-js with Aurora DSQL

## Table of Contents

1. Prerequisites

2. SQL CRUD Examples
   1. Create
   2. Read
   3. Update
   4. Delete

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

### Connect to the Aurora DSQL Cluster

Via Javascript

```javascript
import { generateToken } from "./token-gen.js";
import postgres from "postgres"

async function getClient(clusterEndpoint, region) {
    const action = "DbConnectAdmin";
    let token;
    try {
        // The token expiration time is optional, and the default value 900 seconds
        token = await generateToken(clusterEndpoint, action, region);
        const sql = postgres({
            host: clusterEndpoint,
            user: "admin",
            password: token,
            database: "postgres",
            port: 5432,
            ssl: "require",
          });
        return Promise.resolve(sql)
    } catch (error) {
        return Promise.reject(error);
    }
}

export { getClient }
```

## SQL CRUD Examples

### 1. Create Owner Table

Note that DSL does not support SERIAL so id is based on uuid see (suggest best practice guide on this)

```javascript
const createTables = async (client) => {
  return client`CREATE TABLE IF NOT EXISTS owner (
    id UUID PRIMARY KEY,
    name VARCHAR(30) NOT NULL,
    city VARCHAR(80) NOT NULL,
    telephone VARCHAR(20)
  )`;
}
```

### 2. Create Owner

```javascript
const createOwner = async (client) => {
  const owners = [{
    id: uuidv4(),
    name: "John Doe",
    city: "Las Vegas",
    telephone: "555-555-555"
  }];
  
  return client`INSERT INTO owner ${ client(owners) }`
}
```

### 3. Read Owner

```javascript
const readOwner = async (client) => {
  const result = await client`SELECT * FROM owner`;
  console.log(result);
  return Promise.resolve();
}
```

### 4. Update Owner

```javascript
const updateOwner = async (client) => {
  return client`UPDATE owner SET telephone = '888-888-8888' WHERE name = 'John Doe'`
}
```

### 5. Delete Owner

```javascript
const deleteOwner = async (client) => {
  return client`DELETE FROM owner WHERE name = 'John Doe'`
}
```

### 6. Terminate Connection

```javascript
await client.end();
```
