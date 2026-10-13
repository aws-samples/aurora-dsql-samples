import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { waitForIndexJob } from "./asyncIndex.js";

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

const JOB_ID = "its3zomaw5fwzjdnz3ojgcotji";

describe("waitForIndexJob", () => {
  it("calls the procedure with CALL, not SELECT", async () => {
    const { client, query } = clientReturning([{ succeeded: true }]);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await waitForIndexJob(client, JOB_ID, "CREATE INDEX ASYNC idx_x");
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("CALL sys.wait_for_job");
    // SELECT raises SQLSTATE 42809 on a stored procedure.
    expect(sql).not.toContain("SELECT");
    log.mockRestore();
  });

  // Aurora DSQL rejects a subquery as the CALL argument but accepts a bind
  // parameter, so the id must never be interpolated into the SQL text.
  it("passes the job id as a bind parameter, not inlined", async () => {
    const { client, query } = clientReturning([{ succeeded: true }]);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await waitForIndexJob(client, JOB_ID, "label");
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("$1");
    expect(sql).not.toContain(JOB_ID);
    expect(params).toEqual([JOB_ID]);
    log.mockRestore();
  });

  it("does not break on an id containing SQL metacharacters", async () => {
    // Nothing to escape, because the value never reaches the SQL text.
    const hostile = "'; DROP TABLE users; --";
    const { client, query } = clientReturning([{ succeeded: true }]);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await waitForIndexJob(client, hostile, "label");
    expect(query.mock.calls[0][0]).not.toContain("DROP TABLE");
    expect(query.mock.calls[0][1]).toEqual([hostile]);
    log.mockRestore();
  });

  it("returns quietly when the build succeeded", async () => {
    const { client } = clientReturning([{ succeeded: true }]);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(
      waitForIndexJob(client, JOB_ID, "label"),
    ).resolves.toBeUndefined();
    log.mockRestore();
  });

  // Review item #1 from the first round. Verified against a live cluster.
  it("throws when the build failed, naming the index and how to recover", async () => {
    const { client } = clientReturning([{ succeeded: false }]);
    await expect(
      waitForIndexJob(
        client,
        JOB_ID,
        "CREATE INDEX ASYNC IF NOT EXISTS idx_users_tenant ON users (tenant_id)",
      ),
    ).rejects.toThrow(/Async index build failed/);

    await expect(
      waitForIndexJob(client, JOB_ID, "idx_users_tenant"),
    ).rejects.toThrow(/DROP INDEX/);
  });

  it("does not treat a missing succeeded field as a failure", async () => {
    // Some statements return no row at all; only an explicit false is fatal.
    const { client } = clientReturning([]);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(
      waitForIndexJob(client, JOB_ID, "label"),
    ).resolves.toBeUndefined();
    log.mockRestore();
  });
});
