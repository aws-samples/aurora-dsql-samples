// ---------------------------------------------------------------------------
// Password Hasher — Application-Layer bcrypt Wrapper
// ---------------------------------------------------------------------------
//
// Aurora DSQL does not support PostgreSQL extensions such as pgcrypto, so all
// password hashing MUST happen in the application layer. This module provides
// a thin wrapper around `bcryptjs` (a pure-JS bcrypt implementation) for
// hashing and verifying passwords.
//
// Key behaviours:
//   • Uses bcrypt with a cost factor of 10 (2^10 = 1 024 iterations).
//   • Generates a unique random salt for every hash operation, so hashing the
//     same password twice always produces different output.
//   • Never stores or returns plaintext passwords.
//
// See design document §6 — Password Hasher for the interface contract.
// ---------------------------------------------------------------------------

import bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * bcrypt cost factor (also called "salt rounds").
 *
 * A cost factor of 10 means 2^10 = 1 024 key-expansion iterations. This
 * provides a good balance between security and latency for a proof-of-concept.
 */
const COST_FACTOR = 10;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Hash a plaintext password using bcrypt.
 *
 * A unique random salt is generated for each call, ensuring that identical
 * passwords produce different hashes (Requirement 7.2, 7.5).
 *
 * @param password - The plaintext password to hash.
 * @returns The bcrypt hash string (e.g. `$2a$10$...`).
 */
export async function hash(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(COST_FACTOR);
  return bcrypt.hash(password, salt);
}

/**
 * Verify a plaintext password against a bcrypt hash.
 *
 * @param password   - The plaintext password provided by the user.
 * @param hashValue  - The stored bcrypt hash to compare against.
 * @returns `true` if the password matches the hash, `false` otherwise.
 */
export async function verify(
  password: string,
  hashValue: string,
): Promise<boolean> {
  return bcrypt.compare(password, hashValue);
}
