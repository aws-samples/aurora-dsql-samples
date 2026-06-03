import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createSessionRepository,
  PoolLike,
  ClientLike,
} from './sessionRepository';
import { InvalidSessionError } from '../utils/errors';

// ---------------------------------------------------------------------------
// Helpers — lightweight mock pool and client
// ---------------------------------------------------------------------------

/**
 * Creates a mock client that records queries and returns configurable results.
 *
 * The `queryResponses` map allows different SQL patterns to return different
 * results, which is essential for testing the referential integrity check
 * (SELECT on users) followed by the INSERT on sessions.
 */
function createMockClient(options?: {
  queryResponses?: Map<string, { rows: Record<string, unknown>[]; rowCount?: number }>;
  defaultRows?: Record<string, unknown>[];
  defaultRowCount?: number;
  onQuery?: (sql: string, params?: unknown[]) => void;
}): ClientLike & { queries: { sql: string; params?: unknown[] }[] } {
  const queries: { sql: string; params?: unknown[] }[] = [];
  return {
    queries,
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      options?.onQuery?.(sql, params);

      // Check for pattern-based responses
      if (options?.queryResponses) {
        for (const [pattern, response] of options.queryResponses) {
          if (sql.includes(pattern)) {
            return response;
          }
        }
      }

      return {
        rows: options?.defaultRows ?? [],
        rowCount: options?.defaultRowCount ?? 0,
      };
    }),
    release: vi.fn(),
  };
}

/**
 * Creates a mock pool that returns the provided client on every `connect()`.
 */
function createMockPool(client: ClientLike): PoolLike {
  return {
    connect: vi.fn(async () => client),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sessionRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------

  describe('create', () => {
    const validSession = {
      id: 'session-uuid-1',
      userId: 'user-uuid-1',
      tokenHash: 'abc123hash',
      expiresAt: new Date('2025-01-02T00:00:00Z'),
      clientMetadata: { userAgent: 'TestBrowser/1.0', ipAddress: '127.0.0.1' },
    };

    it('inserts a session when the referenced user exists', async () => {
      const responses = new Map<string, { rows: Record<string, unknown>[]; rowCount?: number }>();
      // User existence check returns a row
      responses.set('SELECT id FROM users', { rows: [{ id: 'user-uuid-1' }] });
      // INSERT succeeds
      responses.set('INSERT INTO sessions', { rows: [], rowCount: 1 });

      const client = createMockClient({ queryResponses: responses });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      await expect(repo.create(validSession)).resolves.toBeUndefined();
    });

    it('verifies user_id exists before inserting (application-level referential integrity)', async () => {
      const responses = new Map<string, { rows: Record<string, unknown>[]; rowCount?: number }>();
      responses.set('SELECT id FROM users', { rows: [{ id: 'user-uuid-1' }] });
      responses.set('INSERT INTO sessions', { rows: [], rowCount: 1 });

      const client = createMockClient({ queryResponses: responses });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      await repo.create(validSession);

      // The user check query should appear before the INSERT
      const userCheckIdx = client.queries.findIndex((q) =>
        q.sql.includes('SELECT id FROM users'),
      );
      const insertIdx = client.queries.findIndex((q) =>
        q.sql.includes('INSERT INTO sessions'),
      );
      expect(userCheckIdx).toBeGreaterThan(-1);
      expect(insertIdx).toBeGreaterThan(userCheckIdx);
    });

    it('throws InvalidSessionError when user_id does not exist', async () => {
      // User existence check returns no rows
      const responses = new Map<string, { rows: Record<string, unknown>[]; rowCount?: number }>();
      responses.set('SELECT id FROM users', { rows: [] });

      const client = createMockClient({ queryResponses: responses });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      await expect(repo.create(validSession)).rejects.toThrow(InvalidSessionError);
    });

    it('uses parameterized queries for the INSERT', async () => {
      const responses = new Map<string, { rows: Record<string, unknown>[]; rowCount?: number }>();
      responses.set('SELECT id FROM users', { rows: [{ id: 'user-uuid-1' }] });
      responses.set('INSERT INTO sessions', { rows: [], rowCount: 1 });

      const client = createMockClient({ queryResponses: responses });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      await repo.create(validSession);

      const insertQuery = client.queries.find((q) =>
        q.sql.includes('INSERT INTO sessions'),
      );
      expect(insertQuery).toBeDefined();
      expect(insertQuery!.params).toEqual([
        'session-uuid-1',
        'user-uuid-1',
        'abc123hash',
        validSession.expiresAt,
        JSON.stringify(validSession.clientMetadata),
      ]);
    });

    it('wraps the operation in a transaction (BEGIN / COMMIT)', async () => {
      const responses = new Map<string, { rows: Record<string, unknown>[]; rowCount?: number }>();
      responses.set('SELECT id FROM users', { rows: [{ id: 'user-uuid-1' }] });
      responses.set('INSERT INTO sessions', { rows: [], rowCount: 1 });

      const client = createMockClient({ queryResponses: responses });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      await repo.create(validSession);

      const sqls = client.queries.map((q) => q.sql);
      expect(sqls[0]).toBe('BEGIN');
      expect(sqls[sqls.length - 1]).toBe('COMMIT');
    });

    it('rolls back the transaction on error', async () => {
      const responses = new Map<string, { rows: Record<string, unknown>[]; rowCount?: number }>();
      responses.set('SELECT id FROM users', { rows: [] }); // triggers InvalidSessionError

      const client = createMockClient({ queryResponses: responses });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      await expect(repo.create(validSession)).rejects.toThrow();

      const sqls = client.queries.map((q) => q.sql);
      expect(sqls).toContain('ROLLBACK');
    });

    it('releases the client back to the pool on success', async () => {
      const responses = new Map<string, { rows: Record<string, unknown>[]; rowCount?: number }>();
      responses.set('SELECT id FROM users', { rows: [{ id: 'user-uuid-1' }] });
      responses.set('INSERT INTO sessions', { rows: [], rowCount: 1 });

      const client = createMockClient({ queryResponses: responses });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      await repo.create(validSession);

      expect(client.release).toHaveBeenCalledTimes(1);
    });

    it('releases the client back to the pool on error', async () => {
      const responses = new Map<string, { rows: Record<string, unknown>[]; rowCount?: number }>();
      responses.set('SELECT id FROM users', { rows: [] });

      const client = createMockClient({ queryResponses: responses });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      await expect(repo.create(validSession)).rejects.toThrow();

      expect(client.release).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // findByTokenHash
  // -----------------------------------------------------------------------

  describe('findByTokenHash', () => {
    it('returns the session when found', async () => {
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 86400000).toISOString();
      const client = createMockClient({
        defaultRows: [
          {
            id: 'session-1',
            userId: 'user-1',
            tokenHash: 'hash123',
            createdAt: now,
            expiresAt,
            revokedAt: null,
            clientMetadata: { userAgent: 'Chrome' },
          },
        ],
      });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      const session = await repo.findByTokenHash('hash123');

      expect(session).not.toBeNull();
      expect(session!.id).toBe('session-1');
      expect(session!.userId).toBe('user-1');
      expect(session!.tokenHash).toBe('hash123');
      expect(session!.createdAt).toBeInstanceOf(Date);
      expect(session!.expiresAt).toBeInstanceOf(Date);
      expect(session!.revokedAt).toBeNull();
      expect(session!.clientMetadata).toEqual({ userAgent: 'Chrome' });
    });

    it('returns null when no session matches', async () => {
      const client = createMockClient({ defaultRows: [] });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      const session = await repo.findByTokenHash('nonexistent');

      expect(session).toBeNull();
    });

    it('uses a parameterized query', async () => {
      const client = createMockClient({ defaultRows: [] });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      await repo.findByTokenHash('hash-abc');

      const selectQuery = client.queries.find((q) =>
        q.sql.includes('SELECT'),
      );
      expect(selectQuery).toBeDefined();
      expect(selectQuery!.params).toEqual(['hash-abc']);
    });

    it('parses TEXT-encoded client_metadata from a JSON string', async () => {
      const now = new Date().toISOString();
      const client = createMockClient({
        defaultRows: [
          {
            id: 'session-1',
            userId: 'user-1',
            tokenHash: 'hash123',
            createdAt: now,
            expiresAt: now,
            revokedAt: null,
            clientMetadata: '{"ipAddress":"10.0.0.1"}',
          },
        ],
      });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      const session = await repo.findByTokenHash('hash123');

      expect(session!.clientMetadata).toEqual({ ipAddress: '10.0.0.1' });
    });

    it('releases the client back to the pool', async () => {
      const client = createMockClient({ defaultRows: [] });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      await repo.findByTokenHash('hash-abc');

      expect(client.release).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // findActiveByUserId
  // -----------------------------------------------------------------------

  describe('findActiveByUserId', () => {
    it('returns active sessions for the user', async () => {
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 86400000).toISOString();
      const client = createMockClient({
        defaultRows: [
          {
            id: 'session-1',
            userId: 'user-1',
            tokenHash: 'hash1',
            createdAt: now,
            expiresAt,
            revokedAt: null,
            clientMetadata: {},
          },
          {
            id: 'session-2',
            userId: 'user-1',
            tokenHash: 'hash2',
            createdAt: now,
            expiresAt,
            revokedAt: null,
            clientMetadata: { userAgent: 'Firefox' },
          },
        ],
      });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      const sessions = await repo.findActiveByUserId('user-1');

      expect(sessions).toHaveLength(2);
      expect(sessions[0].id).toBe('session-1');
      expect(sessions[1].id).toBe('session-2');
    });

    it('returns an empty array when no active sessions exist', async () => {
      const client = createMockClient({ defaultRows: [] });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      const sessions = await repo.findActiveByUserId('user-no-sessions');

      expect(sessions).toEqual([]);
    });

    it('filters by user_id, non-revoked, and non-expired in the query', async () => {
      const client = createMockClient({ defaultRows: [] });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      await repo.findActiveByUserId('user-1');

      const selectQuery = client.queries.find((q) =>
        q.sql.includes('SELECT'),
      );
      expect(selectQuery).toBeDefined();
      expect(selectQuery!.sql).toContain('user_id = $1');
      expect(selectQuery!.sql).toContain('revoked_at IS NULL');
      expect(selectQuery!.sql).toContain('expires_at > NOW()');
      expect(selectQuery!.params).toEqual(['user-1']);
    });

    it('releases the client back to the pool', async () => {
      const client = createMockClient({ defaultRows: [] });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      await repo.findActiveByUserId('user-1');

      expect(client.release).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // revokeByIdForUser
  // -----------------------------------------------------------------------

  describe('revokeByIdForUser', () => {
    it('updates the session with a revoked_at timestamp scoped by both id and user_id', async () => {
      const client = createMockClient({ defaultRowCount: 1 });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      const result = await repo.revokeByIdForUser('user-1', 'session-1');

      const updateQuery = client.queries.find((q) =>
        q.sql.includes('UPDATE sessions'),
      );
      expect(updateQuery).toBeDefined();
      expect(updateQuery!.sql).toContain('SET revoked_at = NOW()');
      // Critical: the WHERE clause must filter by BOTH id AND user_id so a
      // user cannot revoke another user's session by guessing the id (IDOR).
      expect(updateQuery!.sql).toContain('id = $1');
      expect(updateQuery!.sql).toContain('user_id = $2');
      expect(updateQuery!.params).toEqual(['session-1', 'user-1']);
      expect(result).toBe(true);
    });

    it('returns false when the session id does not match the user (IDOR-prevention)', async () => {
      // The UPDATE matches zero rows because the session belongs to
      // someone else. The repository must surface this as `false` so the
      // service can throw InvalidSessionError without leaking that the
      // session does in fact exist.
      const client = createMockClient({ defaultRowCount: 0 });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      const result = await repo.revokeByIdForUser(
        'attacker-user',
        'victim-session-id',
      );

      expect(result).toBe(false);
    });

    it('returns false when the session is already revoked', async () => {
      const client = createMockClient({ defaultRowCount: 0 });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      const result = await repo.revokeByIdForUser('user-1', 'already-revoked');

      expect(result).toBe(false);
    });

    it('only revokes sessions that are not already revoked', async () => {
      const client = createMockClient({ defaultRowCount: 1 });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      await repo.revokeByIdForUser('user-1', 'session-1');

      const updateQuery = client.queries.find((q) =>
        q.sql.includes('UPDATE sessions'),
      );
      expect(updateQuery!.sql).toContain('revoked_at IS NULL');
    });

    it('wraps the operation in a transaction (BEGIN / COMMIT)', async () => {
      const client = createMockClient({ defaultRowCount: 1 });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      await repo.revokeByIdForUser('user-1', 'session-1');

      const sqls = client.queries.map((q) => q.sql);
      expect(sqls[0]).toBe('BEGIN');
      expect(sqls[sqls.length - 1]).toBe('COMMIT');
    });

    it('rolls back the transaction on error', async () => {
      const client = createMockClient({
        onQuery: (sql) => {
          if (sql.includes('UPDATE')) {
            throw new Error('db error');
          }
        },
      });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      await expect(
        repo.revokeByIdForUser('user-1', 'session-1'),
      ).rejects.toThrow('db error');

      const sqls = client.queries.map((q) => q.sql);
      expect(sqls).toContain('ROLLBACK');
    });

    it('releases the client back to the pool', async () => {
      const client = createMockClient({ defaultRowCount: 1 });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      await repo.revokeByIdForUser('user-1', 'session-1');

      expect(client.release).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // revokeAllByUserId
  // -----------------------------------------------------------------------

  describe('revokeAllByUserId', () => {
    it('revokes all active sessions for a user', async () => {
      const client = createMockClient({ defaultRowCount: 5 });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      const count = await repo.revokeAllByUserId('user-1');

      expect(count).toBe(5);
    });

    it('supports the excludeSessionId parameter', async () => {
      const client = createMockClient({ defaultRowCount: 4 });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      const count = await repo.revokeAllByUserId('user-1', 'keep-this-session');

      expect(count).toBe(4);

      const updateQuery = client.queries.find((q) =>
        q.sql.includes('UPDATE sessions'),
      );
      expect(updateQuery).toBeDefined();
      expect(updateQuery!.sql).toContain('id != $2');
      expect(updateQuery!.params).toContain('keep-this-session');
    });

    it('uses a LIMIT to respect the 3,000-row transaction cap', async () => {
      const client = createMockClient({ defaultRowCount: 100 });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      await repo.revokeAllByUserId('user-1');

      const updateQuery = client.queries.find((q) =>
        q.sql.includes('UPDATE sessions'),
      );
      expect(updateQuery).toBeDefined();
      expect(updateQuery!.sql).toContain('LIMIT');
      // The LIMIT parameter should be 3000
      expect(updateQuery!.params).toContain(3000);
    });

    it('batches revocations when rowCount equals the batch limit', async () => {
      // First batch returns exactly 3000 (the limit), second batch returns less
      let callCount = 0;
      const client = createMockClient({
        onQuery: () => {
          // no-op — we override the return via queryResponses
        },
      });

      // Override the query mock to return different rowCounts per batch
      const originalQuery = client.query;
      client.query = vi.fn(async (sql: string, params?: unknown[]) => {
        const result = await originalQuery(sql, params);
        if (sql.includes('UPDATE sessions')) {
          callCount++;
          return { rows: [], rowCount: callCount === 1 ? 3000 : 500 };
        }
        return result;
      }) as typeof client.query;

      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      const count = await repo.revokeAllByUserId('user-1');

      // Should have done 2 batches: 3000 + 500 = 3500
      expect(count).toBe(3500);
    });

    it('returns 0 when no active sessions exist', async () => {
      const client = createMockClient({ defaultRowCount: 0 });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      const count = await repo.revokeAllByUserId('user-1');

      expect(count).toBe(0);
    });

    it('wraps each batch in a transaction', async () => {
      const client = createMockClient({ defaultRowCount: 5 });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      await repo.revokeAllByUserId('user-1');

      const sqls = client.queries.map((q) => q.sql);
      expect(sqls.filter((s) => s === 'BEGIN')).toHaveLength(1);
      expect(sqls.filter((s) => s === 'COMMIT')).toHaveLength(1);
    });

    it('releases the client back to the pool', async () => {
      const client = createMockClient({ defaultRowCount: 5 });
      const pool = createMockPool(client);
      const repo = createSessionRepository(pool);

      await repo.revokeAllByUserId('user-1');

      expect(client.release).toHaveBeenCalled();
    });
  });
});
