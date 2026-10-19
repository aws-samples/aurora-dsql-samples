import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../types.js";

/**
 * Centralized error handler. Maps ApiError to its status code and returns a
 * generic message for anything unexpected, so internal details never leak to
 * clients.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // next is required so Express recognizes this as an error handler.
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  const code =
    typeof err === "object" && err !== null && "code" in err
      ? (err as { code?: string }).code
      : undefined;

  // Unique-violation (e.g. duplicate email within a tenant).
  if (code === "23505") {
    res.status(409).json({ error: "Resource already exists" });
    return;
  }

  // body-parser attaches a status for malformed JSON (400) and for a body over
  // its size limit (413). Honour it instead of reporting a server fault for
  // what is a bad request.
  const bodyParserStatus =
    typeof err === "object" && err !== null
      ? ((err as { status?: number; statusCode?: number }).status ??
        (err as { statusCode?: number }).statusCode)
      : undefined;
  if (
    typeof bodyParserStatus === "number" &&
    bodyParserStatus >= 400 &&
    bodyParserStatus < 500
  ) {
    const message =
      bodyParserStatus === 413 ? "Request body too large" : "Malformed request body";
    res.status(bodyParserStatus).json({ error: message });
    return;
  }

  // Class 22 is "data exception": invalid UUID text (22P02), value too long
  // for the column (22001), bad date/time (22007/22008), numeric out of range
  // (22003). These all mean the client sent something unusable, so they are
  // 400s rather than 500s. Routes validate the common cases up front; this is
  // the backstop.
  if (code && code.startsWith("22")) {
    res.status(400).json({ error: "Invalid value in request" });
    return;
  }

  // Foreign-key violation: the request referenced a row that does not exist.
  if (code === "23503") {
    res.status(400).json({ error: "Referenced record does not exist" });
    return;
  }

  // Not-null and check-constraint violations are also client errors.
  if (code === "23502" || code === "23514") {
    res.status(400).json({ error: "Request violates a field constraint" });
    return;
  }

  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
}
