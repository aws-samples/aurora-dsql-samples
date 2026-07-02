-- ============================================================================
-- Aurora DSQL: Create a non-admin application user
-- ============================================================================
-- Run these commands connected as the "admin" user.
--
-- In Aurora DSQL, non-admin database users are linked to IAM identities via
-- the AWS IAM GRANT command. The database role name can be any valid
-- identifier — it doesn't need to be the full IAM ARN.
--
-- Prerequisites:
--   1. Your IAM user has both dsql:DbConnectAdmin and dsql:DbConnect
--      in its IAM policy for the target cluster.
--   2. You are connected to the cluster as the "admin" user.
--
-- Replace <AWS_ACCOUNT_ID> with your 12-digit AWS account ID.
-- Replace <IAM_USERNAME> with your IAM user name.
-- ============================================================================

-- Step 1: Create the database role with a simple name
CREATE ROLE rideshare_app WITH LOGIN;

-- Step 2: Link the IAM identity to the database role
-- This Aurora DSQL-specific command maps the IAM caller to the database role.
-- Without this, DSQL won't know which IAM identity can authenticate as this role.
AWS IAM GRANT rideshare_app TO 'arn:aws:iam::<AWS_ACCOUNT_ID>:user/<IAM_USERNAME>';

-- Step 3: Create a dedicated schema for the app user
CREATE SCHEMA rideshare;

-- Step 4: Grant schema usage and table creation privileges
GRANT USAGE ON SCHEMA rideshare TO rideshare_app;
GRANT CREATE ON SCHEMA rideshare TO rideshare_app;

-- Step 5: Grant CRUD access to all current tables in the schema
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA rideshare TO rideshare_app;

-- Step 6: Ensure future tables created in this schema also get CRUD access
ALTER DEFAULT PRIVILEGES IN SCHEMA rideshare
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rideshare_app;

-- ============================================================================
-- Example (account ID: 111222333444, IAM user: jdoe):
--
--   CREATE ROLE rideshare_app WITH LOGIN;
--   AWS IAM GRANT rideshare_app TO 'arn:aws:iam::111222333444:user/jdoe';
--   CREATE SCHEMA rideshare;
--   GRANT USAGE ON SCHEMA rideshare TO rideshare_app;
--   GRANT CREATE ON SCHEMA rideshare TO rideshare_app;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA rideshare TO rideshare_app;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA rideshare GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rideshare_app;
-- ============================================================================

-- After running these commands, connect from your app with:
--   export CLUSTER_USER="rideshare_app"
--   export CLUSTER_SCHEMA="rideshare"
--   python riders_app.py

-- ============================================================================
-- ADVANCED: Using an IAM role instead (for EC2/ECS/Lambda production workloads)
-- ============================================================================
-- If your compute uses an IAM role (instance profile, task role, etc.),
-- link the role ARN instead of the user ARN:
--
-- Example:
--   CREATE ROLE rideshare_app WITH LOGIN;
--   AWS IAM GRANT rideshare_app TO 'arn:aws:iam::111222333444:role/RideshareAppRole';
--   GRANT USAGE ON SCHEMA rideshare TO rideshare_app;
--   ...
-- ============================================================================
