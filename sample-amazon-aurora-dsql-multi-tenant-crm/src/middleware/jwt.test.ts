import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { signTenantToken, verifyTenantToken } from "./jwt.js";
import { ApiError } from "../types.js";

const SECRET = "test-secret-at-least-16-chars";
const TENANT = "11111111-1111-4111-8111-111111111111";

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Build a token with arbitrary claims, signed with `secret`. */
function forge(claims: object, secret = SECRET): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify(claims));
  const signature = base64url(
    createHmac("sha256", secret).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

describe("tenant tokens", () => {
  beforeEach(() => {
    process.env.APP_JWT_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.APP_JWT_SECRET;
  });

  it("round-trips a signed token", () => {
    const claims = verifyTenantToken(signTenantToken(TENANT));
    expect(claims.tenant_id).toBe(TENANT);
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects a token that is not three segments", () => {
    expect(() => verifyTenantToken("not.a-token")).toThrow(ApiError);
    expect(() => verifyTenantToken("not.a-token")).toThrow(/Malformed token/);
  });

  it("rejects a token signed with a different secret", () => {
    const foreign = forge(
      { tenant_id: TENANT, iat: 0, exp: Math.floor(Date.now() / 1000) + 60 },
      "a-completely-different-secret",
    );
    expect(() => verifyTenantToken(foreign)).toThrow(/Invalid token signature/);
  });

  it("rejects a tampered payload", () => {
    // Swap the payload for a different tenant, keeping the original signature.
    const [header, , signature] = signTenantToken(TENANT).split(".");
    const evil = base64url(
      JSON.stringify({
        tenant_id: "22222222-2222-4222-8222-222222222222",
        iat: 0,
        exp: Math.floor(Date.now() / 1000) + 60,
      }),
    );
    expect(() => verifyTenantToken(`${header}.${evil}.${signature}`)).toThrow(
      /Invalid token signature/,
    );
  });

  it("rejects an expired token", () => {
    const expired = forge({
      tenant_id: TENANT,
      iat: 0,
      exp: Math.floor(Date.now() / 1000) - 1,
    });
    expect(() => verifyTenantToken(expired)).toThrow(/expired/);
  });

  it("rejects a token with no tenant_id claim", () => {
    const anonymous = forge({ exp: Math.floor(Date.now() / 1000) + 60 });
    expect(() => verifyTenantToken(anonymous)).toThrow(/missing a tenant_id/);
  });

  it("rejects a token with an empty tenant_id claim", () => {
    const blank = forge({
      tenant_id: "",
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    expect(() => verifyTenantToken(blank)).toThrow(/missing a tenant_id/);
  });

  it("fails closed when the secret is unset", () => {
    delete process.env.APP_JWT_SECRET;
    expect(() => signTenantToken(TENANT)).toThrow(/APP_JWT_SECRET is not set/);
  });

  it("fails closed when the secret is too short to be useful", () => {
    process.env.APP_JWT_SECRET = "short";
    expect(() => signTenantToken(TENANT)).toThrow(/at least 16 characters/);
  });
});
