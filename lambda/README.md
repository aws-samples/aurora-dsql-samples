# Using AWS Lambda with Amazon Aurora DSQL

This document describes how to use AWS Lambda to access Aurora DSQL. In this sample, a CDK application is created with
a DSQL cluster, and a Lambda function that accesses the cluster to create a table, read and write values to that table, and then
finally delete the table. The sample code is using Node.js, but it could be created similarly in other languages as well.

## Pre-requisites

- Permissions to create DSQL clusters, AWS Lambdas, and IAM policies
- You must have installed npm `v8.5.3` or higher.
- You must have installed aws-cdk toolkit `v2.1018.0` or higher.
- You must have AWS credentials configured in your local environment.

## ⚠️ Important

- Running this code might result in charges to your AWS account.
- We recommend that you grant your code least privilege. At most, grant only the
  minimum permissions required to perform the task. For more information, see
  [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege).
- This code is not tested in every AWS Region. For more information, see
  [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services).

## How-to use Aurora DSQL with AWS Lambda

### Create a new DSQL cluster in CDK

A DSQL cluster can be added to a deployment stack using the CloudFormation DSQL resource. It is created with the
same parameters as a cluster would be created using the CLI or an SDK.

```javascript
const dsqlCluster = new aws_dsql.CfnCluster(this, 'DsqlCluster', {
  deletionProtectionEnabled: false,
  tags: [{
    key: 'Name', value: 'Lambda sample single region cluster',
  }, {
    key: 'Repo', value: 'aws-samples/aurora-dsql-samples',
  }],
});
```

### Create a Lambda function in CDK that accesses the DSQL cluster

The following shows a CDK configuration for a basic Lambda function that can interact with DSQL. It provides the
DSQL endpoint directly from the cluster creation in the previous step.

```javascript
const dsqlFunction = new Function(this, 'DsqlSample', {
  runtime: Runtime.NODEJS_22_X,
  handler: 'lambda.handler',
  code: Code.fromAsset('sample'),
  timeout: Duration.seconds(30),
  memorySize: 256,
  environment: {
    CLUSTER_ENDPOINT: `${dsqlCluster.attrIdentifier}.dsql.${region}.on.aws`,
    CLUSTER_REGION: region
  }
});
```

### Authorize your Lambda execution role to connect to your cluster

The Lambda function created in the previous step will need permissions to access DSQL, otherwise it will fail
to connect. The following shows a basic way to add DSQL permissions:

```javascript
dsqlFunction.addToRolePolicy(new PolicyStatement({
  effect: Effect.ALLOW,
  actions: ['dsql:DbConnectAdmin', 'dsql:DbConnect'],
  resources: [dsqlCluster.attrResourceArn]
}));
```

[!NOTE]
We're using an admin role to minimize prerequisite steps to get started. You shouldn't use an admin database role for your production applications. See [Using database roles with IAM roles](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/using-database-and-iam-roles.html) to learn how to create custom database roles with authorization that has the fewest permissions to your database.

### Create the code package that the Lambda function can run

The Lambda function specifies the `code: Code.from('sample')` property indicating where the Lambda's code is located.
The path specified, in this case `sample`, must contain all the code needed to run, including dependencies in node_modules.
Almost any Node.js code could be run here, but the key block is the Lambda handler, which is the invocation point for
Lambda executions:

```javascript
// https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html
export const handler = async (event) => {
    const endpoint = process.env.CLUSTER_ENDPOINT
    const region = process.env.CLUSTER_REGION
    const responseCode = await dsql_sample(endpoint, region);

    const response = {
        statusCode: responseCode,
        endpoint: endpoint,
    };
    return response;
};
```

From the handler you can write any database operations. This example uses Node-postgres to connect to DSQL using a
connection pool, create a table, insert data, and read back that data. It also includes timers to show that the
initial connection to DSQL from the Lambda will be the slowest, but future usages will be considerably faster. It uses
a connection pool that can be shared between Lambda invocations by preserving the pool in memory, which greatly reduces
connection time.

```javascript
import {DsqlSigner} from "@aws-sdk/dsql-signer";
import {Pool} from "pg";

let pool;

async function dsql_sample(clusterEndpoint, region) {
  await getOrCreatePool(clusterEndpoint, region)
  await createTable(pool);
  for (let i = 0; i < 10; i++) {
    await insertAndReadData(pool);
  }
  await dropTable(pool)
}

async function getOrCreatePool(endpoint, region) {
  if (pool === undefined) {
    console.log("Creating connection pool.")
    const signer = new DsqlSigner({
      hostname: endpoint,
      region,
    });
    // <https://node-postgres.com/apis/client>
    // By default `rejectUnauthorized` is true in TLS options
    // <https://nodejs.org/api/tls.html#tls_tls_connect_options_callback>
    // The config does not offer any specific parameter to set sslmode to verify-full
    // Settings are controlled either via connection string or by setting
    // rejectUnauthorized to false in ssl options
    pool = new Pool({
      host: endpoint,
      port: 5432,
      database: "postgres",
      user: "admin",
      password: async function () {
        return await signer.getDbConnectAdminAuthToken()
      },
      ssl: true,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
}

async function createTable(pool) {
  let client;
  try {
    client = await getClientFromPool(pool);
    // Create a new table
    let start = Date.now();
    await client.query(`CREATE TABLE IF NOT EXISTS sample (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              val INTEGER NOT NULL
            )`);
    console.log(`Created table Sample - Time elapsed: ${Date.now() - start} ms`);
  } finally {
    if (client !== undefined) client.release();
  }
}

async function dropTable(pool) {
  let client;
  try {
    client = await getClientFromPool(pool);
    let start = Date.now();
    await client.query(`DROP TABLE IF EXISTS sample`);
    console.log(`Dropped table Sample - Time elapsed: ${Date.now() - start} ms`);
  } finally {
    if (client !== undefined) client.release();
  }
}

async function insertAndReadData(pool) {
  let client;
  try {
    let val = Math.floor(Math.random() * 1000000);
    client = await getClientFromPool(pool);
    let start = Date.now();
    await client.query("INSERT INTO sample(val) VALUES($1)", [val]);
    console.log(`Inserted data to Sample - Time elapsed: ${Date.now() - start} ms`);

    // Check that data is inserted by reading it back
    start = Date.now();
    const result = await client.query("SELECT id, val FROM sample WHERE val = $1", [val]);
    console.log(`Retrieved row: ID=${result.rows[0].id}, Val=${result.rows[0].val}`);
    console.log(`Retrieved row from Sample - Time elapsed: ${Date.now() - start} ms`);
  } finally {
    if (client !== undefined) client.release();
  }
}

async function getClientFromPool(pool) {
  let start = Date.now();
  const client = await pool.connect();
  console.log(`Retrieved DSQL connection - Time elapsed: ${Date.now() - start} ms`);
  return client;
}

// https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html
export const handler = async (event) => {
  const endpoint = process.env.CLUSTER_ENDPOINT
  const region = process.env.CLUSTER_REGION
  const responseCode = await dsql_sample(endpoint, region);

  const response = {
    statusCode: responseCode,
    endpoint: endpoint,
  };
  return response;
};

```

## Running the example

From the root directory of the Lambda example (`aurora-dsql-samples/lambda`) the CDK can be deployed as follows:

1. Install dependencies for the project:
```sh
npm install && npm --prefix ./sample install
```

2. Bootstrap the CDK deployment:
```sh
cdk bootstrap
```
3. Provide environment variables for deployment:
```sh
export REGION=us-east-1 # Or any other DSQL supported region
```
4. Deploy the CDK configuration:
```sh
cdk deploy
```

From the AWS console you should now be able to visit the Lambda console and see your function. If you test
this function you should hopefully see the following as a result:
```
{statusCode": 200, "endpoint": "your_cluster_endpoint"}
```

If the database returns an error or if the connection to the database fails, the Lambda function execution response returns the error that occurred.

## Additional resources

* [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
* [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/v2/guide/)
* [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
* [node-postgres Documentation](https://node-postgres.com/)

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
