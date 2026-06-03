// ---------------------------------------------------------------------------
// Auth Routes — Unit Tests
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import { createAuthRoutes, AuthServiceLike } from './authRoutes';
import { errorHandler } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../types';
import {
  ConflictError,
  AuthenticationError,
  ValidationError,
} from '../utils/errors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a test Express app with auth routes mounted at /api/auth.
 *
 * The auth middleware stub attaches a fixed user context so protected
 * routes can be tested without real session validation.
 */
function buildApp(overrides?: Partial<AuthServiceLike>) {
  const authService: AuthServiceLike = {
    register: overrides?.register ??
      vi.fn().mockResolvedValue({
        id: 'user-1',
        email: 'alice@example.com',
        createdAt: new Date('2025-01-01T00:00:00Z'),
      }),
    login: overrides?.login ??
      vi.fn().mockResolvedValue({
        token: 'session-token-abc',
        expiresAt: new Date('2025-01-02T00:00:00Z'),
      }),
    getProfile: overrides?.getProfile ??
      vi.fn().mockResolvedValue({
        id: 'user-1',
        email: 'alice@example.com',
        createdAt: new Date('2025-01-01T00:00:00Z'),
      }),
  };

  // Stub auth middleware that attaches a fixed user context.
  const authMiddleware = (req: Request, _res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    authReq.user = { id: 'user-1', email: 'alice@example.com' };
    authReq.sessionId = 'session-1';
    next();
  };

  const app = express();
  app.use(express.json());

  const router = createAuthRoutes({ authService, authMiddleware });
  app.use('/api/auth', router);
  app.use(errorHandler);

  return { app, authService };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/auth/register', () => {
  it('returns 201 with user data on successful registration', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'alice@example.com', password: 'secureP@ss1' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      id: 'user-1',
      email: 'alice@example.com',
    });
    expect(res.body.data.createdAt).toBeDefined();
  });

  it('calls authService.register with the provided email and password', async () => {
    const { app, authService } = buildApp();

    await request(app)
      .post('/api/auth/register')
      .send({ email: 'bob@example.com', password: 'mypassword1' });

    expect(authService.register).toHaveBeenCalledWith(
      'bob@example.com',
      'mypassword1',
    );
  });

  it('returns 409 when email already exists', async () => {
    const { app } = buildApp({
      register: vi.fn().mockRejectedValue(new ConflictError()),
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'alice@example.com', password: 'secureP@ss1' });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('returns 400 when email is missing', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post('/api/auth/register')
      .send({ password: 'secureP@ss1' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when password is too short', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'alice@example.com', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/auth/login', () => {
  it('returns 200 with token and expiry on successful login', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'secureP@ss1' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      token: 'session-token-abc',
    });
    expect(res.body.data.expiresAt).toBeDefined();
  });

  it('passes client metadata to authService.login', async () => {
    const { app, authService } = buildApp();

    await request(app)
      .post('/api/auth/login')
      .set('User-Agent', 'TestBrowser/1.0')
      .send({ email: 'alice@example.com', password: 'secureP@ss1' });

    expect(authService.login).toHaveBeenCalledWith(
      'alice@example.com',
      'secureP@ss1',
      expect.objectContaining({
        userAgent: 'TestBrowser/1.0',
      }),
    );
  });

  it('returns 401 with generic message for invalid credentials', async () => {
    const { app } = buildApp({
      login: vi.fn().mockRejectedValue(new AuthenticationError()),
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('AUTHENTICATION_FAILED');
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('returns 400 when email is missing', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'secureP@ss1' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when password is missing', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/auth/me', () => {
  it('returns 200 with user profile for authenticated requests', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      id: 'user-1',
      email: 'alice@example.com',
    });
    expect(res.body.data.createdAt).toBeDefined();
  });

  it('calls authService.getProfile with the authenticated user ID', async () => {
    const { app, authService } = buildApp();

    await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer valid-token');

    expect(authService.getProfile).toHaveBeenCalledWith('user-1');
  });
});
