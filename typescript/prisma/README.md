# Aurora DSQL with Prisma

This sample demonstrates using [Prisma ORM](https://www.prisma.io/) with [Amazon Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html).

## Prerequisites

- AWS account with default credentials configured ([setup guide](https://docs.aws.amazon.com/credref/latest/refdocs/creds-config-files.html))
- [Node.js 20+](https://nodejs.org)
- An Aurora DSQL cluster ([getting started guide](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html))

## Quick Start

### Install dependencies

```bash
npm install
```

### Set environment variables

```bash
export CLUSTER_USER="admin"
export CLUSTER_ENDPOINT="your-cluster.dsql.us-east-1.on.aws"
```

### Build and run migrations

```bash
npm run build
npm run prisma:migrate-up
```

### Run the sample

```bash
npm run sample
```

## CLI Tools

This sample uses [@aws/aurora-dsql-prisma-tools](https://www.npmjs.com/package/@aws/aurora-dsql-prisma-tools) for schema validation and migration transformation. See the package documentation for full details on:

- **Schema Validator** - Validates Prisma schemas for DSQL compatibility
- **Migration Transformer** - Converts Prisma migrations to DSQL-compatible SQL

### Validate schema

```bash
npm run validate prisma/veterinary-schema.prisma
```

### Generate DSQL-compatible migration

```bash
npm run dsql-migrate prisma/veterinary-schema.prisma -o prisma/migrations/001_init/migration.sql
```

For incremental migrations against an existing database:

```bash
npm run dsql-migrate prisma/veterinary-schema.prisma \
    -o prisma/migrations/002_add_column/migration.sql \
    --from-config-datasource
```

## About the Sample

The sample uses the [Aurora DSQL Connector](https://github.com/awslabs/aurora-dsql-connectors/tree/main/node) for automatic IAM authentication and connection pooling. It demonstrates:

- Connecting to Aurora DSQL using Prisma with IAM authentication
- CRUD operations using Prisma's type-safe client
- Managing relationships (owners, pets, veterinarians, specialties)

The sample works with both admin and non-admin users:

- **Admin user**: Uses the `public` schema
- **Non-admin user**: Uses the `myschema` schema

### Usage

```typescript
import { DsqlPrismaClient } from "./dsql-client";

const client = new DsqlPrismaClient();

// Use Prisma as normal
const users = await client.user.findMany();

// Clean up
await client.dispose();
```

## Prisma with Aurora DSQL

When using Prisma with Aurora DSQL:

1. **Set relation mode** - DSQL doesn't support foreign keys:

    ```prisma
    datasource db {
      provider     = "postgresql"
      relationMode = "prisma"
    }
    ```

2. **Use UUID for IDs** - DSQL doesn't support sequences:

    ```prisma
    model User {
      id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
    }
    ```

3. **Disable advisory locks** - When running migrations:
    ```bash
    PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1 npx prisma migrate deploy
    ```

## Tests

Run the integration tests (requires a DSQL cluster):

```bash
npm test
```

## Cleanup

Remove the database schema:

```bash
npm run prisma:migrate-down
```

## Additional Resources

- [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
- [Unsupported PostgreSQL Features in DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-unsupported-features.html)
- [Aurora DSQL Node.js Connector](https://github.com/awslabs/aurora-dsql-connectors/tree/main/node)
- [Prisma Documentation](https://www.prisma.io/docs)
- [@aws/aurora-dsql-prisma-tools](https://www.npmjs.com/package/@aws/aurora-dsql-prisma-tools)

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
