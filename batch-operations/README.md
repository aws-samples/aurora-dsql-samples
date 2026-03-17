# Aurora DSQL Batch Operations

Code examples demonstrating how to perform batch DELETE and UPDATE operations in
[Amazon Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/) when working with
datasets exceeding the 3,000-row transaction mutation limit.

## How this section is organized

| Language | Client | Directory |
|----------|--------|-----------|
| Java | pgJDBC + AWS JDBC Wrapper | [java/pgjdbc](java/pgjdbc) |
| JavaScript | node-postgres | [javascript/node-postgres](javascript/node-postgres) |
| Python | psycopg2 | [python/psycopg2](python/psycopg2) |

Shared resources:

| Resource | Path | Description |
|----------|------|-------------|
| SQL setup | [sql/batch_test_setup.sql](sql/batch_test_setup.sql) | Creates and populates the test table |

## Patterns

Each language example includes two patterns:

1. **Sequential batch processing** — A single-threaded loop that processes rows in batches of 1,000
   (configurable), committing each batch as a separate transaction.

2. **Parallel batch processing** — Multiple worker threads partition rows using
   `abs(hashtext(id::text)) % num_workers` and process their partitions concurrently. Each worker
   runs its own sequential batch loop.

Both patterns include OCC (Optimistic Concurrency Control) retry logic with exponential backoff
for handling serialization conflicts (SQLSTATE 40001).

## Key concepts

- **3,000-row transaction limit**: Aurora DSQL limits each transaction to 3,000 row mutations,
  regardless of how many indexes are defined on the table.
- **Batch size**: Default 1,000 rows per transaction, providing a safe margin below the limit.
- **hashtext() partitioning**: Parallel workers use `abs(hashtext(id::text)) % num_workers` to
  ensure each worker operates on a disjoint set of rows, avoiding OCC conflicts between workers.
- **Connection pooling**: All examples use DSQL connectors that automatically refresh IAM auth
  tokens, important for long-running batch jobs.

## Security

See [CONTRIBUTING](https://github.com/aws-samples/aurora-dsql-samples/blob/main/CONTRIBUTING.md)
for more information.

## License

This project is licensed under the MIT-0 License.
