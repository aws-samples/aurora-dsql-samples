// ---------------------------------------------------------------------------
// Session Repository
// ---------------------------------------------------------------------------
//
// Data-access layer for the `sessions` table. All queries use parameterized
// statements to prevent SQL injection, and write operations are wrapped in
// the OCC retry utility so transient serialization errors (SQLSTATE 40001)
// are handled transparently.
//
// Because Aurora DSQL does not support foreign keys, this repository enforces
// referential integrity at the application level — it verifies that the
// referenced `user_id` exists in the `users` table before inserting a session.
//
// The repository accepts a pool-like interface rather than the concrete
// `AuroraDSQLPool` class, making it straightforward to test with a
// lightweight mock — no AWS credentials required.
//
// Requirements:
//   9.2 — Sessions table schema
//   9.3 — Application-level referential integrity (user_id → users.id)
//   9.4 — Store hashed token, not plaintext
//  11.5 — OCC retry logic for session write operations
//  12.1 — No single transaction modifies more than 3,000 rows
//  12.2 — Batch revocation into ≤3,000-row transactions
// ---------------------------------------------------------------------------

import { Session, ClientMetadata } from '../types';
import { InvalidSessionError } from '../utils/errors';
import { retryWithBackoff } from '../utils/retryWithBackoff';

// ---------------------------------------------------------------------------
// Pool / Client interfaces (narrow types for testability)
// ---------------------------------------------------------------------------

/**
 * Minimal interface for a connection pool.
 *
 * Mirrors the pattern used by the user repository — accepting a narrow type
 * instead of the concrete `AuroraDSQLPool` keeps this module easy to
 * unit-test with a simple mock.
 */
export interface PoolLike {
  connect(): Promise<ClientLike>;
}

/**
 * Minimal interface for a database client obtained from the pool.
 */
export interface ClientLike {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(): void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Aurora DSQL limits each DML transaction to 3,000 rows.
 *
 * When revoking all sessions for a user, we batch the UPDATE statements
 * into transactions of at most this many rows.
 */
const DSQL_MAX_ROWS_PER_TRANSACTION = 3_000;

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

/**
 * Creates a Session Repository bound to the given connection pool.
 *
 * Usage:
 * ```ts
 * const repo = createSessionRepository(pool);
 * await repo.create({ id, userId, tokenHash, expiresAt, clientMetadata });
 * ```
 *
 * @param pool - A connection pool (or pool-like mock) that provides `connect()`.
 */
export function createSessionRepository(pool: PoolLike) {
  return {
    /**
     * Insert a new session record into the `sessions` table.
     *
     * Before inserting, verifies that the referenced `user_id` exists in the
     * `users` table (application-level referential integrity). The write is
     * wrapped in the OCC retry utility so that transient serialization errors
     * from Aurora DSQL are retried automatically.
     *
     * @throws {InvalidSessionError} If the `userId` does not exist in the users table.
     */
    async create(session: {
      id: string;
      userId: string;
      tokenHash: string;
      expiresAt: Date;
      clientMetadata: ClientMetadata;
    }): Promise<void> {
      await retryWithBackoff(async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          // Application-level referential integrity check (Requirement 9.3).
          // Aurora DSQL does not support foreign keys, so we verify the
          // referenced user exists before inserting the session.
          const userCheck = await client.query(
            'SELECT id FROM users WHERE id = $1',
            [session.userId],
          );

          if (userCheck.rows.length === 0) {
            throw new InvalidSessionError(
              `User with id ${session.userId} does not exist`,
            );
          }

          await client.query(
            `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, revoked_at, client_metadata)
             VALUES ($1, $2, $3, NOW(), $4, NULL, $5)`,
            [
              session.id,
              session.userId,
              session.tokenHash,
              session.expiresAt,
              JSON.stringify(session.clientMetadata),
            ],
          );

          await client.query('COMMIT');
        } catch (error: unknown) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      });
    },

    /**
     * Look up a session by its token hash.
     *
     * Returns the full session record including revocation status, so the
     * caller (Session Service) can distinguish between expired, revoked,
     * and active sessions.
     *
     * @returns The matching `Session`, or `null` if no session has that token hash.
     */
    async findByTokenHash(tokenHash: string): Promise<Session | null> {
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT id, user_id AS "userId", token_hash AS "tokenHash",
                  created_at AS "createdAt", expires_at AS "expiresAt",
                  revoked_at AS "revokedAt", client_metadata AS "clientMetadata"
           FROM sessions
           WHERE token_hash = $1`,
          [tokenHash],
        );

        if (result.rows.length === 0) {
          return null;
        }

        return mapRowToSession(result.rows[0]);
      } finally {
        client.release();
      }
    },

    /**
     * Retrieve all active (non-expired, non-revoked) sessions for a user.
     *
     * @returns An array of active `Session` records, possibly empty.
     */
    async findActiveByUserId(userId: string): Promise<Session[]> {
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT id, user_id AS "userId", token_hash AS "tokenHash",
                  created_at AS "createdAt", expires_at AS "expiresAt",
                  revoked_at AS "revokedAt", client_metadata AS "clientMetadata"
           FROM sessions
           WHERE user_id = $1
             AND revoked_at IS NULL
             AND expires_at > NOW()`,
          [userId],
        );

        return result.rows.map(mapRowToSession);
      } finally {
        client.release();
      }
    },

    /**
     * Revoke a single session by setting its `revoked_at` timestamp.
     *
     * The write is wrapped in the OCC retry utility for transient
     * serialization error handling.
     */
    async revokeById(sessionId: string): Promise<void> {
      await retryWithBackoff(async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          await client.query(
            `UPDATE sessions
             SET revoked_at = NOW()
             WHERE id = $1
               AND revoked_at IS NULL`,
            [sessionId],
          );

          await client.query('COMMIT');
        } catch (error: unknown) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      });
    },

    /**
     * Revoke all active sessions for a user, with optional exclusion.
     *
     * Respects Aurora DSQL's 3,000-row per-transaction limit by batching
     * the revocation when the user has more active sessions than the limit.
     *
     * @param userId           - The user whose sessions should be revoked.
     * @param excludeSessionId - Optional session ID to keep active (e.g. the current session).
     * @returns The total number of sessions revoked across all batches.
     */
    async revokeAllByUserId(
      userId: string,
      excludeSessionId?: string,
    ): Promise<number> {
      let totalRevoked = 0;

      // Keep revoking in batches until no more active sessions remain.
      // Each batch runs in its own transaction to stay within the 3,000-row
      // DSQL limit (Requirement 12.1, 12.2).
      let batchRevoked: number;
      do {
        batchRevoked = await retryWithBackoff(async () => {
          const client = await pool.connect();
          try {
            await client.query('BEGIN');

            // Build the UPDATE with an optional exclusion clause.
            // We use a sub-select with LIMIT to cap each transaction at
            // DSQL_MAX_ROWS_PER_TRANSACTION rows.
            let sql: string;
            let params: unknown[];

            if (excludeSessionId) {
              sql = `UPDATE sessions
                     SET revoked_at = NOW()
                     WHERE id IN (
                       SELECT id FROM sessions
                       WHERE user_id = $1
                         AND revoked_at IS NULL
                         AND expires_at > NOW()
                         AND id != $2
                       LIMIT $3
                     )`;
              params = [userId, excludeSessionId, DSQL_MAX_ROWS_PER_TRANSACTION];
            } else {
              sql = `UPDATE sessions
                     SET revoked_at = NOW()
                     WHERE id IN (
                       SELECT id FROM sessions
                       WHERE user_id = $1
                         AND revoked_at IS NULL
                         AND expires_at > NOW()
                       LIMIT $2
                     )`;
              params = [userId, DSQL_MAX_ROWS_PER_TRANSACTION];
            }

            const result = await client.query(sql, params);

            await client.query('COMMIT');

            // `pg` returns rowCount on the result object for DML statements.
            // Our mock interface returns it via rows.length or a rowCount prop.
            return getRowCount(result);
          } catch (error: unknown) {
            await client.query('ROLLBACK');
            throw error;
          } finally {
            client.release();
          }
        });

        totalRevoked += batchRevoked;
      } while (batchRevoked === DSQL_MAX_ROWS_PER_TRANSACTION);

      return totalRevoked;
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps a raw database row to a typed `Session` object.
 *
 * Handles the conversion of timestamp strings to `Date` objects and parses
 * the JSONB `client_metadata` column.
 */
function mapRowToSession(row: Record<string, unknown>): Session {
  return {
    id: row.id as string,
    userId: row.userId as string,
    tokenHash: row.tokenHash as string,
    createdAt: new Date(row.createdAt as string),
    expiresAt: new Date(row.expiresAt as string),
    revokedAt: row.revokedAt ? new Date(row.revokedAt as string) : null,
    clientMetadata: parseClientMetadata(row.clientMetadata),
  };
}

/**
 * Safely parses the `client_metadata` column value.
 *
 * PostgreSQL's `pg` driver may return JSONB columns as already-parsed objects
 * or as raw strings depending on configuration. This helper handles both.
 */
function parseClientMetadata(value: unknown): ClientMetadata {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as ClientMetadata;
    } catch {
      return {};
    }
  }
  if (typeof value === 'object' && value !== null) {
    return value as ClientMetadata;
  }
  return {};
}

/**
 * Extracts the row count from a query result.
 *
 * The `pg` library includes a `rowCount` property on DML results. Our narrow
 * `ClientLike` interface doesn't expose it directly, so we check for it at
 * runtime and fall back to 0.
 */
function getRowCount(result: { rows: Record<string, unknown>[]; rowCount?: number }): number {
  if (typeof result.rowCount === 'number') {
    return result.rowCount;
  }
  return 0;
}
