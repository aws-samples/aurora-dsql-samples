# Inventory API — Aurora DSQL EF Core Example

Minimal API demonstrating EF Core CRUD, OCC retry, batch operations,
navigation properties, and migrations against Aurora DSQL. The adapter
handles IAM authentication and transaction management transparently.

## Prerequisites

- .NET 8.0 SDK
- Aurora DSQL cluster
- AWS credentials configured (env vars, profile, or IAM role)

## Run

```bash
export CLUSTER_ENDPOINT="your-cluster.dsql.us-east-1.on.aws"
dotnet run --project dotnet/ef-core/examples/InventoryApi/
```

The app applies pending migrations at startup via `MigrateAsync()`.

## Run Integration Tests

```bash
export CLUSTER_ENDPOINT="your-cluster.dsql.us-east-1.on.aws"
dotnet test dotnet/ef-core/examples/InventoryApi.IntegrationTests/
```

## Migrations Workflow

```bash
# Add a new migration after modifying models
dotnet ef migrations add <MigrationName> --output-dir Migrations

# Apply migrations to DSQL
dotnet ef database update

# View migration status
dotnet ef migrations list
```

The adapter's `DsqlMigrator` automatically:
- Transforms DSQL-incompatible SQL (e.g. `CREATE INDEX` → `CREATE INDEX ASYNC`)
- Adds `IF NOT EXISTS` to CREATE TABLE/INDEX statements for idempotency
- Suppresses per-migration transactions (DSQL allows only one DDL per transaction)

## Endpoints

```bash
# Create products (batch insert)
curl -X POST http://localhost:5000/products \
  -H "Content-Type: application/json" \
  -d '[{"name": "Laptop", "price": 999.99, "stock": 50},
       {"name": "Mouse", "price": 29.99, "stock": 200}]'

# List products (filtering + pagination)
curl "http://localhost:5000/products?name=Lap&page=1&pageSize=5"

# Get product
curl http://localhost:5000/products/<id>

# Place order (transaction with stock check)
curl -X POST http://localhost:5000/orders \
  -H "Content-Type: application/json" \
  -d '{"items": [{"productId": "<id>", "quantity": 2}]}'

# Get order with items (Include/ThenInclude navigation)
curl http://localhost:5000/orders/<id>
```
