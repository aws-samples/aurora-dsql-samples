# Alternative Examples

The recommended approach is `example_preferred.py` in the parent directory, which uses asyncpg connection pool with the Aurora DSQL Python Connector.

## Why Connection Pooling with the Connector?

Aurora DSQL has specific connection characteristics:
- **60-minute max connection lifetime** - connections are terminated after 1 hour
- **15-minute token expiry** - IAM auth tokens must be refreshed
- **Optimized for concurrency** - more concurrent connections with smaller batches yields better throughput

The connector + pool combination handles this automatically:
- Generates fresh IAM tokens per connection
- Recycles connections before the 60-minute limit
- Reuses warmed connections for better performance

## Alternatives

### `pool/`
Other pool configurations:
- `example_with_async_connection_pool.py` - Async pool usage
- `example_with_nonconcurrent_connection_pool.py` - Sequential pool usage

### `no_connection_pool/`
Examples without pooling:
- `example_with_no_connection_pool.py` - Single connection with connector
- `example_async_with_no_connection_pool.py` - Async single connection with connector
