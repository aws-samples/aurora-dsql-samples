import { Router, type Request, type Response, type NextFunction } from "express";
import { tenantContext, requireTenant } from "../middleware/tenant.js";
import { signTenantToken } from "../middleware/jwt.js";
import { ApiError } from "../types.js";
import * as tenants from "../repositories/tenants.js";
import * as accounts from "../repositories/accounts.js";
import * as contacts from "../repositories/contacts.js";
import * as opportunities from "../repositories/opportunities.js";
import * as activities from "../repositories/activities.js";

// Small async wrapper so thrown errors reach the error handler.
const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Column widths the schema enforces. Checking them here turns what would
 * otherwise be a SQLSTATE 22001 (and a 500) into a 400 that names the field.
 */
const MAX_LENGTHS: Record<string, number> = {
  name: 200,
  first_name: 100,
  last_name: 100,
  email: 254,
  phone: 40,
  industry: 100,
  website: 254,
  subject: 200,
  related_type: 20,
  stage: 30,
  notes: 20_000,
};

function requireString(body: unknown, field: string): string {
  const value = (body as Record<string, unknown>)?.[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, `Field '${field}' is required`);
  }
  const max = MAX_LENGTHS[field];
  if (max !== undefined && value.length > max) {
    throw new ApiError(
      400,
      `Field '${field}' must be ${max} characters or fewer`,
    );
  }
  return value;
}

/** Optional string field, length-checked when present. */
function optionalString(body: unknown, field: string): string | null {
  const value = (body as Record<string, unknown>)?.[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new ApiError(400, `Field '${field}' must be a string`);
  }
  const max = MAX_LENGTHS[field];
  if (max !== undefined && value.length > max) {
    throw new ApiError(
      400,
      `Field '${field}' must be ${max} characters or fewer`,
    );
  }
  return value;
}

/** Reject a non-UUID id before it reaches the database as a 22P02. */
function requireUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new ApiError(400, `Field '${field}' must be a UUID`);
  }
  return value;
}

function optionalUuid(body: unknown, field: string): string | null {
  const value = (body as Record<string, unknown>)?.[field];
  if (value === undefined || value === null) return null;
  return requireUuid(value, field);
}

/** Reject a non-finite or negative amount before it becomes a 22P02. */
function optionalAmount(body: unknown, field: string): number | undefined {
  const value = (body as Record<string, unknown>)?.[field];
  if (value === undefined || value === null) return undefined;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new ApiError(400, `Field '${field}' must be a non-negative number`);
  }
  return num;
}

/** Reject an unparseable date before it becomes a 22007/22008. */
function optionalDate(body: unknown, field: string): string | null {
  const value = (body as Record<string, unknown>)?.[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new ApiError(400, `Field '${field}' must be an ISO 8601 date`);
  }
  return value;
}

export const router = Router();

router.get("/health", (_req, res) => res.json({ status: "ok" }));

/**
 * Tenant registry: administrative, and deliberately NOT mounted by default.
 *
 * These three routes sit above the tenantContext middleware, so nothing in a
 * request identifies a caller. Left always-on, anyone who can reach the
 * service could list every tenant and mint a valid bearer token for any of
 * them, which defeats the isolation the rest of the sample demonstrates.
 *
 * They exist only so the walkthrough can obtain a token without standing up an
 * identity provider. Enable them explicitly and only on a throwaway
 * deployment:
 *
 *   ENABLE_TENANT_ADMIN_ROUTES=true
 *
 * scripts/deploy.sh does not set that variable. In a real deployment an
 * identity provider (for example Amazon Cognito) issues tenant tokens and you
 * verify them against its JWKS; see src/middleware/jwt.ts. Use
 * `npm run mint-token` to create a demo token without exposing an endpoint.
 */
if (process.env.ENABLE_TENANT_ADMIN_ROUTES === "true") {
  console.warn(
    "WARNING: ENABLE_TENANT_ADMIN_ROUTES=true -- unauthenticated tenant " +
      "registry and token-minting routes are exposed. Never set this in a " +
      "deployment that holds real data.",
  );

  router.post(
    "/api/tenants",
    h(async (req, res) => {
      const name = requireString(req.body, "name");
      res.status(201).json(await tenants.createTenant(name));
    }),
  );
  router.get(
    "/api/tenants",
    h(async (_req, res) => res.json(await tenants.listTenants())),
  );
  router.post(
    "/api/tenants/:id/token",
    h(async (req, res) => {
      const tenant = await tenants.getTenant(requireUuid(req.params.id, "id"));
      if (!tenant) throw new ApiError(404, "Unknown tenant");
      res
        .status(201)
        .json({ token: signTenantToken(tenant.id), token_type: "Bearer" });
    }),
  );
}

// Everything below is tenant-scoped.
router.use(tenantContext);

// --- Accounts -------------------------------------------------------------
router.post(
  "/api/accounts",
  h(async (req, res) => {
    const tenantId = requireTenant(req);
    const name = requireString(req.body, "name");
    res.status(201).json(
      await accounts.createAccount(tenantId, {
        name,
        industry: optionalString(req.body, "industry"),
        website: optionalString(req.body, "website"),
      }),
    );
  }),
);
router.get(
  "/api/accounts",
  h(async (req, res) =>
    res.json(await accounts.listAccounts(requireTenant(req))),
  ),
);
router.get(
  "/api/accounts/:id",
  h(async (req, res) =>
    res.json(
      await accounts.getAccount(
        requireTenant(req),
        requireUuid(req.params.id, "id"),
      ),
    ),
  ),
);

// --- Contacts -------------------------------------------------------------
router.post(
  "/api/contacts",
  h(async (req, res) => {
    const tenantId = requireTenant(req);
    res.status(201).json(
      await contacts.createContact(tenantId, {
        account_id: requireUuid(req.body?.account_id, "account_id"),
        first_name: requireString(req.body, "first_name"),
        last_name: requireString(req.body, "last_name"),
        email: optionalString(req.body, "email"),
        phone: optionalString(req.body, "phone"),
      }),
    );
  }),
);
router.get(
  "/api/contacts",
  h(async (req, res) => {
    const accountId =
      typeof req.query.account_id === "string"
        ? requireUuid(req.query.account_id, "account_id")
        : undefined;
    res.json(await contacts.listContacts(requireTenant(req), accountId));
  }),
);

// --- Opportunities --------------------------------------------------------
router.post(
  "/api/opportunities",
  h(async (req, res) => {
    const tenantId = requireTenant(req);
    res.status(201).json(
      await opportunities.createOpportunity(tenantId, {
        account_id: requireUuid(req.body?.account_id, "account_id"),
        name: requireString(req.body, "name"),
        stage: req.body?.stage,
        amount: optionalAmount(req.body, "amount"),
        close_date: optionalDate(req.body, "close_date"),
        owner_id: optionalUuid(req.body, "owner_id"),
      }),
    );
  }),
);
router.get(
  "/api/opportunities",
  h(async (req, res) => {
    const stage =
      typeof req.query.stage === "string" ? req.query.stage : undefined;
    res.json(
      await opportunities.listOpportunities(
        requireTenant(req),
        stage as never,
      ),
    );
  }),
);
router.patch(
  "/api/opportunities/:id",
  h(async (req, res) => {
    const stage = requireString(req.body, "stage");
    res.json(
      await opportunities.updateStage(
        requireTenant(req),
        requireUuid(req.params.id, "id"),
        stage as never,
      ),
    );
  }),
);

// --- Activities -----------------------------------------------------------
router.post(
  "/api/activities",
  h(async (req, res) => {
    const tenantId = requireTenant(req);
    res.status(201).json(
      await activities.createActivity(tenantId, {
        related_type: requireString(req.body, "related_type") as never,
        related_id: requireUuid(req.body?.related_id, "related_id"),
        subject: requireString(req.body, "subject"),
        notes: optionalString(req.body, "notes"),
        due_at: optionalDate(req.body, "due_at"),
      }),
    );
  }),
);
router.get(
  "/api/activities",
  h(async (req, res) => {
    const relatedId =
      typeof req.query.related_id === "string"
        ? requireUuid(req.query.related_id, "related_id")
        : undefined;
    res.json(await activities.listActivities(requireTenant(req), relatedId));
  }),
);
router.post(
  "/api/activities/complete",
  h(async (req, res) => {
    const relatedId = requireUuid(req.body?.related_id, "related_id");
    const completed = await activities.completeActivitiesFor(
      requireTenant(req),
      relatedId,
    );
    res.json({ completed });
  }),
);
