-- =============================================================================
-- DSQL Employee Lookup - Database Setup & Seed Data
-- =============================================================================
-- Run this SQL after connecting to your DSQL cluster as admin.
--
-- Connect via Query Editor in the console, or via psql:
--   TOKEN=$(aws dsql generate-db-connect-admin-auth-token \
--     --hostname <YOUR_ENDPOINT> --region us-east-1)
--   PGPASSWORD=$TOKEN psql "host=<YOUR_ENDPOINT> port=5432 dbname=postgres user=admin sslmode=require"
-- =============================================================================

-- Step 1: Create the application role with least privilege
CREATE ROLE app_readonly WITH LOGIN;

-- Step 2: Grant IAM authentication to your Lambda execution role
-- Replace <ACCOUNT_ID> with your AWS account ID
AWS IAM GRANT app_readonly TO 'arn:aws:iam::<ACCOUNT_ID>:role/dsql-employee-lookup-role';

-- Step 3: Create the employees table
CREATE TABLE IF NOT EXISTS employees (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    department TEXT NOT NULL,
    title TEXT NOT NULL,
    hire_date DATE NOT NULL
);

-- Step 4: Insert sample data (using AWS documentation patterns)
INSERT INTO employees (name, email, department, title, hire_date) VALUES
  ('John Doe', 'jdoe@example.com', 'Engineering', 'Software Engineer', '2022-01-15'),
  ('Jane Doe', 'jane.doe@example.com', 'Product', 'Product Manager', '2021-06-01'),
  ('Carlos Garcia', 'cgarcia@example.com', 'Engineering', 'Senior Engineer', '2020-11-20'),
  ('Alice Johnson', 'alice@example.com', 'Engineering', 'Staff Engineer', '2019-03-15'),
  ('Bob Smith', 'bob.smith@example.com', 'Sales', 'Account Executive', '2023-02-28');

-- Step 5: Grant only SELECT on the employees table to the app role
GRANT SELECT ON employees TO app_readonly;

-- Verify: Check the data
SELECT * FROM employees ORDER BY name;
