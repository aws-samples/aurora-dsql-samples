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

## Usage notes

### Connecting to DSQL

DSQL is PostgreSQL-compatible, so use the `postgres` dialect. The [Aurora DSQL Connector for node-postgres](https://github.com/awslabs/aurora-dsql-nodejs-connector/blob/main/packages/node-postgres/README.md) handles IAM token generation automatically. Inject it via the `dialectModule` option.

```ts
import { AuroraDSQLClient } from '@aws/aurora-dsql-node-postgres-connector';
import * as pg from 'pg';

const sequelize = new Sequelize({
  host: clusterEndpoint,
  username: user,
  dialect: 'postgres',
  dialectModule: { ...pg, Client: AuroraDSQLClient },
  // ...
});
```

For non-admin users, set the search path to their granted schema using an `afterConnect` hook. Non-admin users cannot be granted access to the `public` schema.

```ts
hooks: {
  afterConnect: async (connection) => {
    await connection.query('SET search_path TO myschema');
  }
}
```

### Connection configuration

Sequelize sets `client_min_messages` by default, which causes the error `setting configuration parameter "client_min_messages" not supported`. Disable this by setting `clientMinMessages: 'ignore'` in dialect options.

```ts
new Sequelize({
  // ...
  dialect: 'postgres',
  dialectOptions: {
    clientMinMessages: 'ignore',
  },
});
```

### Connection pooling

Connection pooling can be configured in the Sequelize constructor. The DSQL connector generates a new authentication token for each connection. DSQL connections close after one hour; the pool automatically opens new connections as needed.

```ts
new Sequelize({
  // ...
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
});
```

### Table creation

`Sequelize.sync()` and `Model.sync()` are not supported due to index introspection incompatibilities. Use `QueryInterface.createTable()` to create tables, then initialize models in memory with `Model.init()`.

```ts
// Instead of: await Model.sync();
const queryInterface = sequelize.getQueryInterface();
await queryInterface.createTable('owner', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  name: { type: DataTypes.STRING(30), allowNull: false },
});

// Then initialize the model in memory
Owner.init({ /* same attributes */ }, { sequelize, tableName: 'owner' });
```

### Primary keys

SERIAL and identity columns are not supported. Using `autoIncrement: true` results in a `type "serial" does not exist` error. Use UUID primary keys instead.

```ts
id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 }
```

### Relationships

When defining relationships, set `constraints: false`. Sequelize attempts to create foreign key constraints by default, which are not supported. ORM-level relationships are retained but are not enforced by the database.

```ts
Pet.belongsTo(Owner, { foreignKey: 'ownerId', constraints: false });
Owner.hasMany(Pet, { foreignKey: 'ownerId', constraints: false });
```

### Unsupported data types

**JSON/JSONB**: `DataTypes.JSON` and `DataTypes.JSONB` are not supported. Use `DataTypes.TEXT` in your table definition, with getter/setter in `Model.init()` for serialization. JSON query operators are not available with this approach.

```ts
metadata: {
  type: DataTypes.TEXT,
  get() {
    const val = this.getDataValue('metadata');
    return val ? JSON.parse(val) : null;
  },
  set(val: object) {
    this.setDataValue('metadata', JSON.stringify(val));
  }
}
```

**ENUM**: `DataTypes.ENUM` is not supported. Use `DataTypes.STRING` in your table definition, with validation in `Model.init()`. Validation is enforced at the application level, not the database.

```ts
status: {
  type: DataTypes.STRING,
  validate: { isIn: [['pending', 'active', 'completed']] }
}
```

### Unsupported methods

**findOrCreate**: `Model.findOrCreate()` internally uses PL/pgSQL, which is not supported. Use `upsert` or manual `findOne` + `create`.

```ts
// Instead of: await User.findOrCreate({ where: { email }, defaults: { name } });

// Option 1: upsert (overwrites name if record exists)
const [user] = await User.upsert({ email, name });

// Option 2: manual approach (preserves existing name)
let user = await User.findOne({ where: { email } });
if (!user) user = await User.create({ email, name });
```

**truncate**: `Model.truncate()` is not supported. Use `destroy` with empty where clause.

```ts
// Instead of: await Model.truncate();
await Model.destroy({ where: {} });
```

### Locking

`FOR UPDATE` is only supported with equality predicates on the primary key. Queries that lock by non-key columns will fail.

```ts
// Works: lock by primary key
await Model.findByPk(id, { lock: Transaction.LOCK.UPDATE, transaction });

// Does not work: lock by non-key column
await Model.findOne({ where: { status: 'pending' }, lock: Transaction.LOCK.UPDATE, transaction });
```

## Additional resources

* [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
* [Aurora DSQL Connector for node-postgres](https://github.com/awslabs/aurora-dsql-nodejs-connector/blob/main/packages/node-postgres/README.md)
* [Sequelize Documentation](https://sequelize.org/docs/v6/)
* [AWS SDK for JavaScript Documentation](https://docs.aws.amazon.com/sdk-for-javascript/)
---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 

SPDX-License-Identifier: MIT-0
