-- setup_app_user.sql
-- Creates a non-admin, IAM-authenticated application role for the hotel
-- reservation system. In this sample the role is granted CREATE on its schema
-- so it can self-provision its tables at runtime; because the role then owns
-- those tables, it also holds DDL rights (DROP/ALTER) on them — i.e. more than
-- pure CRUD. For a strict least-privilege setup, create the tables as admin and
-- grant the role USAGE + CRUD only (omit CREATE); see the note on step 4.
-- Run this as the admin user, e.g.:
--
--   TOKEN=$(aws dsql generate-db-connect-admin-auth-token \
--     --hostname <cluster-endpoint> --region <region> --expires-in 3600)
--   psql "host=<cluster-endpoint> port=5432 dbname=postgres user=admin sslmode=require password=${TOKEN}" \
--     -f setup_app_user.sql
--
-- Replace <AWS_ACCOUNT_ID> and <IAM_USERNAME> before running.
-- (For an IAM role instead of a user, use role/<IAM_ROLE_NAME>.)

-- 1. Create the non-admin application role with login capability.
--    Run this script once. Aurora DSQL does not support plpgsql DO blocks, so
--    there is no IF NOT EXISTS guard here; re-running errors harmlessly with
--    "role already exists" and the remaining statements are idempotent.
CREATE ROLE hotel_app WITH LOGIN;

-- 2. Map the database role 1:1 to an IAM identity. The IAM identity must have
--    the dsql:DbConnect permission on this cluster.
AWS IAM GRANT hotel_app TO 'arn:aws:iam::<AWS_ACCOUNT_ID>:user/<IAM_USERNAME>';

-- 3. Create a dedicated schema (owned by admin). We intentionally do NOT use
--    AUTHORIZATION hotel_app: in Aurora DSQL the admin cannot SET ROLE to an
--    IAM-linked role, so schema ownership stays with admin and hotel_app is
--    granted the privileges it needs below.
CREATE SCHEMA IF NOT EXISTS hotel;

-- 4. Allow the role to use the schema and create objects in it (the app creates
--    its tables at runtime). NOTE: granting CREATE means the role OWNS the tables
--    it creates, which implicitly gives it DDL (DROP/ALTER) on them — broader than
--    the CRUD grant in step 5. For strict least privilege, omit CREATE here,
--    create the tables as admin, and run the app with CLUSTER_USER=admin for the
--    one-time schema setup.
GRANT USAGE, CREATE ON SCHEMA hotel TO hotel_app;

-- 5. Grant CRUD on all tables that already exist in the schema (none yet on first run,
--    but harmless and correct if you re-run after tables exist).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA hotel TO hotel_app;

-- 6. IMPORTANT: GRANT ... ON ALL TABLES only covers tables that exist at grant time.
--    This application creates its tables at runtime, so apply the same privileges to
--    any tables created LATER in the schema. Without this, the app hits permission
--    denied on its own tables.
ALTER DEFAULT PRIVILEGES IN SCHEMA hotel
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hotel_app;
