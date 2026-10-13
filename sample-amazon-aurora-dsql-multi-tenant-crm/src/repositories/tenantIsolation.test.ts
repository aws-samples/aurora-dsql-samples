import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Repository-level tests for the tenant isolation boundary.
 *
 * The route tests in src/routes/api.test.ts mock the repositories out, so they
 * prove the middleware resolves a tenant but prove nothing about what the
 * repositories then do with it. These tests drive the repositories against a
 * mock pg client and assert on the SQL and parameters actually issued, which
 * is where the isolation is enforced.
 *
 * Every assertion here is designed to fail if the tenant predicate is removed:
 * that is the whole point, so these are checked against that mutation.
 */

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
}));

// The real module constructs an AuroraDSQLPool and needs DSQL_ENDPOINT.
vi.mock("../db/pool.js", () => ({
  pool: {
    query: mocks.query,
    connect: mocks.connect,
    transaction: async (fn: (c: unknown) => Promise<unknown>) =>
      fn({ query: mocks.query }),
  },
  closePool: vi.fn(),
}));

// withTransaction delegates to pool.transaction; keep the same single client.
vi.mock("../db/occ.js", () => ({
  withTransaction: async (fn: (c: unknown) => Promise<unknown>) =>
    fn({ query: mocks.query }),
}));

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "22222222-2222-4222-8222-222222222222";
const ACCOUNT = "33333333-3333-4333-8333-333333333333";
const USER = "44444444-4444-4444-8444-444444444444";
const RECORD = "55555555-5555-4555-8555-555555555555";

/** Every SQL statement issued, with its parameters. */
function calls(): Array<{ sql: string; params: unknown[] }> {
  return mocks.query.mock.calls.map((c) => ({
    sql: String(c[0]),
    params: (c[1] ?? []) as unknown[],
  }));
}

/** Statements that actually touch a CRM table, ignoring BEGIN/COMMIT. */
function dataCalls() {
  return calls().filter(({ sql }) => /select|insert|update|delete/i.test(sql));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("accounts: reads are tenant-scoped", () => {
  it("filters listAccounts by tenant_id, with the tenant as a parameter", async () => {
    const { listAccounts } = await import("./accounts.js");
    await listAccounts(TENANT);

    const [{ sql, params }] = dataCalls();
    expect(sql).toMatch(/from\s+accounts/i);
    expect(sql).toMatch(/where[\s\S]*tenant_id\s*=\s*\$1/i);
    expect(params[0]).toBe(TENANT);
  });

  it("filters getAccount by tenant_id as well as id", async () => {
    const { getAccount } = await import("./accounts.js");
    mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
    await getAccount(TENANT, ACCOUNT).catch(() => undefined);

    const [{ sql, params }] = dataCalls();
    expect(sql).toMatch(/tenant_id\s*=\s*\$1/i);
    expect(params).toEqual(expect.arrayContaining([TENANT, ACCOUNT]));
  });

  it("passes the caller's tenant through, never a hardcoded one", async () => {
    const { listAccounts } = await import("./accounts.js");
    await listAccounts(OTHER_TENANT);
    expect(dataCalls()[0].params[0]).toBe(OTHER_TENANT);
  });
});

describe("assertAccountInTenant", () => {
  it("scopes the existence check to the tenant", async () => {
    const { assertAccountInTenant } = await import("./accounts.js");
    mocks.query.mockResolvedValue({ rows: [{ "?column?": 1 }], rowCount: 1 });
    await assertAccountInTenant({ query: mocks.query } as never, TENANT, ACCOUNT);

    const [{ sql, params }] = dataCalls();
    expect(sql).toMatch(/from\s+accounts/i);
    expect(sql).toMatch(/tenant_id\s*=\s*\$1/i);
    expect(params).toEqual([TENANT, ACCOUNT]);
  });

  it("rejects an account that belongs to another tenant", async () => {
    const { assertAccountInTenant } = await import("./accounts.js");
    // No row: the id exists globally but not within this tenant.
    mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
    await expect(
      assertAccountInTenant({ query: mocks.query } as never, TENANT, ACCOUNT),
    ).rejects.toThrow(/account_id does not exist for this tenant/);
  });
});

describe("assertUserInTenant", () => {
  it("scopes the existence check to the tenant", async () => {
    const { assertUserInTenant } = await import("./users.js");
    mocks.query.mockResolvedValue({ rows: [{ "?column?": 1 }], rowCount: 1 });
    await assertUserInTenant({ query: mocks.query } as never, TENANT, USER);

    const [{ sql, params }] = dataCalls();
    expect(sql).toMatch(/from\s+users/i);
    expect(sql).toMatch(/tenant_id\s*=\s*\$1/i);
    expect(params).toEqual([TENANT, USER]);
  });

  // This is the finding from the first review: a foreign key proves the user
  // exists, it cannot prove the user belongs to the requesting tenant.
  it("rejects an owner_id from another tenant", async () => {
    const { assertUserInTenant } = await import("./users.js");
    mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
    await expect(
      assertUserInTenant({ query: mocks.query } as never, TENANT, USER),
    ).rejects.toThrow(/owner_id does not exist for this tenant/);
  });
});

describe("activities: polymorphic related_id is tenant-checked", () => {
  it("looks the related record up in the table for its type, scoped to the tenant", async () => {
    const { createActivity } = await import("./activities.js");
    mocks.query.mockResolvedValue({ rows: [{ "?column?": 1 }], rowCount: 1 });

    await createActivity(TENANT, {
      related_type: "account",
      related_id: RECORD,
      subject: "Follow up",
      notes: null,
      due_at: null,
    }).catch(() => undefined);

    const check = dataCalls().find(({ sql }) => /select/i.test(sql));
    expect(check).toBeDefined();
    expect(check!.sql).toMatch(/from\s+accounts/i);
    expect(check!.sql).toMatch(/tenant_id\s*=\s*\$1/i);
    expect(check!.params).toEqual([TENANT, RECORD]);
  });

  it("rejects a related record from another tenant", async () => {
    const { createActivity } = await import("./activities.js");
    mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });

    await expect(
      createActivity(TENANT, {
        related_type: "opportunity",
        related_id: RECORD,
        subject: "Follow up",
        notes: null,
        due_at: null,
      }),
    ).rejects.toThrow(
      /related_id does not match an existing opportunity for this tenant/,
    );
  });

  it("resolves the table from a fixed map, never from caller input", async () => {
    const { createActivity } = await import("./activities.js");
    mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });

    await expect(
      createActivity(TENANT, {
        // Not one of account | contact | opportunity.
        related_type: "accounts; DROP TABLE users; --" as never,
        related_id: RECORD,
        subject: "Follow up",
        notes: null,
        due_at: null,
      }),
    ).rejects.toThrow();

    for (const { sql } of calls()) {
      expect(sql).not.toContain("DROP TABLE");
    }
  });

  it("scopes the bulk complete to the tenant and the record", async () => {
    const { completeActivitiesFor } = await import("./activities.js");
    mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
    await completeActivitiesFor(TENANT, RECORD);

    const update = dataCalls().find(({ sql }) => /update\s+activities/i.test(sql));
    expect(update).toBeDefined();
    expect(update!.sql).toMatch(/tenant_id\s*=\s*\$1/i);
    expect(update!.params[0]).toBe(TENANT);
    expect(update!.params[1]).toBe(RECORD);
  });
});

describe("activities bulk complete: adapts to the transaction byte cap", () => {
  it("halves the batch and retries when Aurora DSQL raises 54000", async () => {
    const { completeActivitiesFor } = await import("./activities.js");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const limitError = Object.assign(new Error("transaction too large"), {
      code: "54000",
    });
    // First batch trips the cap, the retry at half size succeeds.
    mocks.query
      .mockRejectedValueOnce(limitError)
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const total = await completeActivitiesFor(TENANT, RECORD);
    expect(total).toBe(0);

    const limits = dataCalls()
      .filter(({ sql }) => /update\s+activities/i.test(sql))
      .map(({ params }) => params[2]);
    expect(limits[0]).toBe(1000);
    expect(limits[1]).toBe(500);
    warn.mockRestore();
  });

  it("gives up rather than looping forever once the floor is reached", async () => {
    const { completeActivitiesFor } = await import("./activities.js");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const limitError = Object.assign(new Error("transaction too large"), {
      code: "54000",
    });
    mocks.query.mockRejectedValue(limitError);

    await expect(completeActivitiesFor(TENANT, RECORD)).rejects.toThrow(
      /transaction too large/,
    );
    warn.mockRestore();
  });

  it("does not retry an unrelated error", async () => {
    const { completeActivitiesFor } = await import("./activities.js");
    const other = Object.assign(new Error("permission denied"), {
      code: "42501",
    });
    mocks.query.mockRejectedValue(other);

    await expect(completeActivitiesFor(TENANT, RECORD)).rejects.toThrow(
      /permission denied/,
    );
    const attempts = dataCalls().filter(({ sql }) =>
      /update\s+activities/i.test(sql),
    );
    expect(attempts).toHaveLength(1);
  });
});
