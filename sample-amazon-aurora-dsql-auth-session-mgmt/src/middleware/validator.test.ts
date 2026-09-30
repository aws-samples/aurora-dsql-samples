import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import {
  createValidator,
  validateRegistration,
  validateLogin,
  validateSessionId,
  validateEmail,
  validatePassword,
  validateUuid,
} from './validator';
import { ValidationError } from '../utils/errors';

// ---------------------------------------------------------------------------
// Helpers — build minimal Express-like objects for middleware testing
// ---------------------------------------------------------------------------

function mockReq(body: Record<string, unknown> = {}, params: Record<string, string> = {}): Request {
  return { body, params } as unknown as Request;
}

function mockRes(): Response {
  return {} as Response;
}

// ---------------------------------------------------------------------------
// Unit helpers (validateEmail, validatePassword, validateUuid)
// ---------------------------------------------------------------------------

describe('validateEmail', () => {
  it('rejects missing / empty values', () => {
    expect(validateEmail(undefined)).toBe('Email is required');
    expect(validateEmail(null)).toBe('Email is required');
    expect(validateEmail('')).toBe('Email is required');
    expect(validateEmail('   ')).toBe('Email is required');
  });

  it('rejects emails without @', () => {
    expect(validateEmail('userexample.com')).toBe('Email format is invalid');
  });

  it('rejects emails with empty local part', () => {
    expect(validateEmail('@example.com')).toBe('Email format is invalid');
  });

  it('rejects emails with no domain dot', () => {
    expect(validateEmail('user@localhost')).toBe('Email format is invalid');
  });

  it('rejects emails with domain ending in dot', () => {
    expect(validateEmail('user@example.')).toBe('Email format is invalid');
  });

  it('rejects emails exceeding 254 characters', () => {
    const long = 'a'.repeat(245) + '@test.com'; // 254 chars exactly is fine
    expect(validateEmail(long)).toBeNull();

    const tooLong = 'a'.repeat(246) + '@test.com'; // 255 chars
    expect(validateEmail(tooLong)).toBe('Email must not exceed 254 characters');
  });

  it('rejects emails with multiple @ signs', () => {
    expect(validateEmail('user@@example.com')).toBe('Email format is invalid');
    expect(validateEmail('user@foo@example.com')).toBe('Email format is invalid');
  });

  it('accepts valid emails', () => {
    expect(validateEmail('user@example.com')).toBeNull();
    expect(validateEmail('USER@Example.COM')).toBeNull();
    expect(validateEmail('  user@example.com  ')).toBeNull();
  });
});

describe('validatePassword', () => {
  it('rejects missing / empty values', () => {
    expect(validatePassword(undefined)).toBe('Password is required');
    expect(validatePassword(null)).toBe('Password is required');
    expect(validatePassword('')).toBe('Password is required');
  });

  it('rejects passwords shorter than 8 chars when length enforced', () => {
    expect(validatePassword('short', true)).toBe('Password must be at least 8 characters');
  });

  it('rejects passwords longer than 128 chars when length enforced', () => {
    expect(validatePassword('a'.repeat(129), true)).toBe('Password must not exceed 128 characters');
  });

  it('accepts valid passwords with length enforcement', () => {
    expect(validatePassword('abcdefgh', true)).toBeNull();
    expect(validatePassword('a'.repeat(128), true)).toBeNull();
  });

  it('skips length checks when requireLength is false', () => {
    expect(validatePassword('short', false)).toBeNull();
    expect(validatePassword('a'.repeat(200), false)).toBeNull();
  });
});

describe('validateUuid', () => {
  it('rejects missing values', () => {
    expect(validateUuid(undefined, 'ID')).toBe('ID is required');
    expect(validateUuid('', 'ID')).toBe('ID is required');
  });

  it('rejects non-UUID strings', () => {
    expect(validateUuid('not-a-uuid', 'ID')).toBe('ID must be a valid UUID');
    expect(validateUuid('12345', 'ID')).toBe('ID must be a valid UUID');
  });

  it('accepts valid UUIDs', () => {
    expect(validateUuid('550e8400-e29b-41d4-a716-446655440000', 'ID')).toBeNull();
    expect(validateUuid('A550E840-E29B-41D4-A716-446655440000', 'ID')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Middleware: createValidator
// ---------------------------------------------------------------------------

describe('createValidator', () => {
  it('calls next() with no error when all rules pass', () => {
    const middleware = createValidator([
      { field: 'email', required: true, type: 'email' },
    ]);
    const next = vi.fn();
    middleware(mockReq({ email: 'user@example.com' }), mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next(ValidationError) when a required field is missing', () => {
    const middleware = createValidator([
      { field: 'name', required: true, type: 'string' },
    ]);
    const next = vi.fn();
    middleware(mockReq({}), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
    expect((next.mock.calls[0][0] as ValidationError).message).toBe('Name is required');
  });

  it('normalizes email to lowercase and trims whitespace on req.body', () => {
    const middleware = createValidator([
      { field: 'email', required: true, type: 'email' },
    ]);
    const req = mockReq({ email: '  User@Example.COM  ' });
    const next = vi.fn();
    middleware(req, mockRes(), next);
    expect(req.body.email).toBe('user@example.com');
    expect(next).toHaveBeenCalledWith();
  });

  it('validates string type with maxLength', () => {
    const middleware = createValidator([
      { field: 'name', required: true, type: 'string', maxLength: 5 },
    ]);
    const next = vi.fn();
    middleware(mockReq({ name: 'toolong' }), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
    expect((next.mock.calls[0][0] as ValidationError).message).toBe(
      'Name must not exceed 5 characters',
    );
  });

  it('rejects non-string values for string type', () => {
    const middleware = createValidator([
      { field: 'name', required: true, type: 'string' },
    ]);
    const next = vi.fn();
    middleware(mockReq({ name: 123 }), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
    expect((next.mock.calls[0][0] as ValidationError).message).toBe(
      'Name must be a string',
    );
  });

  it('skips optional fields that are absent', () => {
    const middleware = createValidator([
      { field: 'nickname', required: false, type: 'string' },
    ]);
    const next = vi.fn();
    middleware(mockReq({}), mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });
});

// ---------------------------------------------------------------------------
// Pre-built middleware: validateRegistration
// ---------------------------------------------------------------------------

describe('validateRegistration', () => {
  it('passes with valid email and password', () => {
    const next = vi.fn();
    validateRegistration(
      mockReq({ email: 'user@example.com', password: 'securepass' }),
      mockRes(),
      next,
    );
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects missing email', () => {
    const next = vi.fn();
    validateRegistration(mockReq({ password: 'securepass' }), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
  });

  it('rejects missing password', () => {
    const next = vi.fn();
    validateRegistration(mockReq({ email: 'user@example.com' }), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
  });

  it('rejects short password', () => {
    const next = vi.fn();
    validateRegistration(
      mockReq({ email: 'user@example.com', password: 'short' }),
      mockRes(),
      next,
    );
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
    expect((next.mock.calls[0][0] as ValidationError).message).toBe(
      'Password must be at least 8 characters',
    );
  });

  it('rejects password exceeding 128 chars', () => {
    const next = vi.fn();
    validateRegistration(
      mockReq({ email: 'user@example.com', password: 'a'.repeat(129) }),
      mockRes(),
      next,
    );
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
    expect((next.mock.calls[0][0] as ValidationError).message).toBe(
      'Password must not exceed 128 characters',
    );
  });
});

// ---------------------------------------------------------------------------
// Pre-built middleware: validateLogin
// ---------------------------------------------------------------------------

describe('validateLogin', () => {
  it('passes with valid email and password (no length enforcement)', () => {
    const next = vi.fn();
    validateLogin(
      mockReq({ email: 'user@example.com', password: 'pw' }),
      mockRes(),
      next,
    );
    // Login does not enforce password length — only presence
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects missing email', () => {
    const next = vi.fn();
    validateLogin(mockReq({ password: 'pw' }), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
  });

  it('rejects missing password', () => {
    const next = vi.fn();
    validateLogin(mockReq({ email: 'user@example.com' }), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
  });
});

// ---------------------------------------------------------------------------
// Pre-built middleware: validateSessionId
// ---------------------------------------------------------------------------

describe('validateSessionId', () => {
  it('passes with a valid UUID param', () => {
    const next = vi.fn();
    validateSessionId(
      mockReq({}, { sessionId: '550e8400-e29b-41d4-a716-446655440000' }),
      mockRes(),
      next,
    );
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects an invalid UUID param', () => {
    const next = vi.fn();
    validateSessionId(mockReq({}, { sessionId: 'bad' }), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
    expect((next.mock.calls[0][0] as ValidationError).message).toBe(
      'Session ID must be a valid UUID',
    );
  });

  it('rejects a missing sessionId param', () => {
    const next = vi.fn();
    validateSessionId(mockReq({}, {}), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
  });
});
