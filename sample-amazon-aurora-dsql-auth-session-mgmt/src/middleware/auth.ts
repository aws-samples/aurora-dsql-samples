// ---------------------------------------------------------------------------
// Auth Middleware
// ---------------------------------------------------------------------------
//
// Extracts the session token from the `Authorization: Bearer <token>` header,
// validates it via the Session Service, and attaches the authenticated user
// context to the request object. Protected routes use this middleware to
// ensure only authenticated users can access them.
//
// Dependencies (Session Service, User Repository) are injected via a factory
// function so the middleware is easy to test without a real database.
//
// Requirements:
//   4.1 — Query session by token
//   4.2 — Validate active, non-expired session
//   4.3 — Reject expired sessions
//   4.4 — Reject non-existent sessions
//   4.5 — Reject revoked sessions
// ---------------------------------------------------------------------------

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { InvalidSessionError } from '../utils/errors';

// ---------------------------------------------------------------------------
// Dependency interfaces (narrow types for testability)
// ---------------------------------------------------------------------------

/**
 * Minimal interface for the Session Service.
 *
 * Only the `validateSession` method is needed by the auth middleware.
 */
export interface SessionServiceLike {
  validateSession(token: string): Promise<{ userId: string; sessionId: string }>;
}

/**
 * Minimal interface for the User Repository.
 *
 * Only the `findById` method is needed to look up the user's email after
 * session validation.
 */
export interface UserRepositoryLike {
  findById(id: string): Promise<{ id: string; email: string } | null>;
}

// ---------------------------------------------------------------------------
// Auth Middleware factory
// ---------------------------------------------------------------------------

/**
 * Creates an Express middleware that authenticates requests using Bearer tokens.
 *
 * Flow:
 *   1. Extract the token from the `Authorization: Bearer <token>` header.
 *   2. If no token is present, reject with an `InvalidSessionError`.
 *   3. Validate the token via the Session Service.
 *   4. Look up the user by ID to get their email.
 *   5. Attach `user` and `sessionId` to the request object.
 *   6. Call `next()` to proceed to the route handler.
 *
 * Usage:
 * ```ts
 * const authMiddleware = createAuthMiddleware({
 *   sessionService,
 *   userRepository,
 * });
 *
 * router.get('/protected', authMiddleware, (req, res) => {
 *   const { user, sessionId } = req as AuthenticatedRequest;
 *   // ...
 * });
 * ```
 *
 * @param deps.sessionService  - Service for session validation.
 * @param deps.userRepository  - Repository for user lookups.
 */
export function createAuthMiddleware(deps: {
  sessionService: SessionServiceLike;
  userRepository: UserRepositoryLike;
}) {
  const { sessionService, userRepository } = deps;

  return async (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    // Step 1 — Extract the Bearer token from the Authorization header.
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return next(new InvalidSessionError('Authorization header is required'));
    }

    if (!authHeader.startsWith('Bearer ')) {
      return next(
        new InvalidSessionError(
          'Authorization header must use the Bearer scheme',
        ),
      );
    }

    const token = authHeader.slice(7).trim(); // Remove "Bearer " prefix and any padding

    if (token.length === 0) {
      return next(
        new InvalidSessionError('Bearer token is missing from Authorization header'),
      );
    }

    try {
      // Step 2 — Validate the session token (Requirements 4.1–4.5).
      // The session service throws InvalidSessionError or SessionExpiredError
      // for invalid, revoked, or expired tokens.
      const { userId, sessionId } = await sessionService.validateSession(token);

      // Step 3 — Look up the user to get their email for the request context.
      const user = await userRepository.findById(userId);

      if (!user) {
        return next(new InvalidSessionError('User not found'));
      }

      // Step 4 — Attach the authenticated context to the request.
      req.user = { id: user.id, email: user.email };
      req.sessionId = sessionId;

      // Step 5 — Proceed to the next middleware or route handler.
      next();
    } catch (error) {
      // Let InvalidSessionError and SessionExpiredError propagate to the
      // global error handler, which maps them to 401 responses.
      next(error);
    }
  };
}
