# Aurora DSQL with Drizzle ORM

This sample demonstrates using [Drizzle ORM](https://orm.drizzle.team/) with [Amazon Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html).

## Prerequisites

- AWS account with default credentials configured ([setup guide](https://docs.aws.amazon.com/credref/latest/refdocs/creds-config-files.html))
- [Node.js 20+](https://nodejs.org)
- An Aurora DSQL cluster ([getting started guide](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html))

## Quick Start

### Install dependencies

```
npm install
```

### Set environment variables

```
export CLUSTER_USER="admin"
export CLUSTER_ENDPOINT="your-cluster.dsql.us-east-1.on.aws"
```

### Build and run the sample

```
npm run build
npm run sample
```

## About the Sample

The sample uses the [Aurora DSQL Connector](https://github.com/awslabs/aurora-dsql-connectors/tree/main/node) for automatic IAM authentication and connection pooling. It demonstrates:

- Connecting to Aurora DSQL using Drizzle ORM with IAM authentication
- Applying database migrations using a custom DSQL-compatible migration runner
- CRUD operations using Drizzle's type-safe query builder
- Managing relationships (owners, pets, veterinarians, specialties)

The sample works with both admin and non-admin users:

- **Admin user**: Uses the `public` schema
- **Non-admin user**: Uses the `myschema` schema

### Usage

```typescript
import { createDsqlClient } from "./dsql-client";

const { db, pool } = createDsqlClient();

// Use Drizzle as normal
const owners = await db.query.owner.findMany();

// Clean up
await pool.end();
```

## Drizzle ORM with Aurora DSQL

When using Drizzle ORM with Aurora DSQL:

1. **Use UUID for IDs** — DSQL doesn't support sequences:

   ```typescript
   import { pgTable, uuid } from "drizzle-orm/pg-core";
   import { sql } from "drizzle-orm";

   export const owner = pgTable("owner", {
       id: uuid().primaryKey().default(sql`gen_random_uuid()`),
   });
   ```

2. **No foreign key constraints** — DSQL doesn't support foreign keys. Use Drizzle's `relations()` API for application-level relationship handling:

   ```typescript
   import { relations } from "drizzle-orm";

   export const petRelations = relations(pet, ({ one }) => ({
       owner: one(owner, {
           fields: [pet.ownerId],
           references: [owner.id],
       }),
   }));
   ```

3. **Custom migration runner** — Drizzle's built-in `migrate()` creates its tracking table using `SERIAL`, which DSQL does not support. This sample includes a custom migration runner (`src/migrate.ts`) that uses UUID primary keys instead:

   ```typescript
   import { applyMigrations } from "./migrate";

   await applyMigrations(pool, "./drizzle");
   ```

4. **Generate migrations offline** — Use `drizzle-kit generate` to create SQL migration files from your schema (no database connection required):

   ```
   npm run migrate:generate
   ```

## Tests

Run the integration tests (requires a DSQL cluster):

```
npm test
```

## Cleanup

To remove the database tables, connect to your cluster and run:

```sql
DROP TABLE IF EXISTS "__drizzle_migrations";
DROP TABLE IF EXISTS "_SpecialtyToVet";
DROP TABLE IF EXISTS "pet";
DROP TABLE IF EXISTS "owner";
DROP TABLE IF EXISTS "specialty";
DROP TABLE IF EXISTS "vet";
```

## Additional Resources

- [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
- [Unsupported PostgreSQL Features in DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-unsupported-features.html)
- [Aurora DSQL Node.js Connector](https://github.com/awslabs/aurora-dsql-connectors/tree/main/node)
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview)
- [Drizzle ORM PostgreSQL Guide](https://orm.drizzle.team/docs/get-started-postgresql)

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
