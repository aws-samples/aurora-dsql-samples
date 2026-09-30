// ---------------------------------------------------------------------------
// User Repository
// ---------------------------------------------------------------------------
//
// Data-access layer for the `users` table. All queries use parameterized
// statements to prevent SQL injection, and write operations are wrapped in
// the OCC retry utility so transient serialization errors (SQLSTATE 40001)
// are handled transparently.
//
// The repository accepts a pool-like interface rather than the concrete
// `AuroraDSQLPool` class, making it straightforward to test with a
// lightweight mock — no AWS credentials required.
//
// Requirements:
//   1.1 — Create user records in Aurora DSQL
//   1.2 — Reject duplicate email registrations with a conflict error
//   1.4 — Store id (UUID), email, password_hash, created_at
//   9.1 — Users table schema
//  12.5 — Generate UUIDs in the application layer
// ---------------------------------------------------------------------------

import { User } from '../types';
import { ConflictError } from '../utils/errors';
import { retryWithBackoff } from '../utils/retryWithBackoff';

// ---------------------------------------------------------------------------
// Pool / Client interfaces (narrow types for testability)
// ---------------------------------------------------------------------------

/**
 * Minimal interface for a connection pool.
 *
 * Mirrors the pattern used by the database migrator — accepting a narrow
 * type instead of the concrete `AuroraDSQLPool` keeps this module easy to
 * unit-test with a simple mock.
 *
 * The optional `transaction(callback)` method matches the surface of
 * `AuroraDSQLPool.transaction` from `@aws/aurora-dsql-node-postgres-connector`.
 * When the pool implements it (production), the repository uses the
 * connector's built-in OCC retry helper. When it does not (tests), the
 * repository falls back to a manual BEGIN/COMMIT loop wrapped in
 * `retryWithBackoff`.
 */
export interface PoolLike {
  connect(): Promise<ClientLike>;
  transaction?<T>(callback: (client: ClientLike) => Promise<T>): Promise<T>;
}

/**
 * Minimal interface for a database client obtained from the pool.
 */
export interface ClientLike {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number }>;
  release(): void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * PostgreSQL error code for unique constraint violations.
 *
 * When an INSERT conflicts with a UNIQUE constraint (e.g. duplicate email),
 * PostgreSQL raises error code `23505`.
 */
const UNIQUE_VIOLATION_CODE = '23505';

// ---------------------------------------------------------------------------
// Transaction helper
// ---------------------------------------------------------------------------

/**
 * Run `callback` inside a transaction with OCC retry.
 *
 * Production path: delegate to `AuroraDSQLPool.transaction`, which catches
 * SQLSTATE `40001` (both `OC000` data conflicts and `OC001` schema
 * conflicts) and retries with exponential backoff.
 *
 * Test path: manual BEGIN/COMMIT loop wrapped in `retryWithBackoff`.
 */
async function runInTransaction<T>(
  pool: PoolLike,
  callback: (client: ClientLike) => Promise<T>,
): Promise<T> {
  if (pool.transaction) {
    return pool.transaction(callback);
  }

  return retryWithBackoff(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error: unknown) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // swallow — re-throwing the original error below is more useful
      }
      throw error;
    } finally {
      client.release();
    }
  });
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

/**
 * Creates a User Repository bound to the given connection pool.
 *
 * Usage:
 * ```ts
 * const repo = createUserRepository(pool);
 * const user = await repo.create({ id, email, passwordHash });
 * ```
 *
 * @param pool - A connection pool (or pool-like mock) that provides `connect()`.
 */
export function createUserRepository(pool: PoolLike) {
  return {
    /**
     * Insert a new user record into the `users` table.
     *
     * Transactional work routes through `runInTransaction`, which uses
     * `AuroraDSQLPool.transaction` (with built-in OCC retry) in production
     * and a manual BEGIN/COMMIT + `retryWithBackoff` fallback under test.
     *
     * @throws {ConflictError} If the email already exists (unique violation).
     */
    async create(user: {
      id: string;
      email: string;
      passwordHash: string;
    }): Promise<User> {
      try {
        return await runInTransaction(pool, async (client) => {
          const result = await client.query(
            `INSERT INTO users (id, email, password_hash, created_at)
             VALUES ($1, $2, $3, NOW())
             RETURNING id, email, password_hash AS "passwordHash", created_at AS "createdAt"`,
            [user.id, user.email, user.passwordHash],
          );

          const row = result.rows[0];
          return {
            id: row.id as string,
            email: row.email as string,
            passwordHash: row.passwordHash as string,
            createdAt: new Date(row.createdAt as string),
          };
        });
      } catch (error: unknown) {
        // Map PostgreSQL unique-violation on email to a friendly ConflictError
        if (isUniqueViolation(error)) {
          throw new ConflictError('Email already exists');
        }
        throw error;
      }
    },

    /**
     * Look up a user by their email address.
     *
     * @returns The matching `User`, or `null` if no user has that email.
     */
    async findByEmail(email: string): Promise<User | null> {
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT id, email, password_hash AS "passwordHash", created_at AS "createdAt"
           FROM users
           WHERE email = $1`,
          [email],
        );

        if (result.rows.length === 0) {
          return null;
        }

        const row = result.rows[0];
        return {
          id: row.id as string,
          email: row.email as string,
          passwordHash: row.passwordHash as string,
          createdAt: new Date(row.createdAt as string),
        };
      } finally {
        client.release();
      }
    },

    /**
     * Look up a user by their unique identifier.
     *
     * @returns The matching `User`, or `null` if no user has that id.
     */
    async findById(id: string): Promise<User | null> {
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT id, email, password_hash AS "passwordHash", created_at AS "createdAt"
           FROM users
           WHERE id = $1`,
          [id],
        );

        if (result.rows.length === 0) {
          return null;
        }

        const row = result.rows[0];
        return {
          id: row.id as string,
          email: row.email as string,
          passwordHash: row.passwordHash as string,
          createdAt: new Date(row.createdAt as string),
        };
      } finally {
        client.release();
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the error is a PostgreSQL unique constraint violation.
 *
 * The `pg` library attaches a `code` property to error objects that maps to
 * the five-character SQLSTATE value. `23505` means "unique_violation".
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === UNIQUE_VIOLATION_CODE
  );
}
