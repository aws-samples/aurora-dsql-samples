# Manual Token Generation Example

This example demonstrates manual IAM token generation for Aurora DSQL connections using the `pgx` driver.

## Required Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `CLUSTER_ENDPOINT` | Aurora DSQL cluster endpoint | Yes |
| `CLUSTER_USER` | Database user (`admin` or custom user) | Yes |
| `REGION` | AWS region (e.g., `us-east-1`) | Yes |
| `DB_PORT` | Database port (default: `5432`) | No |
| `DB_NAME` | Database name (default: `postgres`) | No |
| `TOKEN_EXPIRY_SECS` | Token expiry in seconds (default: `30`) | No |

## Running the Example

```bash
export CLUSTER_ENDPOINT="your-cluster.dsql.us-east-1.on.aws"
export CLUSTER_USER="admin"
export REGION="us-east-1"

go run example.go
```

## When to Use Manual Token Generation

Use this approach when you need:

- **Custom token generation logic**: Implement custom caching, refresh strategies, or token lifecycle management.
- **Non-standard authentication flows**: Integrate with custom credential providers or assume roles with specific configurations.
- **Understanding the mechanism**: Learn how IAM authentication works under the hood before using higher-level abstractions.
- **Fine-grained control**: Customize token expiry, handle token generation errors differently, or implement retry logic.

## Key Differences from Preferred Approach

| Aspect | Manual Token (this example) | Preferred (`dsql-connector`) |
|--------|----------------------------|------------------------------|
| Token generation | Explicit in `BeforeConnect` callback | Handled automatically by connector |
| Configuration | Build connection URL manually | Use connector's configuration options |
| Maintenance | More code to maintain | Less boilerplate, maintained by AWS |
| Flexibility | Full control over token lifecycle | Opinionated but sufficient for most cases |

For most production applications, prefer the `dsql-connector` approach as it reduces boilerplate and follows AWS best practices. Use manual token generation only when you have specific requirements that the connector cannot satisfy.
