// ---------------------------------------------------------------------------
// Auth Middleware — Unit Tests
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { Response, NextFunction } from 'express';
import { createAuthMiddleware, SessionServiceLike, UserRepositoryLike } from './auth';
import { AuthenticatedRequest } from '../types';
import { InvalidSessionError, SessionExpiredError } from '../utils/errors';

// ---------------------------------------------------------------------------
// Helpers — build minimal Express-like objects for middleware testing
// ---------------------------------------------------------------------------

function mockReq(headers: Record<string, string> = {}): AuthenticatedRequest {
  return {
    headers,
    user: undefined as unknown as { id: string; email: string },
    sessionId: undefined as unknown as string,
  } as unknown as AuthenticatedRequest;
}

function mockRes(): Response {
  return {} as Response;
}

// ---------------------------------------------------------------------------
// Stub factories
// ---------------------------------------------------------------------------

function createStubs(overrides?: {
  validateSession?: SessionServiceLike['validateSession'];
  findById?: UserRepositoryLike['findById'];
}) {
  const sessionService: SessionServiceLike = {
    validateSession: overrides?.validateSession ??
      vi.fn().mockResolvedValue({ userId: 'user-1', sessionId: 'session-1' }),
  };

  const userRepository: UserRepositoryLike = {
    findById: overrides?.findById ??
      vi.fn().mockResolvedValue({ id: 'user-1', email: 'alice@example.com' }),
  };

  return { sessionService, userRepository };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createAuthMiddleware', () => {
  it('attaches user and sessionId to the request for a valid token', async () => {
    const { sessionService, userRepository } = createStubs();
    const middleware = createAuthMiddleware({ sessionService, userRepository });

    const req = mockReq({ authorization: 'Bearer valid-token-abc' });
    const next = vi.fn();

    await middleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual({ id: 'user-1', email: 'alice@example.com' });
    expect(req.sessionId).toBe('session-1');
    expect(sessionService.validateSession).toHaveBeenCalledWith('valid-token-abc');
    expect(userRepository.findById).toHaveBeenCalledWith('user-1');
  });

  it('calls next with InvalidSessionError when Authorization header is missing', async () => {
    const { sessionService, userRepository } = createStubs();
    const middleware = createAuthMiddleware({ sessionService, userRepository });

    const req = mockReq({});
    const next = vi.fn();

    await middleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(InvalidSessionError));
    expect((next.mock.calls[0][0] as InvalidSessionError).message).toBe(
      'Authorization header is required',
    );
  });

  it('calls next with InvalidSessionError when Authorization header has wrong scheme', async () => {
    const { sessionService, userRepository } = createStubs();
    const middleware = createAuthMiddleware({ sessionService, userRepository });

    const req = mockReq({ authorization: 'Basic abc123' });
    const next = vi.fn();

    await middleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(InvalidSessionError));
    expect((next.mock.calls[0][0] as InvalidSessionError).message).toBe(
      'Authorization header must use the Bearer scheme',
    );
  });

  it('calls next with InvalidSessionError when Bearer token is empty', async () => {
    const { sessionService, userRepository } = createStubs();
    const middleware = createAuthMiddleware({ sessionService, userRepository });

    const req = mockReq({ authorization: 'Bearer ' });
    const next = vi.fn();

    await middleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(InvalidSessionError));
    // Distinct from the "no header" message — this case is "header is
    // present and uses the Bearer scheme, but the token slot is empty".
    expect((next.mock.calls[0][0] as InvalidSessionError).message).toBe(
      'Bearer token is missing from Authorization header',
    );
  });

  it('propagates InvalidSessionError from session service for invalid tokens', async () => {
    const { sessionService, userRepository } = createStubs({
      validateSession: vi.fn().mockRejectedValue(new InvalidSessionError()),
    });
    const middleware = createAuthMiddleware({ sessionService, userRepository });

    const req = mockReq({ authorization: 'Bearer bad-token' });
    const next = vi.fn();

    await middleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(InvalidSessionError));
    expect((next.mock.calls[0][0] as InvalidSessionError).message).toBe('Invalid session');
  });

  it('propagates SessionExpiredError from session service for expired tokens', async () => {
    const { sessionService, userRepository } = createStubs({
      validateSession: vi.fn().mockRejectedValue(new SessionExpiredError()),
    });
    const middleware = createAuthMiddleware({ sessionService, userRepository });

    const req = mockReq({ authorization: 'Bearer expired-token' });
    const next = vi.fn();

    await middleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(SessionExpiredError));
    expect((next.mock.calls[0][0] as SessionExpiredError).message).toBe('Session has expired');
  });

  it('calls next with InvalidSessionError when user is not found', async () => {
    const { sessionService, userRepository } = createStubs({
      findById: vi.fn().mockResolvedValue(null),
    });
    const middleware = createAuthMiddleware({ sessionService, userRepository });

    const req = mockReq({ authorization: 'Bearer valid-token' });
    const next = vi.fn();

    await middleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(InvalidSessionError));
    expect((next.mock.calls[0][0] as InvalidSessionError).message).toBe('User not found');
  });

  it('does not call userRepository.findById when session validation fails', async () => {
    const findById = vi.fn();
    const { sessionService } = createStubs({
      validateSession: vi.fn().mockRejectedValue(new InvalidSessionError()),
    });
    const userRepository: UserRepositoryLike = { findById };
    const middleware = createAuthMiddleware({ sessionService, userRepository });

    const req = mockReq({ authorization: 'Bearer bad-token' });
    const next = vi.fn();

    await middleware(req, mockRes(), next);

    expect(findById).not.toHaveBeenCalled();
  });

  it('propagates unexpected errors from session service', async () => {
    const unexpectedError = new Error('Database connection lost');
    const { sessionService, userRepository } = createStubs({
      validateSession: vi.fn().mockRejectedValue(unexpectedError),
    });
    const middleware = createAuthMiddleware({ sessionService, userRepository });

    const req = mockReq({ authorization: 'Bearer some-token' });
    const next = vi.fn();

    await middleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith(unexpectedError);
  });

  it('propagates unexpected errors from user repository', async () => {
    const unexpectedError = new Error('Database timeout');
    const { sessionService, userRepository } = createStubs({
      findById: vi.fn().mockRejectedValue(unexpectedError),
    });
    const middleware = createAuthMiddleware({ sessionService, userRepository });

    const req = mockReq({ authorization: 'Bearer some-token' });
    const next = vi.fn();

    await middleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith(unexpectedError);
  });
});
