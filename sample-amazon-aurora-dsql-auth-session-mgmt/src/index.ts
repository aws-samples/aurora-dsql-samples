// ---------------------------------------------------------------------------
// Application Entry Point
// ---------------------------------------------------------------------------
//
// Initializes the DSQL connection pool, runs database migrations, wires up
// all application dependencies, and starts the Express server.
//
// Graceful shutdown is handled via SIGTERM and SIGINT signals — the server
// stops accepting new connections and the connection pool is drained before
// the process exits.
//
// Requirements:
//   9.5 — Strong consistency (immediate read-after-write)
//   9.6 — Use the official DSQL connector for connection management
//   9.7 — IAM-based database authentication
//  12.3 — Connection pool with bounded size
// ---------------------------------------------------------------------------

import { RequestHandler } from 'express';
import { getPool, closePool } from './db/connection';
import { runMigrations } from './db/migrate';
import { createUserRepository } from './repositories/userRepository';
import { createSessionRepository } from './repositories/sessionRepository';
import { createSessionService } from './services/sessionService';
import { createAuthService } from './services/authService';
import { createAuthMiddleware } from './middleware/auth';
import { createApp } from './app';

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

/**
 * Validates that all required environment variables are set before the
 * application attempts to connect to Aurora DSQL. Fails fast with a clear
 * error message so misconfiguration is caught at startup, not at runtime.
 */
function validateEnvironment(): void {
  if (!process.env.DSQL_ENDPOINT) {
    console.error(
      'ERROR: DSQL_ENDPOINT environment variable is required but not set.\n' +
        'Set it to your Aurora DSQL cluster endpoint, e.g.:\n' +
        '  export DSQL_ENDPOINT="your-cluster-id.dsql.us-east-1.on.aws"',
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Step 1 — Validate required environment variables.
  validateEnvironment();

  // Step 2 — Get the DSQL connection pool (Requirement 9.6, 9.7, 12.3).
  // The pool uses IAM-based authentication via the official DSQL connector.
  const pool = getPool();

  // Step 3 — Run database migrations (creating tables and indexes).
  // Skip when SKIP_MIGRATIONS=true, e.g. when running as a least-privilege
  // runtime role that lacks CREATE on schema public.
  if (process.env.SKIP_MIGRATIONS === 'true') {
    console.log('SKIP_MIGRATIONS=true, skipping database migrations.');
  } else {
    console.log('Running database migrations (creating tables and indexes)...');
    await runMigrations(pool);
    console.log('Database migrations complete.');
  }

  // Step 4 — Create all application dependencies.
  const userRepository = createUserRepository(pool);
  const sessionRepository = createSessionRepository(pool);
  const sessionService = createSessionService({ sessionRepository });
  const authService = createAuthService({ userRepository, sessionService });
  const authMiddleware = createAuthMiddleware({ sessionService, userRepository });

  // Step 5 — Create the fully-wired Express application.
  // The middleware augments the request with `user` and `sessionId` after
  // running. Cast to the standard `RequestHandler` signature for wiring;
  // the augmented properties are read inside route handlers via an
  // `AuthenticatedRequest` cast.
  const app = createApp({
    authService,
    sessionService,
    authMiddleware: authMiddleware as RequestHandler,
  });

  // Step 6 — Start the HTTP server.
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const server = app.listen(PORT, () => {
    console.log(`Auth service listening on port ${PORT}`);
  });

  // Step 7 — Register graceful shutdown handlers.
  // On SIGTERM or SIGINT, stop accepting new connections, close the pool,
  // and exit cleanly.
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received — shutting down gracefully...`);

    server.close(async () => {
      console.log('HTTP server closed.');

      await closePool();
      console.log('Connection pool closed.');

      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// ---------------------------------------------------------------------------
// Start the application
// ---------------------------------------------------------------------------

main().catch((error) => {
  console.error('Failed to start the application:', error);
  process.exit(1);
});
