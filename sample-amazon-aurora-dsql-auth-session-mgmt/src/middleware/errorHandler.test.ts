// ---------------------------------------------------------------------------
// Error Handler Middleware — Unit Tests
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import { errorHandler } from './errorHandler';
import {
  ValidationError,
  AuthenticationError,
  ConflictError,
  SessionExpiredError,
  InvalidSessionError,
  ServiceUnavailableError,
} from '../utils/errors';

// ---------------------------------------------------------------------------
// Helper — build a test app that throws a given error
// ---------------------------------------------------------------------------

function buildApp(error: Error) {
  const app = express();
  app.use(express.json());

  app.get('/test', (_req: Request, _res: Response, next: NextFunction) => {
    next(error);
  });

  app.use(errorHandler);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('errorHandler', () => {
  it('maps ValidationError to 400 with VALIDATION_ERROR code', async () => {
    const app = buildApp(new ValidationError('Email is required'));

    const res = await request(app).get('/test');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Email is required',
      },
    });
  });

  it('maps AuthenticationError to 401 with AUTHENTICATION_FAILED code', async () => {
    const app = buildApp(new AuthenticationError());

    const res = await request(app).get('/test');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'AUTHENTICATION_FAILED',
        message: 'Invalid email or password',
      },
    });
  });

  it('maps ConflictError to 409 with EMAIL_ALREADY_EXISTS code', async () => {
    const app = buildApp(new ConflictError());

    const res = await request(app).get('/test');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'Email already exists',
      },
    });
  });

  it('maps SessionExpiredError to 401 with INVALID_SESSION code', async () => {
    const app = buildApp(new SessionExpiredError());

    const res = await request(app).get('/test');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'INVALID_SESSION',
        message: 'Session has expired',
      },
    });
  });

  it('maps InvalidSessionError to 401 with INVALID_SESSION code', async () => {
    const app = buildApp(new InvalidSessionError());

    const res = await request(app).get('/test');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'INVALID_SESSION',
        message: 'Invalid session',
      },
    });
  });

  it('maps ServiceUnavailableError to 503 with SERVICE_UNAVAILABLE code', async () => {
    const app = buildApp(new ServiceUnavailableError());

    const res = await request(app).get('/test');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service temporarily unavailable',
      },
    });
  });

  it('maps unknown errors to 500 with generic message', async () => {
    // Suppress console.error output during this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const app = buildApp(new Error('Database connection lost'));

    const res = await request(app).get('/test');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });

    // Verify the full error was logged internally
    expect(consoleSpy).toHaveBeenCalledWith(
      'Unhandled error:',
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  it('does not expose internal error details for unknown errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const app = buildApp(new Error('SELECT * FROM secret_table'));

    const res = await request(app).get('/test');

    // The response should not contain the internal error message
    expect(res.body.error.message).toBe('An unexpected error occurred');
    expect(JSON.stringify(res.body)).not.toContain('secret_table');

    vi.restoreAllMocks();
  });

  it('preserves custom messages on AppError subclasses', async () => {
    const app = buildApp(new ValidationError('Password must be at least 8 characters'));

    const res = await request(app).get('/test');

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Password must be at least 8 characters');
  });
});
