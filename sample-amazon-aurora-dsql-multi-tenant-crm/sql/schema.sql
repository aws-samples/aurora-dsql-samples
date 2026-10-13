-- Multi-tenant CRM schema for Amazon Aurora DSQL (pooled model).
--
-- Design notes specific to Aurora DSQL:
--  * Foreign keys: Aurora DSQL supports foreign key constraints, and this
--    schema uses them for existence guarantees (a child row cannot reference a
--    parent that does not exist). The polymorphic activities.related_id column
--    is the one exception -- it can point at accounts, contacts, or
--    opportunities, so no single FK expresses it; its integrity stays in the
--    application layer. A foreign key proves a parent EXISTS; it does not prove
--    the parent belongs to the same tenant, so the repository layer still runs
--    one tenant-scoped ownership check before inserting a child row.
--  * Every tenant-scoped table carries a tenant_id column. Isolation is
--    enforced centrally in the repository layer -- every query is filtered
--    by tenant_id. The discriminator + centralized data-access layer is the
--    isolation boundary for the pooled model.
--  * UUID primary keys generated in the application (crypto.randomUUID())
--    spread writes evenly across storage partitions.
--  * Each DDL statement runs in its own transaction (Aurora DSQL requirement);
--    the migration runner (src/db/migrate.ts) executes these one at a time.
--  * Inline PRIMARY KEY / UNIQUE constraints create immediately-valid backing
--    indexes. Standalone secondary indexes use CREATE INDEX ASYNC.
--
-- This file documents the schema. The authoritative, executable version is the
-- statement array in src/db/migrate.ts (so each statement gets its own txn).

-- Tenant registry. The only table not scoped by tenant_id.
CREATE TABLE IF NOT EXISTS tenants (
  id         UUID PRIMARY KEY,
  name       VARCHAR(200) NOT NULL,
  status     VARCHAR(20)  NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- CRM users belonging to a tenant.
CREATE TABLE IF NOT EXISTS users (
  id         UUID PRIMARY KEY,
  tenant_id  UUID NOT NULL REFERENCES tenants (id),
  email      VARCHAR(254) NOT NULL,
  name       VARCHAR(200) NOT NULL,
  role       VARCHAR(30)  NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- Email is unique per tenant, not globally.
  UNIQUE (tenant_id, email)
);

-- Accounts (companies) owned by a tenant.
CREATE TABLE IF NOT EXISTS accounts (
  id         UUID PRIMARY KEY,
  tenant_id  UUID NOT NULL REFERENCES tenants (id),
  name       VARCHAR(200) NOT NULL,
  industry   VARCHAR(100),
  website    VARCHAR(254),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Contacts, each linked to an account. The FK guarantees the account exists;
-- the app layer still checks the account belongs to the same tenant.
CREATE TABLE IF NOT EXISTS contacts (
  id         UUID PRIMARY KEY,
  tenant_id  UUID NOT NULL REFERENCES tenants (id),
  account_id UUID NOT NULL REFERENCES accounts (id),
  first_name VARCHAR(100) NOT NULL,
  last_name  VARCHAR(100) NOT NULL,
  email      VARCHAR(254),
  phone      VARCHAR(40),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Opportunities (deals) against an account.
CREATE TABLE IF NOT EXISTS opportunities (
  id         UUID PRIMARY KEY,
  tenant_id  UUID NOT NULL REFERENCES tenants (id),
  account_id UUID NOT NULL REFERENCES accounts (id),
  name       VARCHAR(200)  NOT NULL,
  stage      VARCHAR(30)   NOT NULL DEFAULT 'prospecting',
  amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  close_date DATE,
  owner_id   UUID REFERENCES users (id),
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Activities (tasks / notes / calls) linked to any CRM record. related_id is
-- polymorphic (it can point at an account, contact, or opportunity), so no
-- single foreign key expresses it -- that relationship stays in the app layer.
-- tenant_id still gets a foreign key.
CREATE TABLE IF NOT EXISTS activities (
  id           UUID PRIMARY KEY,
  tenant_id    UUID NOT NULL REFERENCES tenants (id),
  related_type VARCHAR(20) NOT NULL,   -- 'account' | 'contact' | 'opportunity'
  related_id   UUID NOT NULL,
  subject      VARCHAR(200) NOT NULL,
  notes        TEXT,
  due_at       TIMESTAMPTZ,
  done         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Secondary indexes (built asynchronously; do not block reads/writes).
CREATE INDEX ASYNC IF NOT EXISTS idx_users_tenant         ON users (tenant_id);
CREATE INDEX ASYNC IF NOT EXISTS idx_accounts_tenant      ON accounts (tenant_id);
CREATE INDEX ASYNC IF NOT EXISTS idx_contacts_tenant_acct ON contacts (tenant_id, account_id);
CREATE INDEX ASYNC IF NOT EXISTS idx_opps_tenant_stage    ON opportunities (tenant_id, stage);
CREATE INDEX ASYNC IF NOT EXISTS idx_activities_tenant_rel ON activities (tenant_id, related_id);
