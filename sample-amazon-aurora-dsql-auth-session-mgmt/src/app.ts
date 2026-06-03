// ---------------------------------------------------------------------------
// Express Application Setup
// ---------------------------------------------------------------------------
//
// Configures the Express application with JSON body parsing, route mounting,
// and the global error handler.
//
// The app is exported via the `createApp(deps)` factory, which accepts
// injected services and middleware. Tests construct the app with
// lightweight stubs; production wiring lives in `index.ts`.
//
// A bare default export is also provided for tests that exercise app-level
// behavior (404, JSON parsing) without needing real services.
//
// Requirements:
//   8.7 — Consistent JSON response structure
//   8.8 — Generic 500 for unhandled errors, no internal details
// ---------------------------------------------------------------------------

import express, { RequestHandler } from 'express';
import { createAuthRoutes, AuthServiceLike } from './routes/authRoutes';
import { createSessionRoutes, SessionServiceLike } from './routes/sessionRoutes';
import { errorHandler } from './middleware/errorHandler';

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

/**
 * Dependencies required to build a fully-wired Express application.
 *
 * Each dependency is injected so the app can be tested with lightweight
 * stubs — no database or AWS credentials needed.
 */
export interface AppDependencies {
  authService: AuthServiceLike;
  sessionService: SessionServiceLike;
  /**
   * Authentication middleware. Express's `RequestHandler` type covers any
   * middleware function with the standard `(req, res, next)` signature.
   * Production middleware is created by `createAuthMiddleware` in
   * `src/middleware/auth.ts`; tests can inject a no-op or a stub.
   */
  authMiddleware: RequestHandler;
}

/**
 * Creates a fully-wired Express application.
 *
 * Usage:
 * ```ts
 * const app = createApp({ authService, sessionService, authMiddleware });
 * app.listen(3000);
 * ```
 *
 * @param deps - Injected services and middleware.
 * @returns A configured Express application ready to handle requests.
 */
export function createApp(deps: AppDependencies): express.Express {
  const app = express();

  // -----------------------------------------------------------------------
  // Middleware
  // -----------------------------------------------------------------------

  // Parse incoming JSON request bodies.
  app.use(express.json());

  // -----------------------------------------------------------------------
  // Routes
  // -----------------------------------------------------------------------

  // Auth routes: register, login, profile
  const authRoutes = createAuthRoutes({
    authService: deps.authService,
    authMiddleware: deps.authMiddleware,
  });
  app.use('/api/auth', authRoutes);

  // Session routes: list, revoke, revoke-all
  const sessionRoutes = createSessionRoutes({
    sessionService: deps.sessionService,
    authMiddleware: deps.authMiddleware,
  });
  app.use('/api/sessions', sessionRoutes);

  // -----------------------------------------------------------------------
  // Global error handler
  // -----------------------------------------------------------------------

  // Must be registered after all routes so it catches errors from any
  // route handler or middleware in the chain.
  app.use(errorHandler);

  return app;
}

// ---------------------------------------------------------------------------
// Default export — bare app for app-level tests
// ---------------------------------------------------------------------------
//
// This bare instance has no routes mounted, only JSON parsing and the global
// error handler. It exists so app-level tests in `app.test.ts` can verify
// generic Express behavior (404 for unknown paths, malformed-JSON handling,
// 500 envelope shape) without constructing service stubs.

const app = express();
app.use(express.json());
app.use(errorHandler);

export default app;
