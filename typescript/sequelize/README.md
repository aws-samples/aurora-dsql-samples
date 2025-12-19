# Aurora DSQL with Sequelize

## Overview

This code example demonstrates how to use Sequelize with Amazon Aurora DSQL. The example shows you how to
connect to an Aurora DSQL cluster with Sequelize using node-postgres, create entities, and read and write to those entity tables.

Aurora DSQL is a distributed SQL database service that provides high availability and scalability for
your PostgreSQL-compatible applications. Sequelize is a popular object-relational mapping framework for TypeScript that allows
you to persist TypeScript objects to a database while abstracting the database interactions.

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
* [TypeScript](https://www.typescriptlang.org/): Ensure you have TypeScript 5.6+ installed

```bash
npx tsc --version
```
It should output something similar to `Version 5.6.x` or higher.

* You must have an Aurora DSQL cluster. For information about creating an Aurora DSQL cluster, see the
  [Getting started with Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html)
  guide.
* If connecting as a non-admin user, ensure the user is linked to an IAM role and is granted access to the `myschema`
  schema. See the
  [Using database roles with IAM roles](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/using-database-and-iam-roles.html)
  guide.

### Run the code

The example demonstrates the following operations:

- Opening a connection pool to an Aurora DSQL cluster using Sequelize
- Creating several Sequelize models
- Creating and querying objects that are persisted in DSQL

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
```

Run the example:

```bash
npm install
npm run build
npm run start
```

The example contains comments explaining the code and the operations being performed.

## Sequelize Pet Clinic with DSQL

### Connect to an Aurora DSQL cluster

The example uses the `AuroraDSQLClient` from the [Aurora DSQL Connector for node-postgres](https://github.com/awslabs/aurora-dsql-nodejs-connector/blob/main/packages/node-postgres/README.md), which automatically handles IAM token generation for each connection. The `dialectModule` option allows us to inject a custom `pg` module with the DSQL-aware client. When using Sequelize with the Postgres dialect option, Sequelize uses [node-postgres](https://node-postgres.com/) to connect.

It also uses a hook after connecting to set the search path to the correct schema if we are using the non-admin user. 

> **Note**
>
> In the dialect options you must set `clientMinMessages` to ignore, or an error will occur.

#### Connection pooling

In Sequelize, [connection pooling](https://sequelize.org/docs/v6/other-topics/connection-pool/) can be used by specifying
a connection pool configuration in the constructor, as seen in the `pool` parameter. In the example, a new token is created
for each connection opened in the connection pool. Note that DSQL connections will automatically close after one hour. The 
connection pool will open new connections as needed.

#### Using UUID as primary key

DSQL does not support serialized primary keys or identity columns (auto-incrementing integers) that are commonly used in traditional relational databases. Instead, it is recommended to use UUID (Universally Unique Identifier) as the primary key for your entities.

Here's how to define a UUID primary key in your entity class:
```ts
id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
```

#### Sequelize.sync() does not work

Attempting to create or modify tables using `Sequelize.sync()` will result in an error. This can be worked around by creating tables in advance separately using the `QueryInterface`. The `QueryInterface.createTable()` function allows table creation, and `QueryInterface.query()` allows arbitrary SQL statements to be executed, including schema modification or index creation. Note that if you create tables directly using the Query Interface, you still need to initialize the model. This initializes the model in memory for Sequelize execution, whereas the Query Interface interacts with the database.

#### Relationships

When creating relationships between models, note that `constraints` must be set to `false`:

```ts
Pet.belongsTo(Owner, { foreignKey: 'ownerId', constraints: false });
```

## Additional resources

* [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
* [Sequelize Documentation](https://sequelize.org/docs/v6/)
* [AWS SDK for JavaScript Documentation](https://docs.aws.amazon.com/sdk-for-javascript/)
---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 

SPDX-License-Identifier: MIT-0
