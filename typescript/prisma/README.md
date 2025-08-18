# Aurora DSQL with Prisma

## Overview

This code example demonstrates how to use `Prisma` with Amazon Aurora DSQL. The example shows you how to connect to an
Aurora DSQL cluster and perform basic database operations.

Aurora DSQL is a distributed SQL database service that provides high availability and scalability for your
PostgreSQL-compatible applications. `Prisma` is a modern database toolkit that provides type-safe database access,
automated migrations, and an intuitive data model for TypeScript and JavaScript applications.

## About the code example

The example demonstrates a flexible connection approach that works for both admin and non-admin users:

- When connecting as an **admin user**, the example uses the `public` schema and generates an admin authentication
  token.
- When connecting as a **non-admin user**, the example uses a custom `myschema` schema and generates a standard
  authentication token.

The code automatically detects the user type and adjusts its behavior accordingly using a custom Prisma client that
integrates with Aurora DSQL's IAM-based authentication system.

## ⚠️ Important

- Running this code might result in charges to your AWS account.
- We recommend that you grant your code least privilege. At most, grant only the
  minimum permissions required to perform the task. For more information, see
  [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege).
- This code is not tested in every AWS Region. For more information, see
  [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services).

## Run the code

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

```
npm install
```

### Set environment variables

Set environment variables for your cluster details:

```bash
# e.g. "admin"
export CLUSTER_USER="<your user>"

# e.g. "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws"
export CLUSTER_ENDPOINT="<your endpoint>"

# e.g. "us-east-1"
export REGION="<your region>"
```

### Database migrations

Before running the example, you need to apply database migrations to create the required tables. Prisma requires a
properly formatted `DATABASE_URL` environment variable that includes authentication credentials.

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

# Set up DATABASE_URL to allow Prisma to connect.
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

The example demonstrates the following operations:

- Opening a connection to an Aurora DSQL cluster using Prisma
- Inserting and querying data using Prisma's type-safe client
- Managing relationships between entities (owners, pets, veterinarians, and specialties)

The example is designed to work with both admin and non-admin users:

- When run as an admin user, it uses the `public` schema
- When run as a non-admin user, it uses the `myschema` schema

**Note:** running the example will use actual resources in your AWS account and may incur charges.

Run the example:

```
npm run sample
```

### Run unit tests

The example includes unit tests that verify the DSQL Prisma client functionality.

**Note:** running the tests will use actual resources in your AWS account and may incur charges.

Run the tests:

```
npm test
```

## Token Generation

The implementation includes an automatic token generation mechanism for new connections. This ensures continuous
database connectivity for the pool. Lazily created connections will generate a new authentication token before
connecting. Similarly, replacement connections for those exceeding the pool connection lifetime will generate their own
fresh authentication token.

The custom Prisma client uses `@prisma/adapter-pg` with the `driverAdapters` preview feature to integrate with the
PostgreSQL driver, enabling custom connection pooling that handles Aurora DSQL's token-based authentication system
automatically.

## Prisma considerations with Aurora DSQL

When using Prisma with Aurora DSQL, be aware of the following considerations and limitations.

### Configuration Requirements

- **Relation mode**: Set `relationMode = "prisma"` to handle referential integrity at the application level.
- **Model IDs**: Use `gen_random_uuid()` to create DSQL-compatible automatic unique IDs.

### Migration Requirements

- **Advisory Locks**: Disable Prisma's default advisory locks behaviour by setting
  `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1`.
- **Manual transaction wrapping**: Add transactions around individual generated migration statements to prevent multiple
  DDL statements in the same transaction.
- **Manual index syntax change**: Replace `CREATE INDEX` with `CREATE INDEX ASYNC` to match expected DSQL syntax.

## Additional resources

- [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Prisma Driver Adapters](https://www.prisma.io/docs/orm/overview/databases/database-drivers)
- [AWS SDK for JavaScript Documentation](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
