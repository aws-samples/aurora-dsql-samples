import type { NextFunction, Request, Response } from "express";
import { pool } from "../db/pool.js";
import { ApiError } from "../types.js";
import { verifyTenantToken } from "./jwt.js";

/**
 * Tenant-context middleware -- the heart of pooled multi-tenancy.
 *
 * The tenant is resolved from a SIGNED, VERIFIED token on the
 * `Authorization: Bearer <JWT>` header, NOT from a raw client-supplied value.
 * This matters: on a public endpoint a plain `X-Tenant-Id` header lets any
 * caller claim any tenant and read or write another tenant's data. Requiring a
 * verified `tenant_id` claim makes the demo secure by default -- the pattern a
 * reader copies is the safe one. In production the token would come from your
 * identity provider (for example a `custom:tenant_id` claim issued by Amazon
 * Cognito) and you would verify it against the provider's keys; here the sample
 * mints and verifies an HS256 token with `APP_JWT_SECRET` to stay dependency-free.
 *
 * Once resolved, the tenant id is attached to the request and EVERY repository
 * query filters by it -- that centralized filter is the isolation boundary for
 * the pooled model. We also confirm the tenant exists and is active, so
 * requests for unknown or suspended tenants are rejected before any data access.
 *
 * For local experimentation ONLY, setting `ALLOW_INSECURE_TENANT_HEADER=true`
 * re-enables accepting a raw `X-Tenant-Id` header. It is OFF by default and must
 * never be enabled on a public deployment.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenantId?: string;
    }
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Resolve the tenant id from the request, preferring the verified token. */
function resolveTenantId(req: Request): string {
  const authz = req.header("authorization");
  if (authz && authz.toLowerCase().startsWith("bearer ")) {
    const token = authz.slice(7).trim();
    const claims = verifyTenantToken(token); // throws ApiError(401) if invalid
    return claims.tenant_id;
  }

  // Explicit, local-only escape hatch. Off unless the operator opts in.
  if (process.env.ALLOW_INSECURE_TENANT_HEADER === "true") {
    const header = req.header("x-tenant-id");
    if (header) return header;
  }

  throw new ApiError(401, "Missing bearer token");
}

export async function tenantContext(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = resolveTenantId(req);
    if (!UUID_RE.test(tenantId)) {
      throw new ApiError(400, "tenant_id must be a valid UUID");
    }

    const { rows } = await pool.query(
      "SELECT id, status FROM tenants WHERE id = $1",
      [tenantId],
    );
    if (rows.length === 0) {
      throw new ApiError(404, "Unknown tenant");
    }
    if (rows[0].status !== "active") {
      throw new ApiError(403, "Tenant is not active");
    }

    req.tenantId = tenantId;
    next();
  } catch (err) {
    next(err);
  }
}

/** Convenience accessor that guarantees a tenant id is present. */
export function requireTenant(req: Request): string {
  if (!req.tenantId) {
    throw new ApiError(500, "tenantContext middleware did not run");
  }
  return req.tenantId;
}
