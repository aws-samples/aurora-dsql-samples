import { createHmac, timingSafeEqual } from "node:crypto";
import { ApiError } from "../types.js";

/**
 * Minimal HS256 JWT mint/verify, implemented with Node's built-in `crypto`
 * so the sample needs no extra dependency.
 *
 * The point of this file, for the blog, is that the demo derives the tenant
 * from a SIGNED, VERIFIED token rather than a raw client-supplied header: a
 * caller cannot claim an arbitrary tenant without the signing secret. In a
 * real deployment you would not mint tokens here at all -- an identity
 * provider (for example Amazon Cognito) would issue them and you would verify
 * against its public keys (JWKS). The claim this code reads, `tenant_id`,
 * maps to the `custom:tenant_id` claim such a provider would carry.
 */

interface TenantClaims {
  tenant_id: string;
  iat: number;
  exp: number;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

/** Resolve the signing secret, failing closed if it is not configured. */
function secret(): string {
  const s = process.env.APP_JWT_SECRET;
  if (!s || s.length < 16) {
    throw new ApiError(
      500,
      "APP_JWT_SECRET is not set (needs at least 16 characters). " +
        "Set it so the service can verify tenant tokens.",
    );
  }
  return s;
}

/** Mint a short-lived tenant token. Demo helper -- see the file header. */
export function signTenantToken(tenantId: string, ttlSeconds = 3600): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(
    JSON.stringify({ tenant_id: tenantId, iat: now, exp: now + ttlSeconds }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = base64url(
    createHmac("sha256", secret()).update(signingInput).digest(),
  );
  return `${signingInput}.${signature}`;
}

/** Verify an HS256 token and return its tenant claims, or throw ApiError(401). */
export function verifyTenantToken(token: string): TenantClaims {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new ApiError(401, "Malformed token");
  }
  const [header, payload, signature] = parts;

  const expected = createHmac("sha256", secret())
    .update(`${header}.${payload}`)
    .digest();
  const provided = base64urlDecode(signature);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    throw new ApiError(401, "Invalid token signature");
  }

  let claims: TenantClaims;
  try {
    claims = JSON.parse(base64urlDecode(payload).toString("utf8"));
  } catch {
    throw new ApiError(401, "Malformed token payload");
  }

  if (typeof claims.tenant_id !== "string" || claims.tenant_id === "") {
    throw new ApiError(401, "Token is missing a tenant_id claim");
  }
  if (typeof claims.exp !== "number" || claims.exp < Math.floor(Date.now() / 1000)) {
    throw new ApiError(401, "Token has expired");
  }
  return claims;
}
