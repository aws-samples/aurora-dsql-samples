# Improving Planning - Xanadu Re:Invent PostgresJS Driver HowTos Launch (DRAFT)

## Table of Contents

1. Prerequisites
   1. Create Cluster
   2. Driver Dependencies
   3. Install Driver

2. Execute Examples
   1. SQL CRUD Examples
      1. Create
      2. Read
      3. Update
      4. Delete
   2. Transaction with retries example
   3. Client Connection Pool example
   4. Primary key generation example
3. Token Session Management

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

### Install DSQL Connection

- All the required dependencies are present in the `package.json` file. To get all the required dependencies, the following command


```bash
npm install
```

## SQL CRUD Examples

### 1. Connect to the DSQL

```javascript
const hostname = "iyabtsicv4n64az4jwlngi2sgm.c0001.us-east-1.prod.sql.axdb.aws.dev";
// If you use a custom database role, change the action to DbConnect
const action = "DbConnectSuperuser";
const region = "us-east-1";
const expiresIn = 3600;
let token;
try {
  token = await generateToken(hostname, action, region, expiresIn);
  console.log("Token generated succesfully!");
} catch (error) {
  console.error("Error generating token: ", error);
  process.exit(1)
}

const sql = postgres({
  host: hostname,
  user: "axdb_superuser",
  password: token,
  database: "postgres",
  port: 5432,
  ssl: "require",
});
```

### 2. Create Owner Table

Note that DSL does not support SERIAL so id is based on uuid see (suggest best practice guide on this)

```javascript
await sql`CREATE TABLE IF NOT EXISTS owner (
      id UUID PRIMARY KEY,
      name VARCHAR(30) NOT NULL,
      city VARCHAR(80) NOT NULL,
      telephone VARCHAR(20)
    )`;
```

### 3. Insert Into Owner

``` javascript 
const owners = [{
  id: uuidv4(),
  name: "John Doe",
  city: "Las Vegas",
  telephone: "555-555-555"
}];

await sql`INSERT INTO owner ${ sql(owners) }`
```

### 4. Read Owner

``` javascript
const result = await sql`SELECT name, city, telephone FROM owner`;
console.log(result);
```

### 5. Update Owner

``` javascript
await sql`UPDATE owner SET telephone = '888-888-8888' WHERE name = 'John Doe'`;
const result = await sql`SELECT name, city, telephone FROM owner`;
console.log(result);
```

### 6. Delete Owner

``` javascript
await sql`DELETE FROM owner WHERE name = 'John Doe'`;
const result = await sql`SELECT name, city, telephone FROM owner`;
console.log(result);
```

### 7. Terminate Connection
``` javascript
await sql.end();
```
