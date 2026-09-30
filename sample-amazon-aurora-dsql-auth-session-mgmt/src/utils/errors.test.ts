import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  ConflictError,
  SessionExpiredError,
  InvalidSessionError,
  ServiceUnavailableError,
} from './errors';

describe('Custom Error Classes', () => {
  describe('ValidationError', () => {
    it('should have status 400 and code VALIDATION_ERROR', () => {
      const error = new ValidationError('Email is required');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Email is required');
      expect(error.name).toBe('ValidationError');
      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('AuthenticationError', () => {
    it('should have status 401 and code AUTHENTICATION_FAILED', () => {
      const error = new AuthenticationError();
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('AUTHENTICATION_FAILED');
      expect(error.message).toBe('Invalid email or password');
    });

    it('should accept a custom message', () => {
      const error = new AuthenticationError('Custom auth message');
      expect(error.message).toBe('Custom auth message');
      expect(error.statusCode).toBe(401);
    });
  });

  describe('ConflictError', () => {
    it('should have status 409 and code EMAIL_ALREADY_EXISTS', () => {
      const error = new ConflictError();
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('EMAIL_ALREADY_EXISTS');
      expect(error.message).toBe('Email already exists');
    });
  });

  describe('SessionExpiredError', () => {
    it('should have status 401 and code INVALID_SESSION', () => {
      const error = new SessionExpiredError();
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('INVALID_SESSION');
      expect(error.message).toBe('Session has expired');
    });
  });

  describe('InvalidSessionError', () => {
    it('should have status 401 and code INVALID_SESSION', () => {
      const error = new InvalidSessionError();
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('INVALID_SESSION');
      expect(error.message).toBe('Invalid session');
    });
  });

  describe('ServiceUnavailableError', () => {
    it('should have status 503 and code SERVICE_UNAVAILABLE', () => {
      const error = new ServiceUnavailableError();
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe('SERVICE_UNAVAILABLE');
      expect(error.message).toBe('Service temporarily unavailable');
    });
  });

  describe('instanceof checks', () => {
    it('all custom errors should be instances of AppError and Error', () => {
      const errors = [
        new ValidationError('test'),
        new AuthenticationError(),
        new ConflictError(),
        new SessionExpiredError(),
        new InvalidSessionError(),
        new ServiceUnavailableError(),
      ];

      for (const error of errors) {
        expect(error).toBeInstanceOf(AppError);
        expect(error).toBeInstanceOf(Error);
      }
    });
  });
});
