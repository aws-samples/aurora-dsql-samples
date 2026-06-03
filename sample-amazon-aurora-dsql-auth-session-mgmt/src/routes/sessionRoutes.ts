// ---------------------------------------------------------------------------
// Session Routes
// ---------------------------------------------------------------------------
//
// Defines the session management HTTP endpoints:
//
//   GET    /api/sessions              — List active sessions for the user
//   DELETE /api/sessions/:sessionId   — Revoke a specific session
//   DELETE /api/sessions              — Revoke all sessions (optionally
//                                       excluding the current one)
//
// Dependencies (session service, auth middleware) are injected via a factory
// function so the router is easy to test without a real database.
//
// All responses use the standard `ApiResponse<T>` envelope defined in
// `src/types/index.ts`.
//
// Requirements:
//   8.3 — GET /api/sessions endpoint
//   8.4 — DELETE /api/sessions/:sessionId endpoint
//   8.5 — DELETE /api/sessions endpoint (revoke all)
//   8.7 — Consistent JSON response structure
// ---------------------------------------------------------------------------

import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { AuthenticatedRequest, ApiResponse, SessionInfo } from '../types';
import { validateSessionId } from '../middleware/validator';

// ---------------------------------------------------------------------------
// Dependency interfaces (narrow types for testability)
// ---------------------------------------------------------------------------

/**
 * Minimal interface for the Session Service.
 *
 * Only the methods used by the route handlers are required.
 */
export interface SessionServiceLike {
  listSessions(userId: string): Promise<SessionInfo[]>;
  revokeSession(userId: string, sessionId: string): Promise<void>;
  revokeAllSessions(userId: string, excludeSessionId?: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Session Routes factory
// ---------------------------------------------------------------------------

/**
 * Creates an Express router with session management endpoints.
 *
 * @param deps.sessionService - Service for listing and revoking sessions.
 * @param deps.authMiddleware - Middleware that validates the Bearer token and
 *                              attaches `user` / `sessionId` to the request.
 */
export function createSessionRoutes(deps: {
  sessionService: SessionServiceLike;
  authMiddleware: RequestHandler;
}): Router {
  const { sessionService, authMiddleware } = deps;
  const router = Router();

  // All session routes require authentication.
  router.use(authMiddleware);

  // -----------------------------------------------------------------------
  // GET /api/sessions
  // -----------------------------------------------------------------------
  // Returns all active (non-expired, non-revoked) sessions for the
  // authenticated user. Token hashes are never included in the response
  // (Requirement 8.3).
  // -----------------------------------------------------------------------
  router.get(
    '/',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { user } = req as AuthenticatedRequest;

        const sessions = await sessionService.listSessions(user.id);

        const body: ApiResponse<SessionInfo[]> = {
          success: true,
          data: sessions,
        };

        res.status(200).json(body);
      } catch (error) {
        next(error);
      }
    },
  );

  // -----------------------------------------------------------------------
  // DELETE /api/sessions/:sessionId
  // -----------------------------------------------------------------------
  // Revokes a specific session by its UUID. The session ID is validated
  // as a UUID before reaching the handler (Requirement 8.4).
  // -----------------------------------------------------------------------
  router.delete(
    '/:sessionId',
    validateSessionId,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { user } = req as AuthenticatedRequest;
        const sessionId = req.params.sessionId as string;

        await sessionService.revokeSession(user.id, sessionId);

        const body: ApiResponse<{ message: string }> = {
          success: true,
          data: { message: 'Session revoked' },
        };

        res.status(200).json(body);
      } catch (error) {
        next(error);
      }
    },
  );

  // -----------------------------------------------------------------------
  // DELETE /api/sessions
  // -----------------------------------------------------------------------
  // Revokes all sessions for the authenticated user. If the query parameter
  // `excludeCurrent=true` is present, the current session (identified by
  // `req.sessionId`) is preserved (Requirement 8.5, 6.4).
  // -----------------------------------------------------------------------
  router.delete(
    '/',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { user, sessionId } = req as AuthenticatedRequest;

        // Check if the caller wants to keep the current session active.
        const excludeCurrent = req.query.excludeCurrent === 'true';
        const excludeSessionId = excludeCurrent ? sessionId : undefined;

        await sessionService.revokeAllSessions(user.id, excludeSessionId);

        const body: ApiResponse<{ message: string }> = {
          success: true,
          data: { message: 'All sessions revoked' },
        };

        res.status(200).json(body);
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
