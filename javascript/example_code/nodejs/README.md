# Improving Planning - Xanadu Re:Invent Node-Postgres Driver HowTos Launch (DRAFT)

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

Before using the Node-Postgres driver, ensure you have the following prerequisites installed:
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
const hostname = "h4abtsicxaovobxmhveyghyxqi.c0001.us-east-1.prod.sql.axdb.aws.dev";
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

const client = new Client({
  host: hostname,
  user: "axdb_superuser",
  password: token,
  database: "postgres",
  port: 5432,
  ssl: true,
});

await client.connect();
```

### 2. Create Owner Table

Note that DSL does not support SERIAL so id is based on uuid see (suggest best practice guide on this)

```javascript
await client.query(`CREATE TABLE IF NOT EXISTS owner (
      id UUID PRIMARY KEY,
      name VARCHAR(30) NOT NULL,
      city VARCHAR(80) NOT NULL,
      telephone VARCHAR(20)
    )`);
```

### 3. Create Owner

``` javascript 
await client.query("INSERT INTO owner(id, name, city, telephone) VALUES($1, $2, $3, $4)", [uuidv4(), "John Doe", "Las Vegas", "555-555-5555"]);
```

### 4. Read Owner

``` javascript
let result = await client.query("SELECT name, city, telephone FROM owner");
console.log(result.rows);
```

### 5. Update Owner

``` javascript
await client.query("UPDATE owner SET telephone = $1 WHERE name = $2", ["888-888-8888", "John Doe"]);
result = await client.query("SELECT name, city, telephone FROM owner");
console.log(result.rows);
```

### 6. Delete Owner

``` javascript
await client.query("DELETE FROM owner WHERE name = $1", ["John Doe"]);
console.log(result.rows);
```

### 7. Terminate Connection
``` javascript
await client.end();
```

## Transaction with retries example

Add text to describe that Xanadu requires that in order to handle OC001 error issue the code logic needs to support a transaction retries (Recommend example should be example of the simple CRUD examples and extended to show transaction retries)

TODO Example of transaction retries - This section will be added later

## Client Connection Pool example

Sample code from c3p0 connection pool as a baseline example

## Primary key generation

We just need to advise the customer that Xanadu does not support SERIAL, NextVal() and IDENTITY


Long-running applications will therefore need a strategy to handle token expiration, as new tokens will have to be periodically generated. Possible strategies to handle token expiration include incorporating the token generator into the application such that new tokens are created as new connections are made, or by creating some additional Lambda process to refresh tokens by updating a password value in AWS Secrets Manager. The ideal strategy will depend on the customer use case.