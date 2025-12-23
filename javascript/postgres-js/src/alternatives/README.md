# Alternative Examples

The recommended approach is `example_preferred.js` in the parent directory, which uses a concurrent connection pool with the Aurora DSQL connector.

## Why Connection Pooling with the Connector?

Aurora DSQL has specific connection characteristics:
- **60-minute max connection lifetime** - connections are terminated after 1 hour
- **15-minute token expiry** - IAM auth tokens must be refreshed
- **Optimized for concurrency** - more concurrent connections with smaller batches yields better throughput

The connector + pool combination handles this automatically:
- Generates fresh IAM tokens per connection
- Recycles connections before the 60-minute limit
- Reuses warmed connections (2-24ms faster than new connections)

## Alternatives

### `no_connection_pool/`
Examples without pooling:
- `example_with_no_connection_pool.js` - Single connection with connector
- `example_with_no_connector.js` - SDK-only, for environments where the connector cannot be used (requires manual token management)
