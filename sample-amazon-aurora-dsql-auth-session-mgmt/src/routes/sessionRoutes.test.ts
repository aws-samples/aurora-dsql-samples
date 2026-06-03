// ---------------------------------------------------------------------------
// Session Routes — Unit Tests
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import { createSessionRoutes, SessionServiceLike } from './sessionRoutes';
import { errorHandler } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a test Express app with session routes mounted at /api/sessions.
 *
 * The auth middleware stub attaches a fixed user context so all routes
 * can be tested without real session validation.
 */
function buildApp(overrides?: Partial<SessionServiceLike>) {
  const sessionService: SessionServiceLike = {
    listSessions: overrides?.listSessions ??
      vi.fn().mockResolvedValue([
        {
          id: 'session-1',
          createdAt: new Date('2025-01-01T00:00:00Z'),
          expiresAt: new Date('2025-01-02T00:00:00Z'),
          clientMetadata: { userAgent: 'TestBrowser/1.0' },
        },
        {
          id: 'session-2',
          createdAt: new Date('2025-01-01T12:00:00Z'),
          expiresAt: new Date('2025-01-02T12:00:00Z'),
          clientMetadata: {},
        },
      ]),
    revokeSession: overrides?.revokeSession ?? vi.fn().mockResolvedValue(undefined),
    revokeAllSessions: overrides?.revokeAllSessions ?? vi.fn().mockResolvedValue(undefined),
  };

  // Stub auth middleware that attaches a fixed user context.
  const authMiddleware = (req: Request, _res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    authReq.user = { id: 'user-1', email: 'alice@example.com' };
    authReq.sessionId = 'current-session-id';
    next();
  };

  const app = express();
  app.use(express.json());

  const router = createSessionRoutes({ sessionService, authMiddleware });
  app.use('/api/sessions', router);
  app.use(errorHandler);

  return { app, sessionService };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/sessions', () => {
  it('returns 200 with a list of active sessions', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .get('/api/sessions')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({ id: 'session-1' });
    expect(res.body.data[1]).toMatchObject({ id: 'session-2' });
  });

  it('calls sessionService.listSessions with the authenticated user ID', async () => {
    const { app, sessionService } = buildApp();

    await request(app)
      .get('/api/sessions')
      .set('Authorization', 'Bearer valid-token');

    expect(sessionService.listSessions).toHaveBeenCalledWith('user-1');
  });

  it('returns 200 with empty array when user has no active sessions', async () => {
    const { app } = buildApp({
      listSessions: vi.fn().mockResolvedValue([]),
    });

    const res = await request(app)
      .get('/api/sessions')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });
});

describe('DELETE /api/sessions/:sessionId', () => {
  it('returns 200 on successful session revocation', async () => {
    const { app } = buildApp();

    const sessionId = '550e8400-e29b-41d4-a716-446655440000';
    const res = await request(app)
      .delete(`/api/sessions/${sessionId}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toBe('Session revoked');
  });

  it('calls sessionService.revokeSession with user ID and session ID', async () => {
    const { app, sessionService } = buildApp();

    const sessionId = '550e8400-e29b-41d4-a716-446655440000';
    await request(app)
      .delete(`/api/sessions/${sessionId}`)
      .set('Authorization', 'Bearer valid-token');

    expect(sessionService.revokeSession).toHaveBeenCalledWith('user-1', sessionId);
  });

  it('returns 400 when session ID is not a valid UUID', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .delete('/api/sessions/not-a-uuid')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('DELETE /api/sessions', () => {
  it('returns 200 on successful revocation of all sessions', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .delete('/api/sessions')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toBe('All sessions revoked');
  });

  it('calls sessionService.revokeAllSessions without exclusion by default', async () => {
    const { app, sessionService } = buildApp();

    await request(app)
      .delete('/api/sessions')
      .set('Authorization', 'Bearer valid-token');

    expect(sessionService.revokeAllSessions).toHaveBeenCalledWith(
      'user-1',
      undefined,
    );
  });

  it('passes current session ID as exclusion when excludeCurrent=true', async () => {
    const { app, sessionService } = buildApp();

    await request(app)
      .delete('/api/sessions?excludeCurrent=true')
      .set('Authorization', 'Bearer valid-token');

    expect(sessionService.revokeAllSessions).toHaveBeenCalledWith(
      'user-1',
      'current-session-id',
    );
  });

  it('does not exclude current session when excludeCurrent is not "true"', async () => {
    const { app, sessionService } = buildApp();

    await request(app)
      .delete('/api/sessions?excludeCurrent=false')
      .set('Authorization', 'Bearer valid-token');

    expect(sessionService.revokeAllSessions).toHaveBeenCalledWith(
      'user-1',
      undefined,
    );
  });
});
