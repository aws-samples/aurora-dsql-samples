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

  // Unique-violation (e.g. duplicate email within a tenant).
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  ) {
    res.status(409).json({ error: "Resource already exists" });
    return;
  }

  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
}
