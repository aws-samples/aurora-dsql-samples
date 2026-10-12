import { signTenantToken } from "../middleware/jwt.js";

/**
 * Print a short-lived bearer token for a tenant.
 *
 * This replaces the unauthenticated POST /api/tenants/:id/token endpoint for
 * ordinary use. Running it locally requires APP_JWT_SECRET, the same secret the
 * service verifies with, so only an operator who already holds the secret can
 * mint a token. Exposing an HTTP route to do this meant anyone who could reach
 * the service could obtain a token for any tenant.
 *
 *   APP_JWT_SECRET=<secret> npm run mint-token -- <tenant-uuid> [ttl-seconds]
 *
 * The secret is recorded in scripts/.state.env by deploy.sh.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const [tenantId, ttlArg] = process.argv.slice(2);

if (!tenantId || !UUID_RE.test(tenantId)) {
  console.error(
    "Usage: APP_JWT_SECRET=<secret> npm run mint-token -- <tenant-uuid> [ttl-seconds]",
  );
  process.exit(1);
}

const ttl = ttlArg ? Number(ttlArg) : 3600;
if (!Number.isFinite(ttl) || ttl <= 0) {
  console.error("ttl-seconds must be a positive number");
  process.exit(1);
}

try {
  console.log(signTenantToken(tenantId, ttl));
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
