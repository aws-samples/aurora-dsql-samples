import express, { type Express } from "express";
import { router } from "./routes/index.js";
import { errorHandler } from "./middleware/error.js";

/**
 * Builds the Express application without binding a port.
 *
 * Kept separate from index.ts so tests can drive the app over supertest
 * in-process. Importing index.ts would start a listener and install signal
 * handlers, which a test run should not do.
 */
export function createApp(): Express {
  const app = express();

  // Bound the request body. body-parser raises a 413 above this, which the
  // error handler passes through rather than reporting as a server fault.
  app.use(express.json({ limit: "100kb" }));
  app.use(router);
  app.use(errorHandler);

  return app;
}
