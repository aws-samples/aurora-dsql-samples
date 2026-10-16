import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { errorHandler } from "./error.js";
import { ApiError } from "../types.js";

/** Minimal Response double that records what the handler sent. */
function mockRes() {
  const sent: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: unknown) {
      sent.body = body;
      return this;
    },
  };
  return { res: res as unknown as Response, sent };
}

function run(err: unknown) {
  const { res, sent } = mockRes();
  errorHandler(
    err,
    {} as Request,
    res,
    (() => undefined) as unknown as NextFunction,
  );
  return sent;
}

describe("errorHandler", () => {
  it("uses an ApiError's own status and message", () => {
    expect(run(new ApiError(403, "Tenant is not active"))).toEqual({
      status: 403,
      body: { error: "Tenant is not active" },
    });
  });

  it("maps a unique violation to 409", () => {
    expect(run({ code: "23505" })).toEqual({
      status: 409,
      body: { error: "Resource already exists" },
    });
  });

  it("passes through body-parser's 400 for malformed JSON", () => {
    expect(run({ status: 400, type: "entity.parse.failed" })).toEqual({
      status: 400,
      body: { error: "Malformed request body" },
    });
  });

  it("passes through body-parser's 413 for an oversized body", () => {
    expect(run({ status: 413, type: "entity.too.large" })).toEqual({
      status: 413,
      body: { error: "Request body too large" },
    });
  });

  it("honours statusCode as well as status", () => {
    expect(run({ statusCode: 400 }).status).toBe(400);
  });

  // Class 22 is "data exception". These reach the handler only when a route's
  // own validation missed the case, so the mapping is the backstop for #3.
  it.each([
    ["22P02", "invalid UUID text"],
    ["22001", "value too long for the column"],
    ["22007", "bad date/time"],
    ["22003", "numeric out of range"],
  ])("maps SQLSTATE %s (%s) to 400", (code) => {
    expect(run({ code })).toEqual({
      status: 400,
      body: { error: "Invalid value in request" },
    });
  });

  it("maps a foreign-key violation to 400", () => {
    expect(run({ code: "23503" })).toEqual({
      status: 400,
      body: { error: "Referenced record does not exist" },
    });
  });

  it.each(["23502", "23514"])(
    "maps constraint violation %s to 400",
    (code) => {
      expect(run({ code })).toEqual({
        status: 400,
        body: { error: "Request violates a field constraint" },
      });
    },
  );

  it("reports anything unrecognised as a generic 500", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sent = run(new Error("connection reset by peer"));
    expect(sent).toEqual({
      status: 500,
      body: { error: "Internal server error" },
    });
    spy.mockRestore();
  });

  it("does not leak internal detail on a 500", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sent = run(new Error("password=hunter2 host=internal.example"));
    expect(JSON.stringify(sent.body)).not.toContain("hunter2");
    expect(JSON.stringify(sent.body)).not.toContain("internal.example");
    spy.mockRestore();
  });
});
