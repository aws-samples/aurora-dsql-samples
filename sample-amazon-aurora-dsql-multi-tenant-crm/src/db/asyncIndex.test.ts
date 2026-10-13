import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { JOB_ID_RE, waitForIndexJob } from "./asyncIndex.js";

/**
 * The shapes below are what a live Aurora DSQL cluster actually returns. A
 * `CREATE UNIQUE INDEX ASYNC` over duplicate values yields
 * `[{ succeeded: false }]` and leaves the index with `indisvalid = false`; a
 * clean build yields `[{ succeeded: true }]`.
 */
function clientReturning(rows: unknown[]) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { client: { query } as unknown as PoolClient, query };
}

const GOOD_JOB_ID = "its3zomaw5fwzjdnz3ojgcotji";

describe("JOB_ID_RE", () => {
  it("accepts a real Aurora DSQL job id", () => {
    expect(JOB_ID_RE.test(GOOD_JOB_ID)).toBe(true);
    expect(JOB_ID_RE.test("abcdefghij0123456789klmnop")).toBe(true);
  });

  // This is the bug that live testing caught: job ids are not UUIDs, and a
  // UUID regex here rejected every valid id.
  it("is not a UUID check", () => {
    expect(JOB_ID_RE.test("4f9a1c2e-1b7d-4a3f-9c21-0b5e8d7a6f11")).toBe(false);
  });

  it.each([
    ["too short", "abc"],
    ["too long", "a".repeat(27)],
    ["uppercase", GOOD_JOB_ID.toUpperCase()],
    ["single quote", `${GOOD_JOB_ID.slice(0, 25)}'`],
    ["quote and semicolon", "'; DROP TABLE users; --   "],
    ["backslash", `${GOOD_JOB_ID.slice(0, 25)}\\`],
    ["whitespace", `${GOOD_JOB_ID.slice(0, 25)} `],
  ])("rejects %s", (_label, candidate) => {
    expect(JOB_ID_RE.test(candidate)).toBe(false);
  });
});

describe("waitForIndexJob", () => {
  it("calls the procedure with CALL, not SELECT", async () => {
    const { client, query } = clientReturning([{ succeeded: true }]);
    await waitForIndexJob(client, GOOD_JOB_ID, "CREATE INDEX ASYNC idx_x");
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("CALL sys.wait_for_job");
    expect(sql).not.toContain("SELECT");
  });

  it("inlines the job id as a literal rather than binding it", async () => {
    const { client, query } = clientReturning([{ succeeded: true }]);
    await waitForIndexJob(client, GOOD_JOB_ID, "label");
    expect(query.mock.calls[0][0]).toContain(`'${GOOD_JOB_ID}'`);
    // No parameter array: Aurora DSQL does not accept a bind parameter here.
    expect(query.mock.calls[0][1]).toBeUndefined();
  });

  it("returns quietly when the build succeeded", async () => {
    const { client } = clientReturning([{ succeeded: true }]);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(
      waitForIndexJob(client, GOOD_JOB_ID, "label"),
    ).resolves.toBeUndefined();
    log.mockRestore();
  });

  // Review item #1. Verified against a live cluster before writing this.
  it("throws when the build failed, naming the index and how to recover", async () => {
    const { client } = clientReturning([{ succeeded: false }]);
    await expect(
      waitForIndexJob(
        client,
        GOOD_JOB_ID,
        "CREATE INDEX ASYNC IF NOT EXISTS idx_users_tenant ON users (tenant_id)",
      ),
    ).rejects.toThrow(/Async index build failed/);

    await expect(
      waitForIndexJob(client, GOOD_JOB_ID, "idx_users_tenant"),
    ).rejects.toThrow(/DROP INDEX/);
  });

  it("does not treat a missing succeeded field as a failure", async () => {
    // Some statements return no row at all; only an explicit false is fatal.
    const { client } = clientReturning([]);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(
      waitForIndexJob(client, GOOD_JOB_ID, "label"),
    ).resolves.toBeUndefined();
    log.mockRestore();
  });

  it("refuses a malformed job id before touching the database", async () => {
    const { client, query } = clientReturning([{ succeeded: true }]);
    await expect(
      waitForIndexJob(client, "'; DROP TABLE users; --", "label"),
    ).rejects.toThrow(/malformed job id/);
    expect(query).not.toHaveBeenCalled();
  });

  it("refuses a UUID-shaped job id before touching the database", async () => {
    const { client, query } = clientReturning([{ succeeded: true }]);
    await expect(
      waitForIndexJob(client, "4f9a1c2e-1b7d-4a3f-9c21-0b5e8d7a6f11", "label"),
    ).rejects.toThrow(/Expected 26 lowercase alphanumeric characters/);
    expect(query).not.toHaveBeenCalled();
  });
});
