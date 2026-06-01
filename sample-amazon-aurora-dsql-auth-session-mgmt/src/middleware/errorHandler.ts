// ---------------------------------------------------------------------------
// Global Error Handler Middleware
// ---------------------------------------------------------------------------
//
// Express error-handling middleware that maps application errors to the
// standard API response envelope. Custom error classes (AppError subclasses)
// carry their own HTTP status code and machine-readable error code, so the
// handler simply reads those properties and formats the response.
//
// Unrecognised errors are treated as 500 Internal Server Error with a
// generic message — no stack traces or internal details are ever exposed
// to the client (Requirement 8.8).
//
// Requirements:
//   8.7 — Consistent JSON response structure
//   8.8 — Generic 500 for unhandled errors, no internal details
// ---------------------------------------------------------------------------

import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { ApiResponse } from '../types';

/**
 * Express error-handling middleware.
 *
 * Must have exactly four parameters so Express recognises it as an error
 * handler rather than a regular middleware.
 *
 * Behaviour:
 *   1. If the error is an `AppError` subclass, use its `statusCode` and
 *      `code` to build the response.
 *   2. Otherwise, log the full error for debugging and return a generic
 *      500 response with no internal details.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // --- Known application errors (AppError subclasses) ---
  if (err instanceof AppError) {
    const body: ApiResponse<never> = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    };

    res.status(err.statusCode).json(body);
    return;
  }

  // --- Unhandled / unexpected errors ---
  // Log the full error internally for debugging, but never expose details
  // to the client (Requirement 8.8).
  console.error('Unhandled error:', err);

  const body: ApiResponse<never> = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  };

  res.status(500).json(body);
}
