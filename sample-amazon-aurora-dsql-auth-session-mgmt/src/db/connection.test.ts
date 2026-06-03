import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// We mock the DSQL connector so tests don't need real AWS credentials or a
// live cluster. The mock verifies that the pool is created with the correct
// configuration and that lifecycle methods behave as expected.
// ---------------------------------------------------------------------------

const mockEnd = vi.fn().mockResolvedValue(undefined);

// Track constructor calls manually so we can assert on the config passed in.
const constructorCalls: unknown[] = [];

vi.mock('@aws/aurora-dsql-node-postgres-connector', () => {
  class MockAuroraDSQLPool {
    end = mockEnd;
    constructor(config: unknown) {
      constructorCalls.push(config);
    }
  }
  return { AuroraDSQLPool: MockAuroraDSQLPool };
});

// Import *after* the mock is in place so the module picks up the stub.
import { getPool, closePool } from './connection';

describe('DSQL Connection Pool', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(async () => {
    // Reset the singleton between tests by closing any existing pool
    await closePool();

    // Isolate environment changes per test
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
    constructorCalls.length = 0;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  // -----------------------------------------------------------------------
  // getPool()
  // -----------------------------------------------------------------------

  it('throws when DSQL_ENDPOINT is not set', () => {
    delete process.env.DSQL_ENDPOINT;

    expect(() => getPool()).toThrow(
      'DSQL_ENDPOINT environment variable is required but not set'
    );
  });

  it('creates a pool with the correct configuration', () => {
    process.env.DSQL_ENDPOINT = 'my-cluster.dsql.us-east-1.on.aws';

    const pool = getPool();

    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0]).toEqual({
      host: 'my-cluster.dsql.us-east-1.on.aws',
      user: 'admin',
      database: 'postgres',
      max: 10,
      idleTimeoutMillis: 300_000,
    });
    expect(pool).toBeDefined();
  });

  it('returns the same pool instance on subsequent calls', () => {
    process.env.DSQL_ENDPOINT = 'my-cluster.dsql.us-east-1.on.aws';

    const first = getPool();
    const second = getPool();

    expect(first).toBe(second);
    // Constructor should only be called once (singleton)
    expect(constructorCalls).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // closePool()
  // -----------------------------------------------------------------------

  it('calls end() on the pool when closing', async () => {
    process.env.DSQL_ENDPOINT = 'my-cluster.dsql.us-east-1.on.aws';

    getPool();
    await closePool();

    expect(mockEnd).toHaveBeenCalledTimes(1);
  });

  it('is safe to call closePool() multiple times', async () => {
    process.env.DSQL_ENDPOINT = 'my-cluster.dsql.us-east-1.on.aws';

    getPool();
    await closePool();
    await closePool();

    // end() should only be called once — the second close is a no-op
    expect(mockEnd).toHaveBeenCalledTimes(1);
  });

  it('allows creating a new pool after closing the previous one', async () => {
    process.env.DSQL_ENDPOINT = 'my-cluster.dsql.us-east-1.on.aws';

    const first = getPool();
    await closePool();

    const second = getPool();

    expect(first).not.toBe(second);
    expect(constructorCalls).toHaveLength(2);
  });
});
