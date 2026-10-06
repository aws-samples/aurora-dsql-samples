-- =============================================================================
-- DSQL Employee Lookup - Database Setup & Seed Data
-- =============================================================================
-- IMPORTANT: This script requires ADMIN access to your DSQL cluster.
-- Connect as admin to create roles, grant IAM authentication, and set up the
-- schema. Steps that require write or admin access are annotated below.
--
-- Required psql variables:
--   role_arn  - The ARN of the Lambda execution role
--                (e.g., arn:aws:iam::123456789012:role/dsql-employee-lookup-role)
--
-- Run after deploying infrastructure (the DSQL cluster and IAM role must exist):
--   TOKEN=$(aws dsql generate-db-connect-admin-auth-token \
--     --hostname <YOUR_ENDPOINT> --region <YOUR_REGION>)
--   PGPASSWORD=$TOKEN psql \
--     "host=<YOUR_ENDPOINT> port=5432 dbname=postgres user=admin sslmode=require" \
--     -v ON_ERROR_STOP=1 \
--     -v role_arn='arn:aws:iam::<YOUR_ACCOUNT_ID>:role/dsql-employee-lookup-role' \
--     -f seed.sql
--
-- NOTE: CREATE ROLE does not support IF NOT EXISTS in DSQL.
-- Re-running this script will fail on the CREATE ROLE statement if the role
-- already exists. To re-seed, comment out Step 2 and Step 3 on subsequent runs.
--
-- =============================================================================
-- (Optional) Create a write-access role for schema setup and data loading.
-- Uncomment the following block if you want a separate user with write access
-- instead of using admin for CREATE TABLE and INSERT operations:
--
--   CREATE ROLE app_writer WITH LOGIN;
--   AWS IAM GRANT app_writer TO :'role_arn';
--   GRANT CREATE ON SCHEMA app TO app_writer;
--   GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO app_writer;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA app
--     GRANT INSERT, UPDATE, DELETE ON TABLES TO app_writer;
-- =============================================================================

-- Step 1: Create the application schema (requires write access)
CREATE SCHEMA IF NOT EXISTS app;

-- Step 2: Create the application role with least privilege (requires admin access)
-- NOTE: DSQL does not support IF NOT EXISTS for CREATE ROLE.
-- This statement will fail if app_readonly already exists.
CREATE ROLE app_readonly WITH LOGIN;

-- Step 3: Grant IAM authentication to your Lambda execution role (requires admin access)
AWS IAM GRANT app_readonly TO :'role_arn';

-- Step 4: Create the employees table in the app schema (requires write access on app schema)
CREATE TABLE IF NOT EXISTS app.employees (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    department TEXT NOT NULL,
    title TEXT NOT NULL,
    hire_date DATE NOT NULL
);

-- Step 5: Create an index for prefix name lookups (requires write access on app schema)
CREATE INDEX ASYNC idx_employees_name_lower ON app.employees (LOWER(name));

-- Step 5b: Verify the async index build completed successfully.
-- If indisvalid is false, the index build failed — drop and recreate it.
-- For psql users: you can alternatively capture the job_id with \gset and
-- run CALL sys.wait_for_job(:'job_id'); to wait for completion.
SELECT indisvalid FROM pg_index WHERE indexrelid = 'app.idx_employees_name_lower'::regclass;

-- Step 6: Grant schema and table access to the app role (requires admin access)
GRANT USAGE ON SCHEMA app TO app_readonly;
GRANT SELECT ON app.employees TO app_readonly;

-- Step 7: Insert sample data (requires write access on app.employees table)
-- Fixed UUIDs ensure ON CONFLICT DO NOTHING works correctly on re-runs.
INSERT INTO app.employees (id, name, email, department, title, hire_date) VALUES
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'John Doe', 'jdoe@example.com', 'Engineering', 'Software Engineer', '2022-01-15'),
  ('b1ffcd00-ad1c-5f09-cc7e-7cc0ce491b22', 'Jane Doe', 'jane.doe@example.com', 'Product', 'Product Manager', '2021-06-01'),
  ('c2aade11-be2d-6a10-dd8f-8dd1df5a2c33', 'Carlos Garcia', 'cgarcia@example.com', 'Engineering', 'Senior Engineer', '2020-11-20'),
  ('d3bbef22-cf3e-7b21-ee90-9ee2e06b3d44', 'Alice Johnson', 'alice@example.com', 'Engineering', 'Staff Engineer', '2019-03-15'),
  ('e4ccf033-d04f-8c32-ffa1-aff3f17c4e55', 'Bob Smith', 'bob.smith@example.com', 'Sales', 'Account Executive', '2023-02-28')
  ON CONFLICT (id) DO NOTHING;

-- Verify: Check the data
SELECT * FROM app.employees ORDER BY name;
