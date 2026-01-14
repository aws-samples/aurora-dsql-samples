# Alternative Examples

These examples show alternative approaches to connecting to Aurora DSQL when the standard connector doesn't meet your needs.

## When to Use Alternatives

Use the [preferred example](../example_preferred.go) unless you have specific requirements:

| Alternative | Use When |
|-------------|----------|
| [manual_token](./manual_token/) | You need custom token generation logic, non-standard authentication flows, or want to understand the underlying mechanism |

## Additional Examples

Beyond the preferred example and alternatives, these examples demonstrate specific DSQL patterns:

| Example | Description |
|---------|-------------|
| [transaction](../transaction/) | Transaction handling with BEGIN/COMMIT/ROLLBACK |
| [occ_retry](../occ_retry/) | Handling OCC conflicts with exponential backoff |
| [connection_string](../connection_string/) | Using connection strings instead of Config struct |

## Running Examples

Each example has its own directory with source code and tests:

```bash
# Run a specific example
cd /path/to/dsql-pgx-connector/example
export CLUSTER_ENDPOINT=your-cluster.dsql.us-east-1.on.aws
go run ./src/transaction/...

# Run tests
go test ./test/transaction/... -v
```

## DSQL Best Practices

All examples follow DSQL best practices. See the [main README](../../../README.md#dsql-best-practices) for the complete list.
