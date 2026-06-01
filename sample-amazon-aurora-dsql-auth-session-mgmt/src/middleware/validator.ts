// ---------------------------------------------------------------------------
// Request Validation Middleware
// ---------------------------------------------------------------------------
//
// Validates and sanitizes incoming request payloads before they reach service
// logic. Each middleware function checks the relevant fields and calls
// `next(error)` with a `ValidationError` on the first violation, letting the
// global error handler format the response.
//
// Email addresses are trimmed and lowercased *in place* on `req.body` so that
// downstream code always receives the normalized value.
// ---------------------------------------------------------------------------

import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../utils/errors';
import { ValidationRule } from '../types';

// ---------------------------------------------------------------------------
// Core validation helpers
// ---------------------------------------------------------------------------

/**
 * Validates an email string and returns a descriptive error message, or
 * `null` when the value is acceptable.
 *
 * Rules applied (Requirements 1.5, 10.3, 10.4):
 *  - Must be present (non-empty after trimming)
 *  - Must contain exactly one `@` with non-empty local and domain parts
 *  - Domain must contain at least one `.`
 *  - Must not exceed 254 characters (RFC 5321 path limit)
 */
function validateEmail(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 'Email is required';
  }

  const trimmed = value.trim().toLowerCase();

  if (trimmed.length > 254) {
    return 'Email must not exceed 254 characters';
  }

  // Split on `@` — there must be exactly one, with content on both sides
  const atIndex = trimmed.indexOf('@');
  if (atIndex < 1 || atIndex === trimmed.length - 1) {
    return 'Email format is invalid';
  }

  // Ensure there is no second `@`
  if (trimmed.indexOf('@', atIndex + 1) !== -1) {
    return 'Email format is invalid';
  }

  const domain = trimmed.slice(atIndex + 1);

  // Domain must contain at least one dot (e.g. "example.com")
  if (!domain.includes('.')) {
    return 'Email format is invalid';
  }

  // Domain must not end with a dot
  if (domain.endsWith('.')) {
    return 'Email format is invalid';
  }

  return null;
}

/**
 * Validates a password string against length constraints.
 *
 * Rules applied (Requirements 1.6, 10.2):
 *  - Must be present
 *  - Minimum 8 characters
 *  - Maximum 128 characters
 */
function validatePassword(value: unknown, requireLength = true): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return 'Password is required';
  }

  if (requireLength) {
    if (value.length < 8) {
      return 'Password must be at least 8 characters';
    }

    if (value.length > 128) {
      return 'Password must not exceed 128 characters';
    }
  }

  return null;
}

/**
 * Validates that a string is a well-formed UUID (v4-style hex with dashes).
 */
function validateUuid(value: unknown, fieldName: string): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return `${fieldName} is required`;
  }

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(value)) {
    return `${fieldName} must be a valid UUID`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Creates an Express middleware that validates `req.body` against the
 * supplied set of `ValidationRule`s.
 *
 * For email fields the value is trimmed and lowercased directly on
 * `req.body` so that all downstream handlers receive the clean value.
 */
export function createValidator(rules: ValidationRule[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    for (const rule of rules) {
      const value = req.body?.[rule.field];

      // --- required check (Requirement 10.1) ---
      if (rule.required && (value === undefined || value === null || value === '')) {
        return next(new ValidationError(`${capitalize(rule.field)} is required`));
      }

      // Skip further checks when the optional field is absent
      if (value === undefined || value === null) {
        continue;
      }

      // --- type-specific checks ---
      switch (rule.type) {
        case 'email': {
          // Normalize in place before validation (Requirements 10.3, 10.4)
          if (typeof value === 'string') {
            req.body[rule.field] = value.trim().toLowerCase();
          }
          const emailError = validateEmail(value);
          if (emailError) {
            return next(new ValidationError(emailError));
          }
          break;
        }

        case 'password': {
          // For login we only require presence; for registration we also
          // enforce length constraints.
          const passwordError = validatePassword(value, rule.maxLength !== undefined);
          if (passwordError) {
            return next(new ValidationError(passwordError));
          }
          break;
        }

        case 'uuid': {
          const uuidError = validateUuid(value, capitalize(rule.field));
          if (uuidError) {
            return next(new ValidationError(uuidError));
          }
          break;
        }

        case 'string': {
          if (typeof value !== 'string') {
            return next(
              new ValidationError(`${capitalize(rule.field)} must be a string`),
            );
          }
          if (rule.maxLength && value.length > rule.maxLength) {
            return next(
              new ValidationError(
                `${capitalize(rule.field)} must not exceed ${rule.maxLength} characters`,
              ),
            );
          }
          break;
        }
      }
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// Pre-built middleware for common endpoints
// ---------------------------------------------------------------------------

/**
 * Validates the registration payload (Requirement 1.5, 1.6, 10.1–10.4).
 *
 * Rules:
 *  - email:    required, valid format, max 254 chars, trimmed, lowercased
 *  - password: required, min 8 chars, max 128 chars
 */
export const validateRegistration = createValidator([
  { field: 'email', required: true, type: 'email', maxLength: 254 },
  { field: 'password', required: true, type: 'password', maxLength: 128 },
]);

/**
 * Validates the login payload.
 *
 * Rules:
 *  - email:    required, valid format, trimmed, lowercased
 *  - password: required (no length enforcement — the stored hash handles that)
 */
export const validateLogin = createValidator([
  { field: 'email', required: true, type: 'email' },
  { field: 'password', required: true, type: 'password' },
]);

/**
 * Validates that a `:sessionId` path parameter is a valid UUID.
 */
export function validateSessionId(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const error = validateUuid(req.params.sessionId, 'Session ID');
  if (error) {
    return next(new ValidationError(error));
  }
  next();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Capitalize the first letter of a string (used for error messages). */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Export individual validators for direct use in tests
export { validateEmail, validatePassword, validateUuid };
