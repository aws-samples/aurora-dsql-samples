# Using AWS Lambda with Amazon Aurora DSQL

This document describes how to use Lambda with Aurora DSQL.

- Authorization to create Lambda functions. For more information, see [Getting started with Lambda](https://docs.aws.amazon.com/lambda/latest/dg/getting-started.html).
- Authorization to create or modify IAM policy created by Lambda. You need to permissions `iam:CreatePolicy` and `iam:AttachRolePolicy`. For more information, see [Actions, resources, and condition keys for IAM ](https://docs.aws.amazon.com/service-authorization/latest/reference/list_awsidentityandaccessmanagementiam.html).
- You must have installed npm `v8.5.3` or higher.
- You must have installed zip `v3.0` or higher.

## ⚠️ Important

- Running this code might result in charges to your AWS account.
- We recommend that you grant your code least privilege. At most, grant only the
  minimum permissions required to perform the task. For more information, see
  [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege).
- This code is not tested in every AWS Region. For more information, see
  [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services).

# Create a new function in AWS Lambda

1. Sign in to the AWS Management Console and open the AWS Lambda console at [https://console.aws.amazon.com/lambda/](https://console.aws.amazon.com/lambda/)
2. Choose **Create function**.
3. Provide a name, such as `dsql-sample`.
4. Don't edit the default settings to make sure that Lambda creates a new role with basic Lambda permissions.
5. Choose **Create function**.

# Authorize your Lambda execution role to connect to your cluster

1. In your Lambda function, choose **Configuration > Permissions**.
2. Choose the **role name** to open the execution role in the IAM console.
3. Choose Add **Permissions > Create** inline policy, and use the JSON editor.
4. In _Action_ paste in the following action to authorize your IAM identity to connect using the admin database role.

```
"Action": ["dsql:DbConnectAdmin"],
```

[!NOTE]
We're using an admin role to minimize prerequisite steps to get started. You shouldn't use an admin database role for your production applications. See [Using database roles with IAM roles](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/using-database-and-iam-roles.html) to learn how to create custom database roles with authorization that has the fewest permissions to your database.

5. In **Resource**, add your cluster’s Amazon Resource Name (ARN). You can also use a wildcard.

```
"Resource": ["*"]
```

6. Choose **Next**.
7. Enter a name for the policy, such as `dsql-sample-dbconnect`.
8. Choose **Create policy**.

# Create a package to upload to Lambda

1. The source in this package contains the sample source for this lambda.
2. In the folder, create a new file named `package.json` with the following content.

```json
{
    "dependencies": {
    "@aws-sdk/dsql-signer": "^3.705.0",
    "assert": "2.1.0",
    "pg": "^8.13.1"
  }
}
```

3. The folder also contains the following file `index.mjs` in this directory with the following content

```javascript
import { DsqlSigner } from "@aws-sdk/dsql-signer";
import pg from "pg";
import assert from "node:assert";
const { Client } = pg;

async function dsql_sample(clusterEndpoint, region) {
  let client;
  try {
    // The token expiration time is optional, and the default value 900 seconds
    const signer = new DsqlSigner({
      hostname: clusterEndpoint,
      region,
    });
    const token = await signer.getDbConnectAdminAuthToken();
    // <https://node-postgres.com/apis/client>
    // By default `rejectUnauthorized` is true in TLS options
    // <https://nodejs.org/api/tls.html#tls_tls_connect_options_callback>
    // The config does not offer any specific parameter to set sslmode to verify-full
    // Settings are controlled either via connection string or by setting
    // rejectUnauthorized to false in ssl options
    client = new Client({
      host: clusterEndpoint,
      user: "admin",
      password: token,
      database: "postgres",
      port: 5432,
      // <https://node-postgres.com/announcements> for version 8.0
      ssl: true,
      rejectUnauthorized: false,
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
    await client.query(
      "INSERT INTO owner(name, city, telephone) VALUES($1, $2, $3)",
      ["John Doe", "Anytown", "555-555-1900"],
    );

    // Check that data is inserted by reading it back
    const result = await client.query(
      "SELECT id, city FROM owner where name='John Doe'",
    );
    assert.deepEqual(result.rows[0].city, "Anytown");
    assert.notEqual(result.rows[0].id, null);

    await client.query("DELETE FROM owner where name='John Doe'");
  } catch (error) {
    console.error(error);
    throw new Error("Failed to connect to the database");
  } finally {
    client?.end();
  }
  Promise.resolve();
}

// https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html
export const handler = async (event) => {
  const endpoint = event.endpoint;
  const region = event.region;
  const responseCode = await dsql_sample(endpoint, region);

  const response = {
    statusCode: responseCode,
    endpoint: endpoint,
  };
  return response;
};
```

4. Use the following commands to create a package.

```bash
npm install
zip -r pkg.zip .
```

## Upload the code package and test your Lambda function

1. In your Lambda function’s **Code** tab, choose **Upload from > .zip file**.
2. Upload the pkg.zip you created. For more information, see [Deploy Node.js Lambda functions with .zip file archives](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-package.html).
3. In your Lambda function’s **Test** tab, paste in the following JSON payload, and modify it to use your cluster ID.
4. In your Lambda function’s **Test** tab, use the following Event JSON modified to specify your cluster’s endpoint.

```json
{ "endpoint": "replace_with_your_cluster_endpoint" }
```

5. Enter an Event name, such as `dsql-sample-test`. Choose **Save**.
6. Choose **Test**.
7. Choose **Details** to expand the execution response and log output.
8. If it succeeded, the Lambda function execution response should return a 200 status code:

```
{statusCode": 200, "endpoint": "your_cluster_endpoint"}
```

If the database returns an error or if the connection to the database fails, the Lambda function execution response returns a 500 status code.

```
{"statusCode": 500,"endpoint": "your_cluster_endpoint"}
```
