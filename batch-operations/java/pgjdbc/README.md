# Batch Operations with pgJDBC

## Overview

This code example demonstrates how to perform batch DELETE and UPDATE operations in Amazon Aurora DSQL
when working with datasets exceeding the 3,000-row transaction mutation limit. The example uses
[pgJDBC](https://jdbc.postgresql.org/) with the
[Aurora DSQL JDBC Connector](https://github.com/awslabs/aurora-dsql-java-connector) for automatic
IAM authentication via the AWS JDBC Wrapper.

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
`abs(hashtext(CAST(id AS text))) % num_workers = worker_id`, ensuring workers operate on disjoint sets
of rows and avoid OCC conflicts with each other.

⚠️ **Important**

- Running this code might result in charges to your AWS account.
- Each batch is a separate transaction. A failure mid-way leaves the dataset partially modified.
  Design your operations to be idempotent where possible.

## Prerequisites

- You must have an AWS account, and have your default credentials and AWS Region configured as described
  in the [Globally configuring AWS SDKs and tools](https://docs.aws.amazon.com/sdkref/latest/guide/creds-config-files.html) guide.
- Java Development Kit (JDK) 17 or later.
- Gradle (the wrapper is included in this project).
- You must have an Aurora DSQL cluster. For information about creating a cluster, see the
  [Getting started with Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html) guide.

## Set up the test table

Before running the examples, create and populate the test table:

```bash
export CLUSTER_ENDPOINT="<your-cluster-endpoint>"
psql "host=$CLUSTER_ENDPOINT dbname=postgres user=admin sslmode=verify-full" \
  -f ../../sql/batch_test_setup.sql
```

## Run the example

Set environment variables for your cluster:

```bash
# e.g. "admin"
export CLUSTER_USER="admin"

# e.g. "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws"
export CLUSTER_ENDPOINT="<your-cluster-endpoint>"
```

Build and run:

```bash
./gradlew run --args="--endpoint $CLUSTER_ENDPOINT --user $CLUSTER_USER"
```

### Command-line options

| Option | Default | Description |
|--------|---------|-------------|
| `--endpoint` | (required) | Aurora DSQL cluster endpoint |
| `--user` | `admin` | Database user |
| `--batch-size` | `1000` | Rows per batch transaction (must be < 3000) |
| `--num-workers` | `4` | Number of parallel worker threads |

## Additional resources

- [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/)
- [Aurora DSQL JDBC Connector](https://github.com/awslabs/aurora-dsql-java-connector)
- [pgJDBC Documentation](https://jdbc.postgresql.org/documentation/)

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
