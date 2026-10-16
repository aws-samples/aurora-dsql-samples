import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";

const SECRET = "test-secret-at-least-16-chars";
const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "22222222-2222-4222-8222-222222222222";
const ACCOUNT = "33333333-3333-4333-8333-333333333333";

/**
 * Shared mock functions, created with vi.hoisted so the same references
 * survive vi.resetModules(). Without that, reloading the app to pick up a
 * different ENABLE_TENANT_ADMIN_ROUTES would hand us fresh mocks and drop any
 * behaviour configured in a test.
 */
const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  listAccounts: vi.fn(),
  createAccount: vi.fn(),
  getAccount: vi.fn(),
  listTenants: vi.fn(),
}));

// The real module builds an AuroraDSQLPool and throws without DSQL_ENDPOINT.
vi.mock("../db/pool.js", () => ({
  pool: { query: mocks.poolQuery, transaction: vi.fn() },
  closePool: vi.fn(),
}));

vi.mock("../repositories/accounts.js", () => ({
  listAccounts: mocks.listAccounts,
  createAccount: mocks.createAccount,
  getAccount: mocks.getAccount,
}));
vi.mock("../repositories/tenants.js", () => ({
  listTenants: mocks.listTenants,
  createTenant: vi.fn(),
  getTenant: vi.fn(),
}));
vi.mock("../repositories/contacts.js", () => ({
  createContact: vi.fn(),
  listContacts: vi.fn(),
}));
vi.mock("../repositories/opportunities.js", () => ({
  createOpportunity: vi.fn(),
  listOpportunities: vi.fn(),
  updateStage: vi.fn(),
}));
vi.mock("../repositories/activities.js", () => ({
  createActivity: vi.fn(),
  listActivities: vi.fn(),
  completeActivitiesFor: vi.fn(),
}));

/** Load a fresh app, optionally with different environment. */
async function loadApp(
  env: Record<string, string | undefined> = {},
): Promise<Express> {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const { createApp } = await import("../app.js");
  return createApp();
}

/** A valid bearer token for `tenantId`. */
async function tokenFor(tenantId: string): Promise<string> {
  const { signTenantToken } = await import("../middleware/jwt.js");
  return signTenantToken(tenantId);
}

/** Make the tenants lookup in tenantContext resolve to an active tenant. */
function tenantIsActive(id = TENANT) {
  mocks.poolQuery.mockResolvedValue({ rows: [{ id, status: "active" }] });
}

let app: Express;

beforeEach(async () => {
  process.env.APP_JWT_SECRET = SECRET;
  vi.clearAllMocks();
  app = await loadApp({ ENABLE_TENANT_ADMIN_ROUTES: undefined });
});

afterEach(() => {
  delete process.env.APP_JWT_SECRET;
  delete process.env.ENABLE_TENANT_ADMIN_ROUTES;
});

describe("health", () => {
  it("needs no authentication", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("authentication", () => {
  it("rejects a request with no Authorization header", async () => {
    const res = await request(app).get("/api/accounts");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Missing bearer token/);
  });

  it("rejects a non-Bearer Authorization header", async () => {
    const res = await request(app)
      .get("/api/accounts")
      .set("Authorization", "Basic dXNlcjpwYXNz");
    expect(res.status).toBe(401);
  });

  it("rejects a malformed bearer token", async () => {
    const res = await request(app)
      .get("/api/accounts")
      .set("Authorization", "Bearer not-a-jwt");
    expect(res.status).toBe(401);
  });

  it("rejects a token signed with the wrong secret", async () => {
    const token = await tokenFor(TENANT);
    process.env.APP_JWT_SECRET = "a-different-secret-16-chars";
    const res = await request(app)
      .get("/api/accounts")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  // This is the finding from the review: the tenant must come from a verified
  // token, never from a header the caller controls.
  it("ignores a raw X-Tenant-Id header when no token is present", async () => {
    tenantIsActive();
    const res = await request(app)
      .get("/api/accounts")
      .set("X-Tenant-Id", TENANT);
    expect(res.status).toBe(401);
    expect(mocks.listAccounts).not.toHaveBeenCalled();
  });

  it("does not reach the database when the token is bad", async () => {
    await request(app)
      .get("/api/accounts")
      .set("Authorization", "Bearer not-a-jwt");
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });
});

describe("tenant context", () => {
  it("rejects a token whose tenant_id is not a UUID", async () => {
    const token = await tokenFor("not-a-uuid");
    const res = await request(app)
      .get("/api/accounts")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/must be a valid UUID/);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it("returns 404 for a tenant that does not exist, before any data access", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [] });
    const token = await tokenFor(TENANT);
    const res = await request(app)
      .get("/api/accounts")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Unknown tenant/);
    expect(mocks.listAccounts).not.toHaveBeenCalled();
  });

  it("returns 403 for a suspended tenant, before any data access", async () => {
    mocks.poolQuery.mockResolvedValue({
      rows: [{ id: TENANT, status: "suspended" }],
    });
    const token = await tokenFor(TENANT);
    const res = await request(app)
      .get("/api/accounts")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(mocks.listAccounts).not.toHaveBeenCalled();
  });

  it("passes the tenant from the token to the repository", async () => {
    tenantIsActive();
    mocks.listAccounts.mockResolvedValue([]);
    const token = await tokenFor(TENANT);
    await request(app)
      .get("/api/accounts")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(mocks.listAccounts).toHaveBeenCalledWith(TENANT);
  });

  // Two tenants, two tokens: each repository call must carry its own tenant.
  it("scopes each caller to the tenant in its own token", async () => {
    mocks.listAccounts.mockResolvedValue([]);
    for (const id of [TENANT, OTHER_TENANT]) {
      mocks.poolQuery.mockResolvedValue({ rows: [{ id, status: "active" }] });
      const token = await tokenFor(id);
      await request(app)
        .get("/api/accounts")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(mocks.listAccounts).toHaveBeenLastCalledWith(id);
    }
  });
});

describe("request validation", () => {
  let token: string;
  beforeEach(async () => {
    tenantIsActive();
    token = await tokenFor(TENANT);
  });

  it("rejects a missing required field with 400", async () => {
    const res = await request(app)
      .post("/api/accounts")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/'name' is required/);
    expect(mocks.createAccount).not.toHaveBeenCalled();
  });

  it("rejects an over-length field with 400 naming the field", async () => {
    const res = await request(app)
      .post("/api/accounts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "a".repeat(201) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/'name' must be 200 characters or fewer/);
  });

  it("rejects a non-UUID path parameter with 400", async () => {
    const res = await request(app)
      .get("/api/accounts/not-a-uuid")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/'id' must be a UUID/);
    expect(mocks.getAccount).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID query parameter with 400", async () => {
    const res = await request(app)
      .get("/api/contacts?account_id=nope")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("rejects a negative amount with 400", async () => {
    const res = await request(app)
      .post("/api/opportunities")
      .set("Authorization", `Bearer ${token}`)
      .send({ account_id: ACCOUNT, name: "Renewal", amount: -5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non-negative number/);
  });

  it("rejects an unparseable date with 400", async () => {
    const res = await request(app)
      .post("/api/opportunities")
      .set("Authorization", `Bearer ${token}`)
      .send({ account_id: ACCOUNT, name: "Renewal", close_date: "last tuesday" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ISO 8601/);
  });

  it("returns 400 for malformed JSON rather than 500", async () => {
    const res = await request(app)
      .post("/api/accounts")
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
  });

  it("returns 413 for a body over the 100kb limit rather than 500", async () => {
    const res = await request(app)
      .post("/api/accounts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "x".repeat(200_000) });
    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/too large/);
  });
});

describe("error propagation", () => {
  it("maps a repository unique violation to 409", async () => {
    tenantIsActive();
    const token = await tokenFor(TENANT);
    mocks.createAccount.mockRejectedValue({ code: "23505" });
    const res = await request(app)
      .post("/api/accounts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Acme" });
    expect(res.status).toBe(409);
  });

  it("reports an unexpected repository failure as a generic 500", async () => {
    tenantIsActive();
    const token = await tokenFor(TENANT);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.listAccounts.mockRejectedValue(new Error("host=internal.example"));
    const res = await request(app)
      .get("/api/accounts")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("internal.example");
    spy.mockRestore();
  });
});

describe("tenant admin routes", () => {
  it("are absent unless ENABLE_TENANT_ADMIN_ROUTES is set", async () => {
    tenantIsActive();
    // No token: if the route existed it would answer; gated, it falls through
    // to tenantContext and 401s instead of listing tenants.
    const res = await request(app).get("/api/tenants");
    expect(res.status).toBe(401);
    expect(mocks.listTenants).not.toHaveBeenCalled();
  });

  it("are not enabled by a value other than the literal 'true'", async () => {
    const guarded = await loadApp({ ENABLE_TENANT_ADMIN_ROUTES: "1" });
    const res = await request(guarded).get("/api/tenants");
    expect(res.status).toBe(401);
    expect(mocks.listTenants).not.toHaveBeenCalled();
  });

  it("are reachable, and warn, when explicitly enabled", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const exposed = await loadApp({ ENABLE_TENANT_ADMIN_ROUTES: "true" });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("ENABLE_TENANT_ADMIN_ROUTES=true"),
    );
    mocks.listTenants.mockResolvedValue([]);
    const res = await request(exposed).get("/api/tenants");
    expect(res.status).toBe(200);
    warn.mockRestore();
  });
});
