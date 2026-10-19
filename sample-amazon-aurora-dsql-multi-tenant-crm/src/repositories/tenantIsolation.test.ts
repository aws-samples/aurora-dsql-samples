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
/* -------------------------------------------------------------------------
 * Whole-surface sweep.
 *
 * The targeted tests above were written one at a time, in response to review
 * findings, which meant they covered whichever repository had been raised and
 * left the rest unproven: the tenant predicate could be deleted from
 * contacts.ts or opportunities.ts and the suite still passed.
 *
 * So rather than add two more hand-written cases, every tenant-scoped
 * repository entry point is enumerated below and checked by one shared rule.
 * A function missing from this table fails the coverage guard at the bottom,
 * which is what stops the gap from reopening when a repository gains a new
 * query.
 * ---------------------------------------------------------------------------
 */

/**
 * The rule every tenant-scoped statement must satisfy.
 *
 * Reads and writes must filter on tenant_id, and the placeholder they filter
 * on must actually be bound to the caller's tenant: resolving $n and checking
 * the value catches a predicate that is present but wired to the wrong
 * parameter, which a text-only match would wave through. Inserts instead have
 * to name tenant_id as a column and supply that same tenant.
 */
function expectTenantScoped(tenant: string) {
  const statements = dataCalls();
  expect(statements.length).toBeGreaterThan(0);

  for (const { sql, params } of statements) {
    if (/^\s*insert/i.test(sql)) {
      expect(sql, `INSERT must set tenant_id: ${sql}`).toMatch(
        /insert\s+into\s+\w+\s*\([^)]*\btenant_id\b/i,
      );
      expect(params, `INSERT must bind the tenant: ${sql}`).toContain(tenant);
      continue;
    }

    const predicate = sql.match(/where[\s\S]*?\btenant_id\s*=\s*\$(\d+)/i);
    expect(predicate, `missing tenant_id predicate: ${sql}`).not.toBeNull();
    expect(
      params[Number(predicate![1]) - 1],
      `tenant_id bound to the wrong parameter: ${sql}`,
    ).toBe(tenant);
  }
}

/**
 * Every tenant-scoped entry point, with each query branch listed separately.
 *
 * The optional-filter branches matter: listContacts, listOpportunities and
 * listActivities each run a different statement depending on whether the
 * filter is supplied, so exercising only one of the two leaves the other
 * unchecked.
 */
const TENANT_SCOPED: Array<{
  module: string;
  export: string;
  label: string;
  run: (tenant: string) => Promise<unknown>;
}> = [
  {
    module: "accounts.js",
    export: "createAccount",
    label: "createAccount",
    run: async (t) => {
      const { createAccount } = await import("./accounts.js");
      return createAccount(t, { name: "Acme" });
    },
  },
  {
    module: "accounts.js",
    export: "listAccounts",
    label: "listAccounts",
    run: async (t) => {
      const { listAccounts } = await import("./accounts.js");
      return listAccounts(t);
    },
  },
  {
    module: "accounts.js",
    export: "getAccount",
    label: "getAccount",
    run: async (t) => {
      const { getAccount } = await import("./accounts.js");
      return getAccount(t, ACCOUNT);
    },
  },
  {
    module: "accounts.js",
    export: "assertAccountInTenant",
    label: "assertAccountInTenant",
    run: async (t) => {
      const { assertAccountInTenant } = await import("./accounts.js");
      return assertAccountInTenant({ query: mocks.query } as never, t, ACCOUNT);
    },
  },
  {
    module: "contacts.js",
    export: "createContact",
    label: "createContact",
    run: async (t) => {
      const { createContact } = await import("./contacts.js");
      return createContact(t, {
        account_id: ACCOUNT,
        first_name: "Ada",
        last_name: "Lovelace",
      });
    },
  },
  {
    module: "contacts.js",
    export: "listContacts",
    label: "listContacts, no filter",
    run: async (t) => {
      const { listContacts } = await import("./contacts.js");
      return listContacts(t);
    },
  },
  {
    module: "contacts.js",
    export: "listContacts",
    label: "listContacts, filtered by account",
    run: async (t) => {
      const { listContacts } = await import("./contacts.js");
      return listContacts(t, ACCOUNT);
    },
  },
  {
    module: "contacts.js",
    export: "getContact",
    label: "getContact",
    run: async (t) => {
      const { getContact } = await import("./contacts.js");
      return getContact(t, RECORD);
    },
  },
  {
    module: "opportunities.js",
    export: "createOpportunity",
    label: "createOpportunity",
    run: async (t) => {
      const { createOpportunity } = await import("./opportunities.js");
      return createOpportunity(t, { account_id: ACCOUNT, name: "Renewal" });
    },
  },
  {
    module: "opportunities.js",
    export: "createOpportunity",
    label: "createOpportunity with an owner",
    run: async (t) => {
      const { createOpportunity } = await import("./opportunities.js");
      return createOpportunity(t, {
        account_id: ACCOUNT,
        name: "Renewal",
        owner_id: USER,
      });
    },
  },
  {
    module: "opportunities.js",
    export: "listOpportunities",
    label: "listOpportunities, no filter",
    run: async (t) => {
      const { listOpportunities } = await import("./opportunities.js");
      return listOpportunities(t);
    },
  },
  {
    module: "opportunities.js",
    export: "listOpportunities",
    label: "listOpportunities, filtered by stage",
    run: async (t) => {
      const { listOpportunities } = await import("./opportunities.js");
      return listOpportunities(t, "qualification");
    },
  },
  {
    module: "opportunities.js",
    export: "updateStage",
    label: "updateStage",
    run: async (t) => {
      const { updateStage } = await import("./opportunities.js");
      return updateStage(t, RECORD, "closed_won");
    },
  },
  {
    module: "activities.js",
    export: "createActivity",
    label: "createActivity",
    run: async (t) => {
      const { createActivity } = await import("./activities.js");
      return createActivity(t, {
        related_type: "account",
        related_id: ACCOUNT,
        subject: "Follow up",
      });
    },
  },
  {
    module: "activities.js",
    export: "listActivities",
    label: "listActivities, no filter",
    run: async (t) => {
      const { listActivities } = await import("./activities.js");
      return listActivities(t);
    },
  },
  {
    module: "activities.js",
    export: "listActivities",
    label: "listActivities, filtered by related record",
    run: async (t) => {
      const { listActivities } = await import("./activities.js");
      return listActivities(t, RECORD);
    },
  },
  {
    module: "activities.js",
    export: "completeActivitiesFor",
    label: "completeActivitiesFor",
    run: async (t) => {
      const { completeActivitiesFor } = await import("./activities.js");
      return completeActivitiesFor(t, RECORD);
    },
  },
  {
    module: "users.js",
    export: "assertUserInTenant",
    label: "assertUserInTenant",
    run: async (t) => {
      const { assertUserInTenant } = await import("./users.js");
      return assertUserInTenant({ query: mocks.query } as never, t, USER);
    },
  },
];

describe("every tenant-scoped repository query filters on the tenant", () => {
  beforeEach(() => {
    // A row is returned so the in-tenant assertions pass and the writes that
    // follow them actually run. rowCount 1 also ends the batch loop in
    // completeActivitiesFor after a single pass.
    mocks.query.mockResolvedValue({
      rows: [{ "?column?": 1 }],
      rowCount: 1,
    });
  });

  for (const entry of TENANT_SCOPED) {
    it(`${entry.module} ${entry.label}`, async () => {
      await entry.run(TENANT);
      expectTenantScoped(TENANT);
    });

    // Same call with a different tenant. If an implementation ever hardcoded a
    // tenant, or took it from somewhere other than its argument, the sweep
    // above would still pass and this would not.
    it(`${entry.module} ${entry.label}, with a different tenant`, async () => {
      await entry.run(OTHER_TENANT);
      expectTenantScoped(OTHER_TENANT);
    });
  }
});

describe("coverage guard", () => {
  /**
   * Exports that are deliberately not in the sweep, with the reason. Anything
   * else new has to be classified, which is the point: a repository function
   * added without a tenant predicate cannot pass unnoticed.
   */
  const EXEMPT: Record<string, string> = {
    "tenants.js createTenant": "tenant registry, creates the tenant itself",
    "tenants.js listTenants": "tenant registry, administrative listing",
    "tenants.js getTenant": "tenant registry, looks a tenant up by its own id",
  };

  const REPOSITORY_MODULES = [
    "accounts.js",
    "activities.js",
    "contacts.js",
    "opportunities.js",
    "tenants.js",
    "users.js",
  ];

  it("has every exported repository function either swept or exempted", async () => {
    const covered = new Set(
      TENANT_SCOPED.map((e) => `${e.module} ${e.export}`),
    );
    const unclassified: string[] = [];

    for (const moduleName of REPOSITORY_MODULES) {
      const mod: Record<string, unknown> = await import(`./${moduleName}`);
      for (const [name, value] of Object.entries(mod)) {
        if (typeof value !== "function") continue;
        const key = `${moduleName} ${name}`;
        if (covered.has(key) || key in EXEMPT) continue;
        unclassified.push(key);
      }
    }

    expect(
      unclassified,
      "add these to TENANT_SCOPED, or to EXEMPT with a reason",
    ).toEqual([]);
  });
});
