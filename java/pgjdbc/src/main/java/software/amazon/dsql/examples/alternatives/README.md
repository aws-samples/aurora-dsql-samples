# Alternative Examples

The recommended approach is `ExamplePreferred.java` in the parent directory, which uses HikariCP connection pool with the Aurora DSQL JDBC Connector.

## Why Connection Pooling with the Connector?

Aurora DSQL has specific connection characteristics:
- **60-minute max connection lifetime** - connections are terminated after 1 hour
- **15-minute token expiry** - IAM auth tokens must be refreshed
- **Optimized for concurrency** - more concurrent connections with smaller batches yields better throughput

The connector + pool combination handles this automatically:
- Generates fresh IAM tokens per connection
- Recycles connections before the 60-minute limit (via `maxLifetime < 3600000`)
- Reuses warmed connections for better performance

## Alternatives

### `no_connection_pool/`
Examples without pooling:
- `ExampleWithNoConnectionPool.java` - Single connection with connector
- `ExampleWithNoConnector.java` - Single connection without connector (uses AWS SDK directly)
