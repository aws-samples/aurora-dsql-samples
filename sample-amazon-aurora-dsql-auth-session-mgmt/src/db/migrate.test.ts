import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runMigrations, PoolLike, ClientLike } from './migrate';

// ---------------------------------------------------------------------------
// Helpers — lightweight mock pool and client
// ---------------------------------------------------------------------------

/**
 * Creates a mock client that records every SQL statement it receives.
 *
 * Returns `{ rows: [{ job_id: 'fake-job-id' }] }` for `CREATE INDEX ASYNC`
 * statements (matching the real DSQL behaviour that returns a job_id row),
 * and `{ rows: [] }` for everything else. Tests that need a different shape
 * can pass a custom `onQuery` to override.
 */
function createMockClient(
  onQuery?: (sql: string) => void,
): ClientLike & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    query: vi.fn(async (sql: string, _params?: unknown[]) => {
      queries.push(sql);
      onQuery?.(sql);
      if (sql.startsWith('CREATE INDEX ASYNC')) {
        return { rows: [{ job_id: 'fake-job-id' }] };
      }
      return { rows: [] };
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

    // 3 DDL transactions and one async-job wait.
    expect(clients).toHaveLength(4);

    // The table and index clients ran BEGIN → DDL → COMMIT.
    for (const client of [clients[0], clients[1], clients[2]]) {
      expect(client.queries[0]).toBe('BEGIN');
      expect(client.queries[2]).toBe('COMMIT');
      expect(client.queries).toHaveLength(3);
    }

    expect(clients[3].queries).toEqual(['CALL sys.wait_for_job($1)']);
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
    expect(ddl).toContain('client_metadata TEXT');
    expect(ddl).toContain('FOREIGN KEY (user_id)');
    expect(ddl).toContain('REFERENCES users(id)');
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

    const allDdl = [clients[0], clients[1], clients[2]]
      .map((c) => c.queries[1])
      .join('\n');
    expect(allDdl).not.toContain('idx_sessions_token_hash');
    expect(allDdl).not.toMatch(/CREATE INDEX[^\n]*ON sessions \(token_hash\)/);
  });

  it('waits for the async index job to complete', async () => {
    const { pool, clients } = createMockPool();

    await runMigrations(pool);

    expect(clients[3].query).toHaveBeenCalledWith(
      'CALL sys.wait_for_job($1)',
      ['fake-job-id'],
    );
  });

  it('skips the index wait when waitForAsyncJobs is false', async () => {
    const { pool, clients } = createMockPool();

    await runMigrations(pool, { waitForAsyncJobs: false });

    expect(clients).toHaveLength(3);
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

  it('rolls back the transaction when a DDL statement fails', async () => {
    const clients: ReturnType<typeof createMockClient>[] = [];
    const pool: PoolLike = {
      connect: vi.fn(async () => {
        const indexBeingCreated = clients.length; // 0,1,2,...
        const client = createMockClient((sql) => {
          // Throw on the second client's DDL (the sessions table CREATE)
          if (indexBeingCreated === 1 && sql.startsWith('CREATE TABLE')) {
            throw new Error('simulated DDL failure');
          }
        });
        clients.push(client);
        return client;
      }),
    };

    await expect(runMigrations(pool)).rejects.toThrow('simulated DDL failure');

    // Second client should have run BEGIN, attempted DDL, and ROLLBACK.
    const secondClient = clients[1];
    expect(secondClient.queries).toContain('BEGIN');
    expect(secondClient.queries).toContain('ROLLBACK');
  });

  it('still releases the client when the DDL fails', async () => {
    const clients: ReturnType<typeof createMockClient>[] = [];
    const pool: PoolLike = {
      connect: vi.fn(async () => {
        const indexBeingCreated = clients.length;
        const client = createMockClient((sql) => {
          // Fail the very first DDL (users table CREATE)
          if (indexBeingCreated === 0 && sql.startsWith('CREATE TABLE')) {
            throw new Error('simulated failure');
          }
        });
        clients.push(client);
        return client;
      }),
    };

    await expect(runMigrations(pool)).rejects.toThrow('simulated failure');

    expect(clients[0].release).toHaveBeenCalledTimes(1);
  });
});
