// ---------------------------------------------------------------------------
// Auth Service — Unit Tests
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAuthService, UserRepositoryLike, SessionServiceLike } from './authService';
import { AuthenticationError, ConflictError } from '../utils/errors';

// ---------------------------------------------------------------------------
// Helpers — lightweight stubs for dependencies
// ---------------------------------------------------------------------------

function createMockUserRepository(overrides: Partial<UserRepositoryLike> = {}): UserRepositoryLike {
  return {
    create: vi.fn(async (user) => ({
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      createdAt: new Date('2025-01-01T00:00:00Z'),
    })),
    findByEmail: vi.fn(async () => null),
    findById: vi.fn(async () => null),
    ...overrides,
  };
}

function createMockSessionService(overrides: Partial<SessionServiceLike> = {}): SessionServiceLike {
  return {
    createSession: vi.fn(async () => ({
      token: 'mock-session-token',
      expiresAt: new Date('2025-01-02T00:00:00Z'),
    })),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthService', () => {
  let userRepository: UserRepositoryLike;
  let sessionService: SessionServiceLike;

  beforeEach(() => {
    userRepository = createMockUserRepository();
    sessionService = createMockSessionService();
  });

  // -----------------------------------------------------------------------
  // register
  // -----------------------------------------------------------------------

  describe('register', () => {
    it('should create a user and return the public profile', async () => {
      const authService = createAuthService({ userRepository, sessionService });

      const result = await authService.register('alice@example.com', 'secureP@ss1');

      // The returned profile should contain id, email, and createdAt
      expect(result).toHaveProperty('id');
      expect(result.email).toBe('alice@example.com');
      expect(result.createdAt).toBeInstanceOf(Date);

      // The repository should have been called with a UUID and a bcrypt hash
      expect(userRepository.create).toHaveBeenCalledOnce();
      const createArg = (userRepository.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createArg.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(createArg.email).toBe('alice@example.com');
      // Password hash should be a bcrypt string, not the plaintext password
      expect(createArg.passwordHash).toMatch(/^\$2[aby]\$/);
    });

    it('should not expose the password hash in the returned profile', async () => {
      const authService = createAuthService({ userRepository, sessionService });

      const result = await authService.register('bob@example.com', 'p@ssword123');

      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('password');
    });

    it('should propagate ConflictError for duplicate emails', async () => {
      userRepository = createMockUserRepository({
        create: vi.fn(async () => {
          throw new ConflictError('Email already exists');
        }),
      });
      const authService = createAuthService({ userRepository, sessionService });

      await expect(authService.register('dup@example.com', 'p@ssword123')).rejects.toThrow(
        ConflictError,
      );
    });
  });

  // -----------------------------------------------------------------------
  // login
  // -----------------------------------------------------------------------

  describe('login', () => {
    it('should authenticate and return a session token for valid credentials', async () => {
      // We need a real bcrypt hash for the mock user so `verify` works
      const { hash } = await import('../utils/passwordHasher');
      const passwordHash = await hash('correctPassword1');

      userRepository = createMockUserRepository({
        findByEmail: vi.fn(async () => ({
          id: 'user-123',
          email: 'alice@example.com',
          passwordHash,
          createdAt: new Date('2025-01-01T00:00:00Z'),
        })),
      });

      const authService = createAuthService({ userRepository, sessionService });

      const result = await authService.login('alice@example.com', 'correctPassword1');

      expect(result.token).toBe('mock-session-token');
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(sessionService.createSession).toHaveBeenCalledWith('user-123', undefined);
    });

    it('should pass client metadata to the session service', async () => {
      const { hash } = await import('../utils/passwordHasher');
      const passwordHash = await hash('correctPassword1');

      userRepository = createMockUserRepository({
        findByEmail: vi.fn(async () => ({
          id: 'user-123',
          email: 'alice@example.com',
          passwordHash,
          createdAt: new Date('2025-01-01T00:00:00Z'),
        })),
      });

      const authService = createAuthService({ userRepository, sessionService });
      const metadata = { userAgent: 'TestAgent/1.0', ipAddress: '127.0.0.1' };

      await authService.login('alice@example.com', 'correctPassword1', metadata);

      expect(sessionService.createSession).toHaveBeenCalledWith('user-123', metadata);
    });

    it('should throw AuthenticationError when email is not found', async () => {
      userRepository = createMockUserRepository({
        findByEmail: vi.fn(async () => null),
      });
      const authService = createAuthService({ userRepository, sessionService });

      await expect(
        authService.login('unknown@example.com', 'anyPassword1'),
      ).rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthenticationError when password is incorrect', async () => {
      const { hash } = await import('../utils/passwordHasher');
      const passwordHash = await hash('correctPassword1');

      userRepository = createMockUserRepository({
        findByEmail: vi.fn(async () => ({
          id: 'user-123',
          email: 'alice@example.com',
          passwordHash,
          createdAt: new Date('2025-01-01T00:00:00Z'),
        })),
      });

      const authService = createAuthService({ userRepository, sessionService });

      await expect(
        authService.login('alice@example.com', 'wrongPassword1'),
      ).rejects.toThrow(AuthenticationError);
    });

    it('should use the same error message for email-not-found and wrong-password', async () => {
      const { hash } = await import('../utils/passwordHasher');
      const passwordHash = await hash('correctPassword1');

      // Case 1: email not found
      const repoNoUser = createMockUserRepository({
        findByEmail: vi.fn(async () => null),
      });
      const serviceNoUser = createAuthService({
        userRepository: repoNoUser,
        sessionService,
      });

      let errorNoUser: AuthenticationError | undefined;
      try {
        await serviceNoUser.login('missing@example.com', 'anyPassword1');
      } catch (e) {
        errorNoUser = e as AuthenticationError;
      }

      // Case 2: wrong password
      const repoWrongPw = createMockUserRepository({
        findByEmail: vi.fn(async () => ({
          id: 'user-123',
          email: 'alice@example.com',
          passwordHash,
          createdAt: new Date('2025-01-01T00:00:00Z'),
        })),
      });
      const serviceWrongPw = createAuthService({
        userRepository: repoWrongPw,
        sessionService,
      });

      let errorWrongPw: AuthenticationError | undefined;
      try {
        await serviceWrongPw.login('alice@example.com', 'wrongPassword1');
      } catch (e) {
        errorWrongPw = e as AuthenticationError;
      }

      // Both errors should have the same message (Requirement 2.4)
      expect(errorNoUser).toBeInstanceOf(AuthenticationError);
      expect(errorWrongPw).toBeInstanceOf(AuthenticationError);
      expect(errorNoUser!.message).toBe(errorWrongPw!.message);
    });
  });

  // -----------------------------------------------------------------------
  // getProfile
  // -----------------------------------------------------------------------

  describe('getProfile', () => {
    it('should return the public profile for an existing user', async () => {
      userRepository = createMockUserRepository({
        findById: vi.fn(async () => ({
          id: 'user-123',
          email: 'alice@example.com',
          passwordHash: '$2a$10$somehash',
          createdAt: new Date('2025-01-01T00:00:00Z'),
        })),
      });
      const authService = createAuthService({ userRepository, sessionService });

      const profile = await authService.getProfile('user-123');

      expect(profile.id).toBe('user-123');
      expect(profile.email).toBe('alice@example.com');
      expect(profile.createdAt).toBeInstanceOf(Date);
      // Must not leak the password hash
      expect(profile).not.toHaveProperty('passwordHash');
    });

    it('should throw AuthenticationError when user is not found', async () => {
      userRepository = createMockUserRepository({
        findById: vi.fn(async () => null),
      });
      const authService = createAuthService({ userRepository, sessionService });

      await expect(authService.getProfile('nonexistent-id')).rejects.toThrow(
        AuthenticationError,
      );
    });
  });
});
