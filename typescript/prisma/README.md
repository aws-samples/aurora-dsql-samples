# Aurora DSQL with Prisma

## Overview

This package provides tools for using Prisma ORM with Amazon Aurora DSQL:

1. **Schema Validator** - Validates Prisma schemas for DSQL compatibility
2. **DSQL Prisma Client** - Prisma client with automatic IAM authentication

Aurora DSQL is a distributed SQL database service that provides high availability and scalability for your
PostgreSQL-compatible applications. Prisma is a modern database toolkit that provides type-safe database access,
automated migrations, and an intuitive data model for TypeScript and JavaScript applications.

## Project Structure

- **`src/`** - Sample code that you can copy into your own project
- **`helpers/`** - Optional tooling (schema validator) - useful during development but not required in your final project

## Recommended Workflow

When using Prisma with Aurora DSQL, follow this workflow:

1. **Write your Prisma schema** - Define your models in `prisma/schema.prisma`

2. **Validate for DSQL compatibility** - Run the validator to catch issues early:

    ```bash
    npm run validate prisma/schema.prisma
    ```

3. **Generate Prisma client** - Generate the type-safe client:

    ```bash
    npx prisma generate
    ```

4. **Create migrations manually** - Write DSQL-compatible SQL (see [Migration Requirements](#migration-requirements))

5. **Apply migrations** - Deploy your schema:

    ```bash
    npm run prisma:migrate-up
    ```

6. **Use the DSQL Prisma Client** - Connect and query with automatic IAM auth

## Schema Validator

Validate your Prisma schema for DSQL compatibility before runtime:

```bash
npm run validate prisma/schema.prisma
```

### What the Validator Checks

Aurora DSQL has [specific PostgreSQL compatibility limitations](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-unsupported-features.html). The validator catches Prisma schema patterns that will fail at runtime:

| Check                                  | Type    | DSQL Limitation                 |
| -------------------------------------- | ------- | ------------------------------- |
| Missing `relationMode = "prisma"`      | Error   | Foreign keys not supported      |
| `autoincrement()`                      | Error   | Sequences not supported         |
| `@db.Serial`                           | Error   | Sequences not supported         |
| `@db.SmallSerial`                      | Error   | Sequences not supported         |
| `@db.BigSerial`                        | Error   | Sequences not supported         |
| `@@fulltext`                           | Error   | Full-text indexes not supported |
| `Int @id` without autoincrement        | Warning | Manual ID management needed     |
| `BigInt @id`                           | Warning | Typically requires sequences    |
| `gen_random_uuid()` without `@db.Uuid` | Warning | Should use proper UUID type     |

### Example Output

```
✗ autoincrement() is not supported in DSQL (line 12)
  → Use @default(dbgenerated("gen_random_uuid()")) @db.Uuid instead

✗ Missing relationMode = "prisma" in datasource block (line 3)
  → Add relationMode = "prisma" to your datasource block. DSQL does not support foreign key constraints.

✗ Validation failed: 2 error(s), 0 warning(s)
```

## About the Example

The example uses the [Aurora DSQL Connector](https://github.com/awslabs/aurora-dsql-nodejs-connector) for automatic
IAM authentication and connection pooling. It demonstrates:

- Opening a connection to an Aurora DSQL cluster using Prisma
- Inserting and querying data using Prisma's type-safe client
- Managing relationships between entities (owners, pets, veterinarians, and specialties)

The example is designed to work with both admin and non-admin users:

- When run as an **admin user**, it uses the `public` schema
- When run as a **non-admin user**, it uses the `myschema` schema

The code automatically detects the user type and adjusts its behavior accordingly.

### Usage

```typescript
import { DsqlPrismaClient } from "./dsql-client";

const client = new DsqlPrismaClient();

// Use Prisma as normal
const users = await client.user.findMany();

// Clean up
await client.dispose();
```

## ⚠️ Important

- Running this code might result in charges to your AWS account.
- We recommend that you grant your code least privilege. At most, grant only the
  minimum permissions required to perform the task. For more information, see
  [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege).
- This code is not tested in every AWS Region. For more information, see
  [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services).

## Run the Example

### Prerequisites

- You must have an AWS account, and have your default credentials and AWS Region
  configured as described in the
  [Globally configuring AWS SDKs and tools](https://docs.aws.amazon.com/credref/latest/refdocs/creds-config-files.html)
  guide.
- [Node 20.0.0](https://nodejs.org) or later.
- You must have an Aurora DSQL cluster. For information about creating an Aurora DSQL cluster, see the
  [Getting started with Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html)
  guide.
- If connecting as a non-admin user, ensure the user is linked to an IAM role and is granted access to the `myschema`
  schema. See the
  [Using database roles with IAM roles](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/using-database-and-iam-roles.html)
  guide.

### Install dependencies

Install all required packages for the Prisma example:

```bash
npm install
```

### Set environment variables

Set environment variables for your cluster details:

```bash
# e.g. "admin"
export CLUSTER_USER="<your user>"

# e.g. "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws"
export CLUSTER_ENDPOINT="<your endpoint>"
```

### Database migrations

Before running the example, you need to apply database migrations to create the required tables. Prisma's migration
tool requires a `DATABASE_URL` environment variable with authentication credentials.

Generate an authentication token following the instructions in
the [Aurora DSQL authentication token guide](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/SECTION_authentication-token.html)
and set it as the `CLUSTER_PASSWORD` environment variable, then set up the database URL:

```bash
# Set schema based on user type.
if [ "$CLUSTER_USER" = "admin" ]; then
  export SCHEMA="public"
else
  export SCHEMA="myschema"
fi

# URL-encode password for consumption by Prisma.
export ENCODED_PASSWORD=$(python -c "from urllib.parse import quote; print(quote('$CLUSTER_PASSWORD', safe=''))")

# Set up DATABASE_URL for Prisma migrations.
export DATABASE_URL="postgresql://$CLUSTER_USER:$ENCODED_PASSWORD@$CLUSTER_ENDPOINT:5432/postgres?sslmode=verify-full&schema=$SCHEMA"
```

Apply the database migrations:

```bash
# Create the database schema
npm run prisma:migrate-up
```

To remove the database schema when you're done:

```bash
# Clean up the database schema
npm run prisma:migrate-down
```

### Run the example

**Note:** running the example will use actual resources in your AWS account and may incur charges.

```bash
npm run sample
```

### Run tests

The example includes integration tests that verify the Prisma client functionality with DSQL.

**Note:** running the tests will use actual resources in your AWS account and may incur charges.

```bash
npm test
```

## Prisma Considerations with Aurora DSQL

When using Prisma with Aurora DSQL, be aware of the following considerations and limitations.
For full details on DSQL limitations, see [Unsupported PostgreSQL features in Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-unsupported-features.html).

### Configuration Requirements

- **Relation mode**: Set `relationMode = "prisma"` to handle referential integrity at the application level (DSQL does not support foreign keys).
- **Model IDs**: Use `gen_random_uuid()` to create DSQL-compatible automatic unique IDs (DSQL does not support sequences).

### Migration Requirements

- **Advisory Locks**: Disable Prisma's default advisory locks behavior by setting
  `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1`.
- **Manual transaction wrapping**: Add transactions around individual generated migration statements to prevent multiple
  DDL statements in the same transaction.
- **Manual index syntax change**: Replace `CREATE INDEX` with `CREATE INDEX ASYNC` to match expected DSQL syntax.

## Additional Resources

- [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
- [Unsupported PostgreSQL Features in DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-unsupported-features.html)
- [Aurora DSQL Node.js Connector](https://github.com/awslabs/aurora-dsql-nodejs-connector)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Prisma Driver Adapters](https://www.prisma.io/docs/orm/overview/databases/database-drivers)

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
