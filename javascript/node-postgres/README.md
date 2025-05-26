# Aurora DSQL with node-postgres

## Overview

This code example demonstrates how to use `node-postgres` with Amazon Aurora DSQL.
The example shows you how to connect to an Aurora DSQL cluster and perform basic database operations.

Aurora DSQL is a distributed SQL database service that provides high availability and scalability for
your PostgreSQL-compatible applications. `node-postgres` is a popular PostgreSQL adapter for Node.js that allows
you to interact with PostgreSQL databases using JavaScript code.

## About the code example

The example demonstrates a flexible connection approach that works for both admin and non-admin users:

* When connecting as an **admin user**, the example uses the `public` schema and generates an admin authentication
  token.
* When connecting as a **non-admin user**, the example uses a custom `myschema` schema and generates a standard
  authentication token.

The code automatically detects the user type and adjusts its behavior accordingly.

## ⚠️ Important

* Running this code might result in charges to your AWS account.
* We recommend that you grant your code least privilege. At most, grant only the
  minimum permissions required to perform the task. For more information, see
  [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege).
* This code is not tested in every AWS Region. For more information, see
  [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services).

## Run the example

### Prerequisites

* You must have an AWS account, and have your default credentials and AWS Region
  configured as described in the
  [Globally configuring AWS SDKs and tools](https://docs.aws.amazon.com/credref/latest/refdocs/creds-config-files.html)
  guide.
* Node.js: Ensure you have Node.js 18+ installed.

```bash
node --version
```

It should output something similar to `v18.x` or higher.

* You must have an Aurora DSQL cluster. For information about creating an Aurora DSQL cluster, see the
  [Getting started with Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html)
  guide.
* If connecting as a non-admin user, ensure the user is linked to an IAM role and is granted access to the `myschema`
  schema. See the
  [Using database roles with IAM roles](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/using-database-and-iam-roles.html)
  guide.

### Run the code

The example demonstrates the following operations:

- Opening a connection to an Aurora DSQL cluster
- Creating a table
- Inserting and querying data

The example is designed to work with both admin and non-admin users:

- When run as an admin user, it uses the `public` schema
- When run as a non-admin user, it uses the `myschema` schema

**Note:** running the example will use actual resources in your AWS account and may incur charges.

Set environment variables for your cluster details:

```bash
# e.g. "admin"
export CLUSTER_USER="<your user>"
  
# e.g. "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws"
export CLUSTER_ENDPOINT="<your endpoint>"

# e.g. "us-east-1"
export REGION="<your region>"
```

Run the example:

```bash
npm install
npm test
```

The example contains comments explaining the code and the operations being performed.

## Additional resources

* [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
* [node-postgres Documentation](https://node-postgres.com/)
* [AWS SDK for JavaScript Documentation](https://docs.aws.amazon.com/sdk-for-javascript/)

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0