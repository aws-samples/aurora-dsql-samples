-- =============================================================================
-- Sample table setup for Aurora DSQL batch operations
--
-- This script creates a test table and populates it with 5,000 rows of sample
-- data. Use this table to test the batch DELETE and UPDATE code samples.
--
-- Aurora DSQL limits each transaction to 3,000 row mutations, so we insert
-- in batches of 1,000 rows. Run each INSERT as a separate transaction.
-- =============================================================================

-- Drop the table if it already exists
DROP TABLE IF EXISTS batch_test;

-- Create the sample table.
-- Uses UUID primary key with gen_random_uuid() to minimize OCC contention,
-- following Aurora DSQL best practice of random keys.
CREATE TABLE batch_test (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    value NUMERIC(10,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create an asynchronous index on the category column.
-- Aurora DSQL requires CREATE INDEX ASYNC for tables with existing rows.
CREATE INDEX ASYNC idx_batch_test_category ON batch_test (category);

-- =============================================================================
-- Populate the table with 5,000 rows of test data.
-- Each INSERT is 1,000 rows — run each as a separate transaction.
-- =============================================================================

-- Batch 1: rows 1–1,000
INSERT INTO batch_test (category, status, value)
SELECT
    (ARRAY['electronics', 'clothing', 'food', 'books', 'toys'])[floor(random() * 5 + 1)],
    'active',
    round((random() * 1000)::numeric, 2)
FROM generate_series(1, 1000);

-- Batch 2: rows 1,001–2,000
INSERT INTO batch_test (category, status, value)
SELECT
    (ARRAY['electronics', 'clothing', 'food', 'books', 'toys'])[floor(random() * 5 + 1)],
    'active',
    round((random() * 1000)::numeric, 2)
FROM generate_series(1, 1000);

-- Batch 3: rows 2,001–3,000
INSERT INTO batch_test (category, status, value)
SELECT
    (ARRAY['electronics', 'clothing', 'food', 'books', 'toys'])[floor(random() * 5 + 1)],
    'active',
    round((random() * 1000)::numeric, 2)
FROM generate_series(1, 1000);

-- Batch 4: rows 3,001–4,000
INSERT INTO batch_test (category, status, value)
SELECT
    (ARRAY['electronics', 'clothing', 'food', 'books', 'toys'])[floor(random() * 5 + 1)],
    'active',
    round((random() * 1000)::numeric, 2)
FROM generate_series(1, 1000);

-- Batch 5: rows 4,001–5,000
INSERT INTO batch_test (category, status, value)
SELECT
    (ARRAY['electronics', 'clothing', 'food', 'books', 'toys'])[floor(random() * 5 + 1)],
    'active',
    round((random() * 1000)::numeric, 2)
FROM generate_series(1, 1000);
