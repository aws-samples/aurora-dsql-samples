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

function requireString(body: unknown, field: string): string {
  const value = (body as Record<string, unknown>)?.[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, `Field '${field}' is required`);
  }
  return value;
}

export const router = Router();

router.get("/health", (_req, res) => res.json({ status: "ok" }));

// --- Tenant registry (administrative; not tenant-scoped) ------------------
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

// Mint a short-lived tenant token for the demo. In production an identity
// provider issues these; this convenience endpoint lets the walkthrough obtain
// a bearer token without standing up an IdP. It is an administrative operation
// and would sit behind admin-only authorization in a real deployment.
router.post(
  "/api/tenants/:id/token",
  h(async (req, res) => {
    const tenant = await tenants.getTenant(req.params.id);
    if (!tenant) throw new ApiError(404, "Unknown tenant");
    res.status(201).json({ token: signTenantToken(tenant.id), token_type: "Bearer" });
  }),
);

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
        industry: req.body.industry ?? null,
        website: req.body.website ?? null,
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
    res.json(await accounts.getAccount(requireTenant(req), req.params.id)),
  ),
);

// --- Contacts -------------------------------------------------------------
router.post(
  "/api/contacts",
  h(async (req, res) => {
    const tenantId = requireTenant(req);
    res.status(201).json(
      await contacts.createContact(tenantId, {
        account_id: requireString(req.body, "account_id"),
        first_name: requireString(req.body, "first_name"),
        last_name: requireString(req.body, "last_name"),
        email: req.body.email ?? null,
        phone: req.body.phone ?? null,
      }),
    );
  }),
);
router.get(
  "/api/contacts",
  h(async (req, res) => {
    const accountId =
      typeof req.query.account_id === "string" ? req.query.account_id : undefined;
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
        account_id: requireString(req.body, "account_id"),
        name: requireString(req.body, "name"),
        stage: req.body.stage,
        amount: req.body.amount,
        close_date: req.body.close_date ?? null,
        owner_id: req.body.owner_id ?? null,
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
        req.params.id,
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
        related_id: requireString(req.body, "related_id"),
        subject: requireString(req.body, "subject"),
        notes: req.body.notes ?? null,
        due_at: req.body.due_at ?? null,
      }),
    );
  }),
);
router.get(
  "/api/activities",
  h(async (req, res) => {
    const relatedId =
      typeof req.query.related_id === "string" ? req.query.related_id : undefined;
    res.json(await activities.listActivities(requireTenant(req), relatedId));
  }),
);
router.post(
  "/api/activities/complete",
  h(async (req, res) => {
    const relatedId = requireString(req.body, "related_id");
    const completed = await activities.completeActivitiesFor(
      requireTenant(req),
      relatedId,
    );
    res.json({ completed });
  }),
);
