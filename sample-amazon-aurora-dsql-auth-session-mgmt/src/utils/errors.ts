// ---------------------------------------------------------------------------
// Custom Error Classes
// ---------------------------------------------------------------------------
//
// Each error carries an HTTP status code and a machine-readable error code so
// the global error handler can map them directly to the API response envelope
// without a lookup table.
//
// Error categories are defined in the design document's Error Handling section.
// ---------------------------------------------------------------------------

/**
 * Base class for all application-specific errors.
 *
 * Subclasses set `statusCode` and `code` so the global error handler can
 * build the correct `ApiResponse` without inspecting error messages.
 *
 * The optional `cause` (forwarded to `Error`'s standard ErrorOptions) lets
 * callers attach an underlying error for forensic logging without exposing
 * it to API clients.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * 400 — Request payload failed validation (missing fields, bad format, etc.).
 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

/**
 * 401 — Credentials are invalid (wrong email or wrong password).
 *
 * The same generic message is used for both cases to prevent user enumeration.
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Invalid email or password') {
    super(message, 401, 'AUTHENTICATION_FAILED');
  }
}

/**
 * 409 — A resource already exists (e.g. duplicate email registration).
 */
export class ConflictError extends AppError {
  constructor(message: string = 'Email already exists') {
    super(message, 409, 'EMAIL_ALREADY_EXISTS');
  }
}

/**
 * 401 — The session token has passed its expiration timestamp.
 */
export class SessionExpiredError extends AppError {
  constructor(message: string = 'Session has expired') {
    super(message, 401, 'INVALID_SESSION');
  }
}

/**
 * 401 — The session token is missing, revoked, or otherwise not found.
 */
export class InvalidSessionError extends AppError {
  constructor(message: string = 'Invalid session') {
    super(message, 401, 'INVALID_SESSION');
  }
}

/**
 * 503 — A transient failure (e.g. OCC retries exhausted) prevents the
 * request from being fulfilled right now.
 */
export class ServiceUnavailableError extends AppError {
  constructor(
    message: string = 'Service temporarily unavailable',
    options?: ErrorOptions,
  ) {
    super(message, 503, 'SERVICE_UNAVAILABLE', options);
  }
}
