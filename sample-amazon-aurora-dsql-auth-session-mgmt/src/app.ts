// ---------------------------------------------------------------------------
// Express Application Setup
// ---------------------------------------------------------------------------
//
// Configures the Express application with JSON body parsing, route mounting,
// and the global error handler.
//
// The app is exported in two forms:
//   1. `createApp(deps)` — factory function that accepts injected services
//      and middleware, used for testing and production wiring.
//   2. `default export` — a bare app instance with no routes mounted, kept
//      for backward compatibility with existing tests.
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authMiddleware: any;
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
// Default export (bare app for backward compatibility)
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());
app.use(errorHandler);

export default app;
