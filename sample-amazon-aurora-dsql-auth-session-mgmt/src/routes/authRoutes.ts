// ---------------------------------------------------------------------------
// Auth Routes
// ---------------------------------------------------------------------------
//
// Defines the authentication-related HTTP endpoints:
//
//   POST /api/auth/register  — Create a new user account
//   POST /api/auth/login     — Authenticate and receive a session token
//   GET  /api/auth/me        — Retrieve the authenticated user's profile
//
// Dependencies (auth service, auth middleware, validators) are injected via
// a factory function so the router is easy to test without a real database.
//
// All responses use the standard `ApiResponse<T>` envelope defined in
// `src/types/index.ts`.
//
// Requirements:
//   8.1 — POST /api/auth/register endpoint
//   8.2 — POST /api/auth/login endpoint
//   8.6 — GET /api/auth/me endpoint
//   8.7 — Consistent JSON response structure
// ---------------------------------------------------------------------------

import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { validateRegistration, validateLogin } from '../middleware/validator';

// ---------------------------------------------------------------------------
// Dependency interfaces (narrow types for testability)
// ---------------------------------------------------------------------------

/**
 * Minimal interface for the Auth Service.
 *
 * Only the methods used by the route handlers are required, keeping the
 * coupling surface small and tests lightweight.
 */
export interface AuthServiceLike {
  register(
    email: string,
    password: string,
  ): Promise<{ id: string; email: string; createdAt: Date }>;

  login(
    email: string,
    password: string,
    clientMetadata?: { userAgent?: string; ipAddress?: string },
  ): Promise<{ token: string; expiresAt: Date }>;

  getProfile(
    userId: string,
  ): Promise<{ id: string; email: string; createdAt: Date }>;
}

// ---------------------------------------------------------------------------
// Auth Routes factory
// ---------------------------------------------------------------------------

/**
 * Creates an Express router with authentication endpoints.
 *
 * @param deps.authService    - Service for registration, login, and profile.
 * @param deps.authMiddleware - Middleware that validates the Bearer token and
 *                              attaches `user` / `sessionId` to the request.
 */
export function createAuthRoutes(deps: {
  authService: AuthServiceLike;
  authMiddleware: RequestHandler;
}): Router {
  const { authService, authMiddleware } = deps;
  const router = Router();

  // -----------------------------------------------------------------------
  // POST /api/auth/register
  // -----------------------------------------------------------------------
  // Validates the request body, creates a new user, and returns the public
  // profile. Returns 201 on success (Requirement 8.1).
  // -----------------------------------------------------------------------
  router.post(
    '/register',
    validateRegistration,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { email, password } = req.body;

        const user = await authService.register(email, password);

        const body: ApiResponse<typeof user> = {
          success: true,
          data: user,
        };

        res.status(201).json(body);
      } catch (error) {
        next(error);
      }
    },
  );

  // -----------------------------------------------------------------------
  // POST /api/auth/login
  // -----------------------------------------------------------------------
  // Validates credentials, authenticates the user, creates a session, and
  // returns the session token with its expiry (Requirement 8.2).
  //
  // Client metadata (user agent, IP address) is extracted from the request
  // and passed to the auth service for session creation.
  // -----------------------------------------------------------------------
  router.post(
    '/login',
    validateLogin,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { email, password } = req.body;

        // Extract client metadata from the request for session tracking.
        const clientMetadata = {
          userAgent: req.headers['user-agent'] ?? undefined,
          ipAddress: req.ip ?? undefined,
        };

        const session = await authService.login(email, password, clientMetadata);

        const body: ApiResponse<typeof session> = {
          success: true,
          data: session,
        };

        res.status(200).json(body);
      } catch (error) {
        next(error);
      }
    },
  );

  // -----------------------------------------------------------------------
  // GET /api/auth/me
  // -----------------------------------------------------------------------
  // Requires authentication. Returns the current user's profile
  // (Requirement 8.6).
  // -----------------------------------------------------------------------
  router.get(
    '/me',
    authMiddleware,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { user } = req as AuthenticatedRequest;

        const profile = await authService.getProfile(user.id);

        const body: ApiResponse<typeof profile> = {
          success: true,
          data: profile,
        };

        res.status(200).json(body);
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
