import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUserRepository, PoolLike, ClientLike } from './userRepository';
import { ConflictError } from '../utils/errors';

// ---------------------------------------------------------------------------
// Helpers — lightweight mock pool and client
// ---------------------------------------------------------------------------

/**
 * Creates a mock client that records queries and returns configurable results.
 */
function createMockClient(options?: {
  queryResults?: Record<string, unknown>[];
  onQuery?: (sql: string, params?: unknown[]) => void;
}): ClientLike & { queries: { sql: string; params?: unknown[] }[] } {
  const queries: { sql: string; params?: unknown[] }[] = [];
  return {
    queries,
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      options?.onQuery?.(sql, params);
      return { rows: options?.queryResults ?? [] };
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

describe('userRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------

  describe('create', () => {
    it('inserts a user and returns the created record', async () => {
      const now = new Date().toISOString();
      const client = createMockClient({
        queryResults: [
          {
            id: 'test-uuid',
            email: 'alice@example.com',
            passwordHash: '$2b$10$hashedvalue',
            createdAt: now,
          },
        ],
      });
      const pool = createMockPool(client);
      const repo = createUserRepository(pool);

      const user = await repo.create({
        id: 'test-uuid',
        email: 'alice@example.com',
        passwordHash: '$2b$10$hashedvalue',
      });

      expect(user.id).toBe('test-uuid');
      expect(user.email).toBe('alice@example.com');
      expect(user.passwordHash).toBe('$2b$10$hashedvalue');
      expect(user.createdAt).toBeInstanceOf(Date);
    });

    it('uses parameterized queries for the INSERT', async () => {
      const now = new Date().toISOString();
      const client = createMockClient({
        queryResults: [
          {
            id: 'uuid-1',
            email: 'bob@example.com',
            passwordHash: '$2b$10$hash',
            createdAt: now,
          },
        ],
      });
      const pool = createMockPool(client);
      const repo = createUserRepository(pool);

      await repo.create({
        id: 'uuid-1',
        email: 'bob@example.com',
        passwordHash: '$2b$10$hash',
      });

      // Find the INSERT query (skip BEGIN)
      const insertQuery = client.queries.find((q) =>
        q.sql.includes('INSERT INTO users'),
      );
      expect(insertQuery).toBeDefined();
      expect(insertQuery!.params).toEqual([
        'uuid-1',
        'bob@example.com',
        '$2b$10$hash',
      ]);
    });

    it('wraps the INSERT in a transaction (BEGIN / COMMIT)', async () => {
      const now = new Date().toISOString();
      const client = createMockClient({
        queryResults: [
          {
            id: 'uuid-1',
            email: 'test@example.com',
            passwordHash: '$2b$10$hash',
            createdAt: now,
          },
        ],
      });
      const pool = createMockPool(client);
      const repo = createUserRepository(pool);

      await repo.create({
        id: 'uuid-1',
        email: 'test@example.com',
        passwordHash: '$2b$10$hash',
      });

      const sqls = client.queries.map((q) => q.sql);
      expect(sqls[0]).toBe('BEGIN');
      expect(sqls[sqls.length - 1]).toBe('COMMIT');
    });

    it('throws ConflictError on duplicate email (unique violation 23505)', async () => {
      const pgError = new Error('duplicate key value violates unique constraint');
      (pgError as unknown as { code: string }).code = '23505';

      const client = createMockClient({
        onQuery: (sql) => {
          if (sql.includes('INSERT')) {
            throw pgError;
          }
        },
      });
      const pool = createMockPool(client);
      const repo = createUserRepository(pool);

      await expect(
        repo.create({
          id: 'uuid-1',
          email: 'dup@example.com',
          passwordHash: '$2b$10$hash',
        }),
      ).rejects.toThrow(ConflictError);
    });

    it('rolls back the transaction on error', async () => {
      const pgError = new Error('some db error');
      (pgError as unknown as { code: string }).code = '23505';

      const client = createMockClient({
        onQuery: (sql) => {
          if (sql.includes('INSERT')) {
            throw pgError;
          }
        },
      });
      const pool = createMockPool(client);
      const repo = createUserRepository(pool);

      await expect(
        repo.create({
          id: 'uuid-1',
          email: 'fail@example.com',
          passwordHash: '$2b$10$hash',
        }),
      ).rejects.toThrow();

      const sqls = client.queries.map((q) => q.sql);
      expect(sqls).toContain('ROLLBACK');
    });

    it('releases the client back to the pool on success', async () => {
      const now = new Date().toISOString();
      const client = createMockClient({
        queryResults: [
          {
            id: 'uuid-1',
            email: 'ok@example.com',
            passwordHash: '$2b$10$hash',
            createdAt: now,
          },
        ],
      });
      const pool = createMockPool(client);
      const repo = createUserRepository(pool);

      await repo.create({
        id: 'uuid-1',
        email: 'ok@example.com',
        passwordHash: '$2b$10$hash',
      });

      expect(client.release).toHaveBeenCalledTimes(1);
    });

    it('releases the client back to the pool on error', async () => {
      const pgError = new Error('unique violation');
      (pgError as unknown as { code: string }).code = '23505';

      const client = createMockClient({
        onQuery: (sql) => {
          if (sql.includes('INSERT')) {
            throw pgError;
          }
        },
      });
      const pool = createMockPool(client);
      const repo = createUserRepository(pool);

      await expect(
        repo.create({
          id: 'uuid-1',
          email: 'fail@example.com',
          passwordHash: '$2b$10$hash',
        }),
      ).rejects.toThrow();

      expect(client.release).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // findByEmail
  // -----------------------------------------------------------------------

  describe('findByEmail', () => {
    it('returns the user when found', async () => {
      const now = new Date().toISOString();
      const client = createMockClient({
        queryResults: [
          {
            id: 'uuid-1',
            email: 'alice@example.com',
            passwordHash: '$2b$10$hash',
            createdAt: now,
          },
        ],
      });
      const pool = createMockPool(client);
      const repo = createUserRepository(pool);

      const user = await repo.findByEmail('alice@example.com');

      expect(user).not.toBeNull();
      expect(user!.id).toBe('uuid-1');
      expect(user!.email).toBe('alice@example.com');
      expect(user!.createdAt).toBeInstanceOf(Date);
    });

    it('returns null when no user matches', async () => {
      const client = createMockClient({ queryResults: [] });
      const pool = createMockPool(client);
      const repo = createUserRepository(pool);

      const user = await repo.findByEmail('nobody@example.com');

      expect(user).toBeNull();
    });

    it('uses a parameterized query', async () => {
      const client = createMockClient({ queryResults: [] });
      const pool = createMockPool(client);
      const repo = createUserRepository(pool);

      await repo.findByEmail('test@example.com');

      const selectQuery = client.queries.find((q) =>
        q.sql.includes('SELECT'),
      );
      expect(selectQuery).toBeDefined();
      expect(selectQuery!.params).toEqual(['test@example.com']);
    });

    it('releases the client back to the pool', async () => {
      const client = createMockClient({ queryResults: [] });
      const pool = createMockPool(client);
      const repo = createUserRepository(pool);

      await repo.findByEmail('test@example.com');

      expect(client.release).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // findById
  // -----------------------------------------------------------------------

  describe('findById', () => {
    it('returns the user when found', async () => {
      const now = new Date().toISOString();
      const client = createMockClient({
        queryResults: [
          {
            id: 'uuid-1',
            email: 'alice@example.com',
            passwordHash: '$2b$10$hash',
            createdAt: now,
          },
        ],
      });
      const pool = createMockPool(client);
      const repo = createUserRepository(pool);

      const user = await repo.findById('uuid-1');

      expect(user).not.toBeNull();
      expect(user!.id).toBe('uuid-1');
      expect(user!.email).toBe('alice@example.com');
    });

    it('returns null when no user matches', async () => {
      const client = createMockClient({ queryResults: [] });
      const pool = createMockPool(client);
      const repo = createUserRepository(pool);

      const user = await repo.findById('nonexistent-uuid');

      expect(user).toBeNull();
    });

    it('uses a parameterized query', async () => {
      const client = createMockClient({ queryResults: [] });
      const pool = createMockPool(client);
      const repo = createUserRepository(pool);

      await repo.findById('uuid-123');

      const selectQuery = client.queries.find((q) =>
        q.sql.includes('SELECT'),
      );
      expect(selectQuery).toBeDefined();
      expect(selectQuery!.params).toEqual(['uuid-123']);
    });

    it('releases the client back to the pool', async () => {
      const client = createMockClient({ queryResults: [] });
      const pool = createMockPool(client);
      const repo = createUserRepository(pool);

      await repo.findById('uuid-123');

      expect(client.release).toHaveBeenCalledTimes(1);
    });
  });
});
