// ---------------------------------------------------------------------------
// Session Service — Unit Tests
// ---------------------------------------------------------------------------

import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSessionService, SessionRepositoryLike } from './sessionService';
import { InvalidSessionError, SessionExpiredError } from '../utils/errors';
import { Session, ClientMetadata } from '../types';

// ---------------------------------------------------------------------------
// Helpers — lightweight stubs for the session repository
// ---------------------------------------------------------------------------

/** Builds a mock session repository with sensible defaults and optional overrides. */
function createMockSessionRepository(
  overrides: Partial<SessionRepositoryLike> = {},
): SessionRepositoryLike {
  return {
    create: vi.fn(async () => {}),
    findByTokenHash: vi.fn(async () => null),
    findActiveByUserId: vi.fn(async () => []),
    revokeById: vi.fn(async () => {}),
    revokeAllByUserId: vi.fn(async () => 0),
    ...overrides,
  };
}

/** Creates a fake active session for testing. */
function makeFakeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    userId: 'user-1',
    tokenHash: 'abc123hash',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h from now
    revokedAt: null,
    clientMetadata: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionService', () => {
  let sessionRepository: SessionRepositoryLike;

  beforeEach(() => {
    sessionRepository = createMockSessionRepository();
  });

  // -----------------------------------------------------------------------
  // createSession
  // -----------------------------------------------------------------------

  describe('createSession', () => {
    it('should return a 64-character hex token and an expiration date', async () => {
      const service = createSessionService({ sessionRepository });

      const result = await service.createSession('user-1');

      // Token must be a 64-char hex string (32 bytes encoded as hex).
      expect(result.token).toMatch(/^[0-9a-f]{64}$/);
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('should set expiration to approximately 24 hours from now', async () => {
      const service = createSessionService({ sessionRepository });
      const before = Date.now();

      const result = await service.createSession('user-1');

      const after = Date.now();
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;

      // The expiry should be within a small tolerance of 24h from now.
      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(before + twentyFourHoursMs);
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(after + twentyFourHoursMs);
    });

    it('should store the SHA-256 hash of the token, not the plaintext', async () => {
      const service = createSessionService({ sessionRepository });

      const result = await service.createSession('user-1');

      // Verify the repository was called with the hash, not the plaintext.
      const createCall = (sessionRepository.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const expectedHash = crypto
        .createHash('sha256')
        .update(result.token)
        .digest('hex');

      expect(createCall.tokenHash).toBe(expectedHash);
      expect(createCall.tokenHash).not.toBe(result.token);
    });

    it('should generate a UUID for the session id', async () => {
      const service = createSessionService({ sessionRepository });

      await service.createSession('user-1');

      const createCall = (sessionRepository.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('should pass client metadata to the repository', async () => {
      const service = createSessionService({ sessionRepository });
      const metadata: ClientMetadata = { userAgent: 'TestAgent/1.0', ipAddress: '10.0.0.1' };

      await service.createSession('user-1', metadata);

      const createCall = (sessionRepository.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.clientMetadata).toEqual(metadata);
    });

    it('should default client metadata to an empty object when not provided', async () => {
      const service = createSessionService({ sessionRepository });

      await service.createSession('user-1');

      const createCall = (sessionRepository.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.clientMetadata).toEqual({});
    });
  });

  // -----------------------------------------------------------------------
  // validateSession
  // -----------------------------------------------------------------------

  describe('validateSession', () => {
    it('should return userId and sessionId for a valid, active session', async () => {
      const fakeSession = makeFakeSession();
      // Compute the token hash that the service will look up.
      const plainToken = 'a'.repeat(64);
      const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
      fakeSession.tokenHash = tokenHash;

      sessionRepository = createMockSessionRepository({
        findByTokenHash: vi.fn(async (hash: string) =>
          hash === tokenHash ? fakeSession : null,
        ),
      });
      const service = createSessionService({ sessionRepository });

      const result = await service.validateSession(plainToken);

      expect(result.userId).toBe('user-1');
      expect(result.sessionId).toBe('session-1');
    });

    it('should throw InvalidSessionError when no session matches the token', async () => {
      sessionRepository = createMockSessionRepository({
        findByTokenHash: vi.fn(async () => null),
      });
      const service = createSessionService({ sessionRepository });

      await expect(service.validateSession('nonexistent-token')).rejects.toThrow(
        InvalidSessionError,
      );
    });

    it('should throw InvalidSessionError when the session is revoked', async () => {
      const revokedSession = makeFakeSession({
        revokedAt: new Date('2025-01-01T12:00:00Z'),
      });

      sessionRepository = createMockSessionRepository({
        findByTokenHash: vi.fn(async () => revokedSession),
      });
      const service = createSessionService({ sessionRepository });

      await expect(service.validateSession('some-token')).rejects.toThrow(
        InvalidSessionError,
      );
    });

    it('should throw SessionExpiredError when the session has expired', async () => {
      const expiredSession = makeFakeSession({
        expiresAt: new Date('2020-01-01T00:00:00Z'), // well in the past
        revokedAt: null,
      });

      sessionRepository = createMockSessionRepository({
        findByTokenHash: vi.fn(async () => expiredSession),
      });
      const service = createSessionService({ sessionRepository });

      await expect(service.validateSession('some-token')).rejects.toThrow(
        SessionExpiredError,
      );
    });
  });

  // -----------------------------------------------------------------------
  // listSessions
  // -----------------------------------------------------------------------

  describe('listSessions', () => {
    it('should return active sessions without the token hash', async () => {
      const sessions: Session[] = [
        makeFakeSession({ id: 's1', clientMetadata: { userAgent: 'Chrome' } }),
        makeFakeSession({ id: 's2', clientMetadata: { ipAddress: '10.0.0.1' } }),
      ];

      sessionRepository = createMockSessionRepository({
        findActiveByUserId: vi.fn(async () => sessions),
      });
      const service = createSessionService({ sessionRepository });

      const result = await service.listSessions('user-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('s1');
      expect(result[1].id).toBe('s2');

      // Verify token hash is excluded from every entry.
      for (const info of result) {
        expect(info).not.toHaveProperty('tokenHash');
        expect(info).toHaveProperty('createdAt');
        expect(info).toHaveProperty('expiresAt');
        expect(info).toHaveProperty('clientMetadata');
      }
    });

    it('should return an empty array when the user has no active sessions', async () => {
      sessionRepository = createMockSessionRepository({
        findActiveByUserId: vi.fn(async () => []),
      });
      const service = createSessionService({ sessionRepository });

      const result = await service.listSessions('user-1');

      expect(result).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // revokeSession
  // -----------------------------------------------------------------------

  describe('revokeSession', () => {
    it('should delegate to the repository revokeById', async () => {
      const service = createSessionService({ sessionRepository });

      await service.revokeSession('user-1', 'session-42');

      expect(sessionRepository.revokeById).toHaveBeenCalledWith('session-42');
    });
  });

  // -----------------------------------------------------------------------
  // revokeAllSessions
  // -----------------------------------------------------------------------

  describe('revokeAllSessions', () => {
    it('should delegate to the repository revokeAllByUserId', async () => {
      const service = createSessionService({ sessionRepository });

      await service.revokeAllSessions('user-1');

      expect(sessionRepository.revokeAllByUserId).toHaveBeenCalledWith('user-1', undefined);
    });

    it('should pass the excludeSessionId when provided', async () => {
      const service = createSessionService({ sessionRepository });

      await service.revokeAllSessions('user-1', 'keep-this-session');

      expect(sessionRepository.revokeAllByUserId).toHaveBeenCalledWith(
        'user-1',
        'keep-this-session',
      );
    });
  });
});
