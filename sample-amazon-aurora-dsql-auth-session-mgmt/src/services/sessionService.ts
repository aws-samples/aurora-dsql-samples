// ---------------------------------------------------------------------------
// Session Service
// ---------------------------------------------------------------------------
//
// Manages the full session lifecycle: creation, validation, listing, and
// revocation. This service sits between the HTTP layer and the Session
// Repository, handling token generation, hashing, and expiration logic.
//
// Security model:
//   - Tokens are generated with `crypto.randomBytes(32)` (256 bits of entropy)
//     and encoded as 64-character hex strings.
//   - Only the SHA-256 hash of the token is stored in the database. The
//     plaintext token is returned to the caller exactly once at creation time.
//   - Validation hashes the incoming token and queries for a matching hash
//     that is neither expired nor revoked.
//
// Dependencies are injected via the factory function so the service is easy
// to test without a real database or AWS credentials.
//
// Requirements:
//   3.1 — Session record creation with all required fields
//   3.2 — Cryptographically secure token generation (≥32 bytes)
//   3.3 — 24-hour session expiration
//   3.4 — Return token and expiry to caller
//   4.1 — Query session by token
//   4.2 — Validate active, non-expired session
//   4.3 — Reject expired sessions
//   4.4 — Reject non-existent sessions
//   4.5 — Reject revoked sessions
//   5.1 — List non-expired, non-revoked sessions
//   5.2 — Include id, createdAt, expiresAt, clientMetadata in listing
//   5.3 — Exclude token hash from listing
//   6.1 — Revoke a specific session
//   6.2 — Revoke all sessions for a user
//   6.3 — Revoked sessions fail subsequent validation
//   6.4 — Exclude current session from revoke-all
// ---------------------------------------------------------------------------

import crypto from 'node:crypto';
import { Session, SessionInfo, ClientMetadata } from '../types';
import { InvalidSessionError, SessionExpiredError } from '../utils/errors';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Session tokens are valid for 24 hours after creation. */
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Dependency interface (narrow type for testability)
// ---------------------------------------------------------------------------

/**
 * Minimal interface for the Session Repository.
 *
 * Mirrors the public surface of `createSessionRepository` so the session
 * service can be tested with a lightweight stub — no database required.
 */
export interface SessionRepositoryLike {
  create(session: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    clientMetadata: ClientMetadata;
  }): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<Session | null>;
  findActiveByUserId(userId: string): Promise<Session[]>;
  /**
   * Revoke a session that belongs to a specific user. The repository's
   * UPDATE is filtered by both `id` and `user_id`, returning `true` only
   * when a row was actually updated. This is the authorization boundary
   * for session revocation — a user passing another user's session ID
   * matches zero rows and gets `false`.
   */
  revokeByIdForUser(userId: string, sessionId: string): Promise<boolean>;
  revokeAllByUserId(userId: string, excludeSessionId?: string): Promise<number>;
}

// ---------------------------------------------------------------------------
// Session Service factory
// ---------------------------------------------------------------------------

/**
 * Creates a Session Service bound to the given Session Repository.
 *
 * Usage:
 * ```ts
 * const sessionService = createSessionService({ sessionRepository });
 *
 * const { token, expiresAt } = await sessionService.createSession(userId);
 * const { userId, sessionId } = await sessionService.validateSession(token);
 * ```
 *
 * @param deps.sessionRepository - Repository for session CRUD operations.
 */
export function createSessionService(deps: {
  sessionRepository: SessionRepositoryLike;
}) {
  const { sessionRepository } = deps;

  return {
    /**
     * Create a new session for the given user.
     *
     * Generates a cryptographically secure token, stores only its SHA-256
     * hash in the database, and returns the plaintext token to the caller
     * exactly once (Requirement 3.4).
     *
     * @param userId   - The authenticated user's identifier.
     * @param metadata - Optional client metadata (user agent, IP address).
     * @returns The plaintext session token and its expiration timestamp.
     */
    async createSession(
      userId: string,
      metadata?: ClientMetadata,
    ): Promise<{ token: string; expiresAt: Date }> {
      // Generate a 64-character hex token (32 bytes of entropy).
      // Requirement 3.2 — cryptographically secure, ≥32 bytes.
      const token = crypto.randomBytes(32).toString('hex');

      // Hash the token with SHA-256 for storage (Requirement 9.4).
      const tokenHash = hashToken(token);

      // Generate a UUID for the session record (Requirement 12.5).
      const id = crypto.randomUUID();

      // Set expiration to 24 hours from now (Requirement 3.3).
      const now = new Date();
      const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

      // Persist the session — only the hash is stored, never the plaintext.
      await sessionRepository.create({
        id,
        userId,
        tokenHash,
        expiresAt,
        clientMetadata: metadata ?? {},
      });

      // Return the plaintext token exactly once (Requirement 3.4).
      return { token, expiresAt };
    },

    /**
     * Validate a session token and return the associated user context.
     *
     * Hashes the incoming token and queries for a matching record that is
     * neither expired nor revoked.
     *
     * @param token - The plaintext session token from the Authorization header.
     * @returns The user ID and session ID associated with the valid session.
     *
     * @throws {InvalidSessionError} If no session matches the token hash
     *   (Requirement 4.4) or the session has been revoked (Requirement 4.5).
     * @throws {SessionExpiredError} If the session has passed its expiration
     *   timestamp (Requirement 4.3).
     */
    async validateSession(
      token: string,
    ): Promise<{ userId: string; sessionId: string }> {
      // Hash the incoming token to look up the stored record.
      const tokenHash = hashToken(token);

      // Query for the session by its token hash (Requirement 4.1).
      const session = await sessionRepository.findByTokenHash(tokenHash);

      // No matching session found (Requirement 4.4).
      if (!session) {
        throw new InvalidSessionError();
      }

      // Session has been revoked (Requirement 4.5).
      if (session.revokedAt !== null) {
        throw new InvalidSessionError();
      }

      // Session has expired (Requirement 4.3).
      if (session.expiresAt <= new Date()) {
        throw new SessionExpiredError();
      }

      // Session is valid — return the user context (Requirement 4.2).
      return { userId: session.userId, sessionId: session.id };
    },

    /**
     * List all active sessions for a user.
     *
     * Returns only non-expired, non-revoked sessions. The token hash is
     * intentionally excluded from the result to prevent token leakage
     * (Requirement 5.3).
     *
     * @param userId - The user whose sessions to list.
     * @returns An array of active session info objects.
     */
    async listSessions(userId: string): Promise<SessionInfo[]> {
      // Fetch active sessions from the repository (Requirement 5.1).
      const sessions = await sessionRepository.findActiveByUserId(userId);

      // Map to SessionInfo, excluding the token hash (Requirement 5.2, 5.3).
      return sessions.map((session) => ({
        id: session.id,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        clientMetadata: session.clientMetadata,
      }));
    },

    /**
     * Revoke a specific session that belongs to the given user.
     *
     * The user ID is used as an authorization filter — the underlying
     * repository UPDATE matches `WHERE id = $sessionId AND user_id = $userId`,
     * so a request to revoke a session belonging to a different user
     * matches zero rows and throws `InvalidSessionError`. This prevents
     * Insecure Direct Object Reference (IDOR): an attacker who guesses or
     * obtains another user's session ID cannot revoke it.
     *
     * Requirements: 6.1, 6.3.
     *
     * @param userId    - The authenticated user (authorization scope).
     * @param sessionId - The session to revoke.
     * @throws {InvalidSessionError} If the session does not exist, has
     *   already been revoked, or belongs to a different user.
     */
    async revokeSession(userId: string, sessionId: string): Promise<void> {
      const revoked = await sessionRepository.revokeByIdForUser(userId, sessionId);
      if (!revoked) {
        throw new InvalidSessionError('Session not found');
      }
    },

    /**
     * Revoke all sessions for a user, with an optional exclusion.
     *
     * Useful for "log out everywhere" or "log out everywhere except here"
     * flows (Requirement 6.2, 6.4).
     *
     * @param userId           - The user whose sessions to revoke.
     * @param excludeSessionId - Optional session ID to keep active.
     */
    async revokeAllSessions(
      userId: string,
      excludeSessionId?: string,
    ): Promise<void> {
      await sessionRepository.revokeAllByUserId(userId, excludeSessionId);
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the SHA-256 hash of a plaintext token.
 *
 * Used both at creation time (to store the hash) and at validation time
 * (to look up the stored hash).
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
