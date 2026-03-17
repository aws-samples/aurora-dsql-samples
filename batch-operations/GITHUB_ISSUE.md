**Title:** Add batch DELETE/UPDATE code samples for datasets exceeding 3,000-row transaction limit

**Description:**

Aurora DSQL limits each transaction to 3,000 row mutations. This is a common stumbling block for users who need to DELETE or UPDATE large datasets. I'd like to contribute code samples that demonstrate how to handle this across Python, Java, and JavaScript.

**What the samples cover:**

Two patterns, each implemented in all three languages:

1. **Sequential batch processing** — single-threaded loop that processes rows in batches of N (default 1,000), committing each batch as a separate transaction
2. **Parallel batch processing** — multiple worker threads partition rows using `abs(hashtext(id::text)) % num_workers` and process their partitions concurrently, each running its own batch loop

Both patterns include:
- OCC retry logic with exponential backoff (SQLSTATE 40001 handling)
- Connection pooling using the DSQL connectors (auto IAM token refresh)
- Subquery-based DELETE (`DELETE WHERE id IN (SELECT id ... LIMIT N)`) since PostgreSQL doesn't support `DELETE ... LIMIT`
- Subquery-based UPDATE with `updated_at` tracking to prevent reprocessing
- Table repopulation between DELETE and UPDATE demos
- CLI entry point with configurable batch size and worker count

**Languages and drivers:**

| Language | Driver | Connector |
|----------|--------|-----------|
| Python | psycopg2 | `aurora-dsql-python-connector` (`AuroraDSQLThreadedConnectionPool`) |
| Java | pgJDBC | AWS JDBC Wrapper (`AwsWrapperDataSource`) |
| JavaScript | node-postgres | `@aws/aurora-dsql-node-postgres-connector` |

**Files per language:**
- OCC retry module (reusable)
- Sequential batch DELETE
- Sequential batch UPDATE
- Parallel batch DELETE (hashtext partitioning)
- Parallel batch UPDATE (hashtext partitioning)
- Repopulate helper (restores test data between demos)
- Main entry point with CLI args
- README with prerequisites, setup, and usage instructions

**Shared:**
- SQL setup script (creates `batch_test` table, inserts 5,000 rows in batches of 1,000)

**Proposed structure:**

I have this organized as a `batch-operations/` top-level directory following the existing repo conventions (`language/driver/src/`). Happy to restructure if you'd prefer these integrated differently — for example, as additional files within the existing `python/psycopg2/`, `java/pgjdbc/`, and `javascript/node-postgres/` directories.

```
batch-operations/
├── README.md
├── sql/batch_test_setup.sql
├── python/psycopg2/
│   ├── README.md
│   ├── requirements.txt
│   └── src/
├── javascript/node-postgres/
│   ├── README.md
│   ├── package.json
│   └── src/
└── java/pgjdbc/
    ├── README.md
    ├── build.gradle
    └── src/main/java/...
```

**Tested against:** Aurora DSQL cluster in us-east-1 with the Python implementation. All seven operations (sequential delete, repopulate, sequential update, repopulate, parallel delete, repopulate, parallel update) complete successfully.

The parallel pattern is inspired by the [re:Invent DAT401 parallel worker approach](https://github.com/marcbowes/riv25-codetalk/).

Happy to adjust structure, naming, or scope based on your feedback.
