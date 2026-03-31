# Batch Operations with psycopg2

## Overview

This code example demonstrates how to perform batch DELETE and UPDATE operations in Amazon Aurora DSQL
when working with datasets exceeding the 3,000-row transaction mutation limit. The example uses
[psycopg2](https://www.psycopg.org/docs/) with the
[Aurora DSQL Python Connector](https://github.com/awslabs/aurora-dsql-python-connector) for automatic
IAM authentication, and connection pooling.

Two patterns are provided:

- **Sequential**: A single-threaded loop that processes rows in configurable-size batches (default 1,000),
  committing each batch as a separate transaction.
- **Parallel**: Multiple worker threads each process a disjoint partition of the dataset concurrently using
  `hashtext()` partitioning, with each worker running its own batch loop.

Both patterns include OCC (Optimistic Concurrency Control) retry logic with exponential backoff.

## About the code example

Aurora DSQL limits each transaction to 3,000 row mutations. To DELETE or UPDATE more than 3,000 rows,
you must split the work into batches, each committed as a separate transaction.

The parallel pattern partitions rows across worker threads using
`abs(hashtext(id::text)) % num_workers = worker_id`, ensuring workers operate on disjoint sets of rows
and avoid OCC conflicts with each other.

Connection pooling uses `AuroraDSQLThreadedConnectionPool` from the Aurora DSQL Python Connector, which
automatically handles IAM token refresh for long-running batch jobs.

⚠️ **Important**

- Running this code might result in charges to your AWS account.
- Each batch is a separate transaction. A failure mid-way leaves the dataset partially modified.
  Design your operations to be idempotent where possible.

## Prerequisites

- You must have an AWS account, and have your default credentials and AWS Region configured as described
  in the [Globally configuring AWS SDKs and tools](https://docs.aws.amazon.com/sdkref/latest/guide/creds-config-files.html) guide.
- Python 3.8 or later.
- You must have an Aurora DSQL cluster. For information about creating a cluster, see the
  [Getting started with Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html) guide.

## Set up

Create and activate a Python virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Install the required packages:

```bash
pip install -r requirements.txt
```

## Set up the test table

Before running the examples, create and populate the test table. Run each INSERT as a separate
transaction (each block of 1,000 rows). Aurora DSQL uses IAM authentication, so you need to
generate a fresh auth token each time you connect with `psql`:

```bash
export CLUSTER_ENDPOINT="<your-cluster-endpoint>"
export CLUSTER_REGION="<your-region>"

# Generate a fresh auth token (expires in 3600 seconds)
export PGPASSWORD=$(aws dsql generate-db-connect-admin-auth-token \
  --hostname $CLUSTER_ENDPOINT \
  --region $CLUSTER_REGION \
  --expires-in 3600)

psql "host=$CLUSTER_ENDPOINT dbname=postgres user=admin sslmode=verify-full sslrootcert=system" \
  -f batch_test_setup.sql
```

## Run the example

Set environment variables for your cluster:

```bash
# e.g. "admin"
export CLUSTER_USER="admin"

# e.g. "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws"
export CLUSTER_ENDPOINT="<your-cluster-endpoint>"
```

Run the demo:

```bash
python src/main.py --endpoint "$CLUSTER_ENDPOINT" --user "$CLUSTER_USER"
```

### Command-line options

| Option | Default | Description |
|--------|---------|-------------|
| `--endpoint` | (required) | Aurora DSQL cluster endpoint |
| `--user` | `admin` | Database user |
| `--batch-size` | `1000` | Rows per batch transaction (must be < 3000) |
| `--num-workers` | `4` | Number of parallel worker threads |

The demo runs the following sequence:

1. Sequential batch DELETE (all `electronics` rows)
2. Sequential batch UPDATE (`clothing` → `processed`)
3. Parallel batch DELETE (all `food` rows) with N workers
4. Parallel batch UPDATE (`books` → `archived`) with N workers

## Clean up

After running the demo, drop the test table to avoid unnecessary storage:

```bash
# Generate a fresh token if the previous one expired
export PGPASSWORD=$(aws dsql generate-db-connect-admin-auth-token \
  --hostname $CLUSTER_ENDPOINT \
  --region $CLUSTER_REGION \
  --expires-in 3600)

psql "host=$CLUSTER_ENDPOINT dbname=postgres user=admin sslmode=verify-full sslrootcert=system" \
  -c "DROP TABLE IF EXISTS batch_test;"
```

## Additional resources

- [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/)
- [Aurora DSQL Python Connector](https://github.com/awslabs/aurora-dsql-python-connector)
- [Psycopg2 Documentation](https://www.psycopg.org/docs/)
- [Batch operations in Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/batch-operations.html)

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
