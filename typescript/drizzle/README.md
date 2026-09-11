# Veterinary app (Drizzle + Aurora DSQL)

A small veterinary clinic schema demonstrating [@aws/aurora-dsql-drizzle](https://github.com/awslabs/aurora-dsql-orms/tree/main/node/drizzle): IAM-authenticated connections, DSQL-ready migrations, and relational queries.

## Layout

- `src/schema.ts` — Drizzle tables with UUID primary keys, native `RESTRICT` foreign keys, and matching `relations()` query metadata
- `drizzle/` — committed DSQL migrations; `0001` adds foreign keys to existing tables with `NOT VALID` and monitored asynchronous validation
- `src/dsql-client.ts` — builds the `drizzle()` database
- `src/migrate.ts` — applies migrations via the adapter's `migrate()`
- `src/example.ts` — populates and verifies data

## Run

```bash
export CLUSTER_ENDPOINT=<your-cluster-id>.dsql.<region>.on.aws
export CLUSTER_USER=myuser   # required; the database role to connect as

npm install
npm run db:migrate   # applies drizzle/ with the adapter's migrate()
npm run sample       # populate + verify
npm test             # integration tests (needs the cluster)
```

Credentials come from the default AWS credential chain, and need `dsql:DbConnect` for the role named in `CLUSTER_USER`.

### Setting up the database role

Connect as `admin` once to create an application role scoped to just this app's schema, plus the schema `migrate()` tracks applied statements in. See [Using database roles and IAM authentication](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/using-database-and-iam-roles.html):

```sql
CREATE SCHEMA myschema;
CREATE SCHEMA drizzle;   -- migrate()'s tracking schema
CREATE ROLE myuser WITH LOGIN;
AWS IAM GRANT myuser TO 'arn:aws:iam::<account-id>:role/<your-iam-role>';
GRANT USAGE, CREATE ON SCHEMA myschema TO myuser;
GRANT USAGE, CREATE ON SCHEMA drizzle TO myuser;
```

`CLUSTER_USER=myuser` makes the app connect with `search_path=myschema`. There is no default, so the app never lands on `admin` and the shared `public` schema by omission.

Run `db:migrate` and the app as the same `CLUSTER_USER`, and don't change it afterwards. The schema is derived from it, while `migrate()` tracks applied statements globally — so migrating as `admin` puts the tables in `public`, and a later run as `myuser` finds every statement already recorded and leaves `myschema` empty. One role also keeps the grants above sufficient: `myuser` owns the tables it creates, so nothing needs granting after a migration.

## Regenerating the migration

After changing `src/schema.ts`:

```bash
npm run db:generate   # aurora-dsql-drizzle generate: drizzle-kit generate + dsql-lint --fix
```

This is the adapter's own CLI wrapping both steps, so plain `drizzle-kit generate` isn't needed — the second step is what rewrites the generated SQL for DSQL. Review and commit the result.
