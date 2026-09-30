import { Request } from 'express';

// ---------------------------------------------------------------------------
// API Response Envelope
// ---------------------------------------------------------------------------

/**
 * Standard response wrapper for all API endpoints.
 *
 * Every response — success or error — uses this envelope so clients can rely
 * on a single, predictable shape.
 *
 * @template T - The type of the `data` payload on success.
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

// ---------------------------------------------------------------------------
// Domain Models
// ---------------------------------------------------------------------------

/**
 * A registered user stored in the `users` table.
 *
 * Passwords are never stored in plaintext — `passwordHash` holds the bcrypt
 * output produced by the application-layer Password Hasher.
 */
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

/**
 * A login session stored in the `sessions` table.
 *
 * `tokenHash` is the SHA-256 hash of the plaintext session token. The
 * plaintext token is returned to the client exactly once at creation time
 * and is never persisted.
 */
export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  clientMetadata: ClientMetadata;
}

/**
 * Optional metadata captured at session creation time (user agent, IP, etc.).
 */
export interface ClientMetadata {
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Public session information returned by the listing endpoint.
 *
 * Intentionally omits `tokenHash` to prevent token leakage.
 */
export interface SessionInfo {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  clientMetadata: ClientMetadata;
}

// ---------------------------------------------------------------------------
// Express Extensions
// ---------------------------------------------------------------------------

/**
 * Express `Request` augmented with the authenticated user context.
 *
 * The auth middleware attaches `user` and `sessionId` after validating the
 * Bearer token in the `Authorization` header.
 */
export interface AuthenticatedRequest extends Request {
  user: { id: string; email: string };
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Describes a single validation rule applied to an incoming request field.
 */
export interface ValidationRule {
  field: string;
  required: boolean;
  type: 'email' | 'password' | 'uuid' | 'string';
  maxLength?: number;
}
