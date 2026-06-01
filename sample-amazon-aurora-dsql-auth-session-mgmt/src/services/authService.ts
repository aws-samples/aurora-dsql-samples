// ---------------------------------------------------------------------------
// Auth Service
// ---------------------------------------------------------------------------
//
// Orchestrates user registration and login flows. This service sits between
// the HTTP layer (routes / controllers) and the data-access layer
// (repositories), coordinating password hashing, UUID generation, and
// session creation.
//
// Dependencies are injected via the factory function so the service is easy
// to test without a real database or AWS credentials.
//
// Security note: login returns the same generic error for both "email not
// found" and "wrong password" to prevent user enumeration (Requirement 2.4).
//
// Requirements:
//   1.1 — Create user records in Aurora DSQL
//   2.1 — Authenticate user and delegate session creation
//   2.2 — Reject login for non-existent email
//   2.3 — Reject login for incorrect password
//   2.4 — Same error message for email-not-found and wrong-password
//   2.5 — Verify password against stored bcrypt hash
// ---------------------------------------------------------------------------

import crypto from 'node:crypto';
import { User, ClientMetadata } from '../types';
import { AuthenticationError } from '../utils/errors';
import { hash, verify } from '../utils/passwordHasher';

// ---------------------------------------------------------------------------
// Dependency interfaces (narrow types for testability)
// ---------------------------------------------------------------------------

/**
 * Minimal interface for the User Repository.
 *
 * Mirrors the public surface of `createUserRepository` so the auth service
 * can be tested with a lightweight stub.
 */
export interface UserRepositoryLike {
  create(user: { id: string; email: string; passwordHash: string }): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
}

/**
 * Minimal interface for the Session Service.
 *
 * The session service is implemented separately (task 7.3). We depend only
 * on the `createSession` method here so the auth service can delegate
 * session creation during login.
 */
export interface SessionServiceLike {
  createSession(
    userId: string,
    metadata?: ClientMetadata,
  ): Promise<{ token: string; expiresAt: Date }>;
}

// ---------------------------------------------------------------------------
// Auth Service factory
// ---------------------------------------------------------------------------

/**
 * Creates an Auth Service bound to the given dependencies.
 *
 * Usage:
 * ```ts
 * const authService = createAuthService({
 *   userRepository,
 *   sessionService,
 * });
 *
 * const user = await authService.register('alice@example.com', 's3cureP@ss');
 * const session = await authService.login('alice@example.com', 's3cureP@ss');
 * ```
 *
 * @param deps.userRepository - Repository for user CRUD operations.
 * @param deps.sessionService - Service for session lifecycle management.
 */
export function createAuthService(deps: {
  userRepository: UserRepositoryLike;
  sessionService: SessionServiceLike;
}) {
  const { userRepository, sessionService } = deps;

  return {
    /**
     * Register a new user.
     *
     * Flow:
     *   1. Hash the plaintext password with bcrypt (Requirement 1.3).
     *   2. Generate a UUID for the new user (Requirement 12.5).
     *   3. Insert the user record into the database (Requirement 1.1).
     *   4. Return the public user profile (id, email, createdAt).
     *
     * Email uniqueness is enforced by the database's UNIQUE constraint on
     * the `email` column. If a duplicate is detected, the user repository
     * throws a `ConflictError` which propagates to the caller.
     *
     * @throws {ConflictError} If the email is already registered.
     */
    async register(
      email: string,
      password: string,
    ): Promise<{ id: string; email: string; createdAt: Date }> {
      // Step 1 — Hash the password in the application layer.
      const passwordHash = await hash(password);

      // Step 2 — Generate a UUID for the new user record.
      const id = crypto.randomUUID();

      // Step 3 — Persist the user. The repository handles OCC retries and
      //          maps unique-constraint violations to ConflictError.
      const user = await userRepository.create({ id, email, passwordHash });

      // Step 4 — Return the public profile (never expose the password hash).
      return {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      };
    },

    /**
     * Authenticate a user and create a new session.
     *
     * Flow:
     *   1. Look up the user by email (Requirement 2.2).
     *   2. Verify the password against the stored hash (Requirement 2.5).
     *   3. Delegate session creation to the Session Service (Requirement 2.1).
     *   4. Return the session token and expiry.
     *
     * Both "email not found" and "wrong password" throw the same
     * `AuthenticationError` with a generic message to prevent user
     * enumeration (Requirement 2.4).
     *
     * @throws {AuthenticationError} If the email does not exist or the
     *   password is incorrect.
     */
    async login(
      email: string,
      password: string,
      clientMetadata?: ClientMetadata,
    ): Promise<{ token: string; expiresAt: Date }> {
      // Step 1 — Find the user by email.
      const user = await userRepository.findByEmail(email);

      if (!user) {
        // Generic error — do not reveal that the email was not found.
        throw new AuthenticationError();
      }

      // Step 2 — Verify the password against the stored bcrypt hash.
      const isValid = await verify(password, user.passwordHash);

      if (!isValid) {
        // Generic error — do not reveal that the password was wrong.
        throw new AuthenticationError();
      }

      // Step 3 — Create a session and return the token.
      return sessionService.createSession(user.id, clientMetadata);
    },

    /**
     * Retrieve a user's public profile by their identifier.
     *
     * @returns The user's id, email, and creation timestamp.
     * @throws {AuthenticationError} If the user does not exist (e.g. deleted
     *   after the session was created).
     */
    async getProfile(
      userId: string,
    ): Promise<{ id: string; email: string; createdAt: Date }> {
      const user = await userRepository.findById(userId);

      if (!user) {
        throw new AuthenticationError('User not found');
      }

      return {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      };
    },
  };
}
