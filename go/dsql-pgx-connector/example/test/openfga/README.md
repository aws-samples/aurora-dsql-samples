# OpenFGA DSQL Integration Tests

This directory contains integration tests that validate the DSQL connector works with OpenFGA.

## Tests

- `TestOpenFGASchemaSetup` - Creates the OpenFGA schema with DSQL-compatible indexes
- `TestOpenFGABasicOperations` - Tests CRUD operations on OpenFGA tables
- `TestOpenFGAWithConnectionString` - Tests the `dsql://` connection string format
- `TestDSQLTokenGeneration` - Tests IAM token generation for migrations

## Running Locally

```bash
export CLUSTER_ENDPOINT="your-cluster.dsql.us-east-1.on.aws"
go test -v ./...
```

## CI

The tests are run as part of the `go-openfga-integ-tests.yml` workflow.
