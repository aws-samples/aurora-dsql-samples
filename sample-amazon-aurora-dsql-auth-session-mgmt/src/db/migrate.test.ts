import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runMigrations, PoolLike, ClientLike } from './migrate';

// ---------------------------------------------------------------------------
// Helpers — lightweight mock pool and client
// ---------------------------------------------------------------------------

/**
 * Creates a mock client that records every SQL statement it receives.
 * Optionally accepts a callback that can throw to simulate failures.
 */
function createMockClient(
  onQuery?: (sql: string) => void
): ClientLike & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      onQuery?.(sql);
    }),
    release: vi.fn(),
  };
}

/**
 * Creates a mock pool that returns a fresh mock client for each `connect()`
 * call. Returns the pool and an array of all clients it has handed out.
 */
function createMockPool(): {
  pool: PoolLike;
  clients: ReturnType<typeof createMockClient>[];
} {
  const clients: ReturnType<typeof createMockClient>[] = [];
  const pool: PoolLike = {
    connect: vi.fn(async () => {
      const client = createMockClient();
      clients.push(client);
      return client;
    }),
  };
  return { pool, clients };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runMigrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------------------

  it('executes each DDL statement in its own transaction', async () => {
    const { pool, clients } = createMockPool();

    await runMigrations(pool);

    // We expect 3 separate transactions: users table, sessions table,
    // and the user_id index. The token_hash UNIQUE constraint already
    // creates a backing index, so we deliberately do NOT add a second.
    expect(clients).toHaveLength(3);

    // Each client should have received BEGIN → DDL → COMMIT
    for (const client of clients) {
      expect(client.queries[0]).toBe('BEGIN');
      expect(client.queries[2]).toBe('COMMIT');
      expect(client.queries).toHaveLength(3);
    }
  });

  it('creates the users table first', async () => {
    const { pool, clients } = createMockPool();

    await runMigrations(pool);

    const ddl = clients[0].queries[1];
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS users');
    expect(ddl).toContain('id UUID PRIMARY KEY');
    expect(ddl).toContain('email VARCHAR(254) NOT NULL UNIQUE');
    expect(ddl).toContain('password_hash VARCHAR(72) NOT NULL');
    expect(ddl).toContain('created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()');
  });

  it('creates the sessions table second', async () => {
    const { pool, clients } = createMockPool();

    await runMigrations(pool);

    const ddl = clients[1].queries[1];
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS sessions');
    expect(ddl).toContain('id UUID PRIMARY KEY');
    expect(ddl).toContain('user_id UUID NOT NULL');
    expect(ddl).toContain('token_hash VARCHAR(64) NOT NULL UNIQUE');
    expect(ddl).toContain('expires_at TIMESTAMPTZ NOT NULL');
    expect(ddl).toContain('revoked_at TIMESTAMPTZ');
    expect(ddl).toContain('client_metadata JSONB');
  });

  it('creates the user_id index third', async () => {
    const { pool, clients } = createMockPool();

    await runMigrations(pool);

    const ddl = clients[2].queries[1];
    expect(ddl).toContain('CREATE INDEX ASYNC IF NOT EXISTS idx_sessions_user_id');
    expect(ddl).toContain('ON sessions (user_id)');
  });

  it('does not add a redundant token_hash index (UNIQUE constraint already creates one)', async () => {
    const { pool, clients } = createMockPool();

    await runMigrations(pool);

    const allDdl = clients.map((c) => c.queries[1]).join('\n');
    expect(allDdl).not.toContain('idx_sessions_token_hash');
    expect(allDdl).not.toMatch(/CREATE INDEX[^\n]*ON sessions \(token_hash\)/);
  });

  it('releases every client back to the pool', async () => {
    const { pool, clients } = createMockPool();

    await runMigrations(pool);

    for (const client of clients) {
      expect(client.release).toHaveBeenCalledTimes(1);
    }
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  it('rolls back and re-throws when a DDL statement fails', async () => {
    const ddlError = new Error('relation already exists');
    let callCount = 0;

    const failingPool: PoolLike = {
      connect: vi.fn(async () => {
        callCount++;
        // Fail on the second DDL (sessions table)
        if (callCount === 2) {
          return createMockClient((sql) => {
            if (sql !== 'BEGIN' && sql !== 'ROLLBACK') {
              throw ddlError;
            }
          });
        }
        return createMockClient();
      }),
    };

    await expect(runMigrations(failingPool)).rejects.toThrow(
      'relation already exists'
    );
  });

  it('rolls back the transaction on failure before releasing the client', async () => {
    const ddlError = new Error('syntax error');
    const failingClient = createMockClient((sql) => {
      if (sql !== 'BEGIN' && sql !== 'ROLLBACK') {
        throw ddlError;
      }
    });

    const failingPool: PoolLike = {
      connect: vi.fn(async () => failingClient),
    };

    await expect(runMigrations(failingPool)).rejects.toThrow('syntax error');

    // Should have attempted ROLLBACK after the failure
    expect(failingClient.queries).toContain('ROLLBACK');
    // Client must still be released even after an error
    expect(failingClient.release).toHaveBeenCalledTimes(1);
  });
});
