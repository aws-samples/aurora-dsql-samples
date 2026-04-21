// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * HTTP Request Handlers for the Booking API (deno-postgres)
 *
 * Implements the booking CRUD endpoints using URL-based routing and the native
 * `deno-postgres` driver. Each handler creates a per-request database
 * connection, executes the operation inside a transaction (for writes), and
 * returns a JSON response.
 *
 * Write operations (create, update, delete) are wrapped in `withOccRetry` so
 * that Aurora DSQL optimistic concurrency conflicts (`OC000`) are retried
 * automatically. Overlap detection for double-booking prevention is performed
 * via SQL within the same transaction — DSQL doesn't support exclusion
 * constraints or triggers.
 *
 * Error responses follow a consistent JSON format with appropriate HTTP status
 * codes: 400 (bad request), 404 (not found), 409 (overlap conflict),
 * 503 (database failure), and 500 (unexpected errors).
 *
 * @module handlers
 */

import { createConnection } from "./db.ts";
import { withOccRetry } from "./occ-retry.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Application context passed to every request handler.
 *
 * @property endpoint - Aurora DSQL cluster hostname
 * @property user - PostgreSQL user for non-admin operations
 */
export interface AppContext {
  endpoint: string;
  user: string;
}

/**
 * A booking record as stored in the database.
 */
export interface Booking {
  id: string;
  resource_name: string;
  start_time: string;
  end_time: string;
  booked_by: string;
  created_at: string;
}

/**
 * Request body for creating a new booking.
 */
export interface CreateBookingRequest {
  resource_name: string;
  start_time: string;
  end_time: string;
  booked_by: string;
}

/**
 * Request body for updating an existing booking (all fields optional).
 */
export interface UpdateBookingRequest {
  resource_name?: string;
  start_time?: string;
  end_time?: string;
  booked_by?: string;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/**
 * Routes an incoming HTTP request to the appropriate booking handler.
 *
 * Matches on HTTP method and URL path. Unmatched routes return 404. Any
 * unexpected error is caught and returned as a 500 response.
 *
 * @param req - The incoming HTTP request
 * @param ctx - Application context (cluster endpoint, user)
 * @returns A JSON HTTP response
 */
export async function handleRequest(
  req: Request,
  ctx: AppContext,
): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  try {
    // Health check — no database connection required
    if (method === "GET" && path === "/health") {
      return jsonResponse({ status: "ok" });
    }

    if (method === "POST" && path === "/bookings") {
      return await createBooking(req, ctx);
    }
    if (method === "GET" && path === "/bookings") {
      return await listBookings(ctx);
    }
    if (method === "GET" && path.match(/^\/bookings\/[\w-]+$/)) {
      return await getBooking(path, ctx);
    }
    if (method === "PUT" && path.match(/^\/bookings\/[\w-]+$/)) {
      return await updateBooking(req, path, ctx);
    }
    if (method === "DELETE" && path.match(/^\/bookings\/[\w-]+$/)) {
      return await deleteBooking(path, ctx);
    }

    return jsonResponse({ error: "Not Found" }, 404);
  } catch (error) {
    console.error("Request error:", error);
    return jsonResponse({ error: "Internal Server Error" }, 500);
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * POST /bookings — Create a new booking.
 *
 * Validates the request body, checks for time-range overlaps within a
 * transaction, inserts the booking with a server-generated UUID, and returns
 * the created record. Wrapped in `withOccRetry` for OCC conflict handling.
 */
async function createBooking(
  req: Request,
  ctx: AppContext,
): Promise<Response> {
  let body: CreateBookingRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON in request body" }, 400);
  }

  // Validate required fields
  for (const field of ["resource_name", "start_time", "end_time", "booked_by"] as const) {
    if (!body[field]) {
      return jsonResponse({ error: `Missing required field: ${field}` }, 400);
    }
  }

  // Validate time range
  if (new Date(body.end_time) <= new Date(body.start_time)) {
    return jsonResponse({ error: "end_time must be after start_time" }, 400);
  }

  try {
    const booking = await withOccRetry(async () => {
      const client = await createConnection({
        endpoint: ctx.endpoint,
        user: ctx.user,
        isAdmin: ctx.user === "admin",
      });

      try {
        await client.queryArray("BEGIN");

        // Check for overlapping bookings on the same resource
        const overlap = await client.queryObject<{ id: string }>(
          `SELECT id FROM bookings
           WHERE resource_name = $1
             AND start_time < $2
             AND end_time > $3`,
          [body.resource_name, body.end_time, body.start_time],
        );

        if (overlap.rows.length > 0) {
          await client.queryArray("ROLLBACK");
          return {
            conflict: true,
            conflicting_id: overlap.rows[0].id,
          } as const;
        }

        const result = await client.queryObject<Booking>(
          `INSERT INTO bookings (resource_name, start_time, end_time, booked_by)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [body.resource_name, body.start_time, body.end_time, body.booked_by],
        );

        await client.queryArray("COMMIT");
        return { conflict: false, booking: result.rows[0] } as const;
      } catch (error) {
        await client.queryArray("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        await client.end();
      }
    });

    if (booking.conflict) {
      return jsonResponse(
        {
          error: "Booking conflicts with existing reservation",
          conflicting_id: booking.conflicting_id,
        },
        409,
      );
    }

    return jsonResponse(booking.booking, 201);
  } catch (error) {
    return handleDbError(error);
  }
}

/**
 * GET /bookings — List all bookings.
 */
async function listBookings(ctx: AppContext): Promise<Response> {
  try {
    const client = await createConnection({
      endpoint: ctx.endpoint,
      user: ctx.user,
      isAdmin: ctx.user === "admin",
    });

    try {
      const result = await client.queryObject<Booking>(
        `SELECT * FROM bookings ORDER BY start_time`,
      );
      return jsonResponse(result.rows);
    } finally {
      await client.end();
    }
  } catch (error) {
    return handleDbError(error);
  }
}

/**
 * GET /bookings/:id — Fetch a single booking by UUID.
 */
async function getBooking(
  path: string,
  ctx: AppContext,
): Promise<Response> {
  const id = path.split("/").pop()!;

  try {
    const client = await createConnection({
      endpoint: ctx.endpoint,
      user: ctx.user,
      isAdmin: ctx.user === "admin",
    });

    try {
      const result = await client.queryObject<Booking>(
        `SELECT * FROM bookings WHERE id = $1`,
        [id],
      );

      if (result.rows.length === 0) {
        return jsonResponse({ error: "Booking not found" }, 404);
      }

      return jsonResponse(result.rows[0]);
    } finally {
      await client.end();
    }
  } catch (error) {
    return handleDbError(error);
  }
}

/**
 * PUT /bookings/:id — Update an existing booking.
 *
 * Accepts partial updates. If time fields change, re-checks for overlaps
 * (excluding the booking being updated). Wrapped in `withOccRetry`.
 */
async function updateBooking(
  req: Request,
  path: string,
  ctx: AppContext,
): Promise<Response> {
  const id = path.split("/").pop()!;

  let body: UpdateBookingRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON in request body" }, 400);
  }

  try {
    const result = await withOccRetry(async () => {
      const client = await createConnection({
        endpoint: ctx.endpoint,
        user: ctx.user,
        isAdmin: ctx.user === "admin",
      });

      try {
        await client.queryArray("BEGIN");

        // Fetch the existing booking
        const existing = await client.queryObject<Booking>(
          `SELECT * FROM bookings WHERE id = $1`,
          [id],
        );

        if (existing.rows.length === 0) {
          await client.queryArray("ROLLBACK");
          return { notFound: true } as const;
        }

        const current = existing.rows[0];
        const updated = {
          resource_name: body.resource_name ?? current.resource_name,
          start_time: body.start_time ?? current.start_time,
          end_time: body.end_time ?? current.end_time,
          booked_by: body.booked_by ?? current.booked_by,
        };

        // Validate time range
        if (new Date(updated.end_time) <= new Date(updated.start_time)) {
          await client.queryArray("ROLLBACK");
          return { invalidTime: true } as const;
        }

        // Check for overlapping bookings (exclude self)
        const overlap = await client.queryObject<{ id: string }>(
          `SELECT id FROM bookings
           WHERE resource_name = $1
             AND start_time < $2
             AND end_time > $3
             AND id != $4`,
          [updated.resource_name, updated.end_time, updated.start_time, id],
        );

        if (overlap.rows.length > 0) {
          await client.queryArray("ROLLBACK");
          return {
            conflict: true,
            conflicting_id: overlap.rows[0].id,
          } as const;
        }

        const updateResult = await client.queryObject<Booking>(
          `UPDATE bookings
           SET resource_name = $1, start_time = $2, end_time = $3, booked_by = $4
           WHERE id = $5
           RETURNING *`,
          [
            updated.resource_name,
            updated.start_time,
            updated.end_time,
            updated.booked_by,
            id,
          ],
        );

        await client.queryArray("COMMIT");
        return { booking: updateResult.rows[0] } as const;
      } catch (error) {
        await client.queryArray("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        await client.end();
      }
    });

    if ("notFound" in result) {
      return jsonResponse({ error: "Booking not found" }, 404);
    }
    if ("invalidTime" in result) {
      return jsonResponse({ error: "end_time must be after start_time" }, 400);
    }
    if ("conflict" in result) {
      return jsonResponse(
        {
          error: "Booking conflicts with existing reservation",
          conflicting_id: result.conflicting_id,
        },
        409,
      );
    }

    return jsonResponse(result.booking);
  } catch (error) {
    return handleDbError(error);
  }
}

/**
 * DELETE /bookings/:id — Cancel (delete) a booking by UUID.
 *
 * Wrapped in `withOccRetry` since the delete runs inside a transaction.
 */
async function deleteBooking(
  path: string,
  ctx: AppContext,
): Promise<Response> {
  const id = path.split("/").pop()!;

  try {
    const deleted = await withOccRetry(async () => {
      const client = await createConnection({
        endpoint: ctx.endpoint,
        user: ctx.user,
        isAdmin: ctx.user === "admin",
      });

      try {
        await client.queryArray("BEGIN");

        const result = await client.queryObject<Booking>(
          `DELETE FROM bookings WHERE id = $1 RETURNING *`,
          [id],
        );

        await client.queryArray("COMMIT");
        return result.rows.length > 0 ? result.rows[0] : null;
      } catch (error) {
        await client.queryArray("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        await client.end();
      }
    });

    if (!deleted) {
      return jsonResponse({ error: "Booking not found" }, 404);
    }

    return jsonResponse(deleted);
  } catch (error) {
    return handleDbError(error);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a JSON HTTP response with the given body and status code.
 *
 * @param body - The response payload (will be JSON-serialized)
 * @param status - HTTP status code (default: 200)
 * @returns A `Response` with `Content-Type: application/json`
 */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Maps database-level errors to appropriate HTTP error responses.
 *
 * Connection failures (e.g., auth errors, timeouts) return 503;
 * invalid UUID format errors return 404 (treat as "not found");
 * everything else returns 500.
 */
function handleDbError(error: unknown): Response {
  console.error("Database error:", error);

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    // Invalid UUID format → treat as "not found" (the ID doesn't exist)
    if (msg.includes("invalid input syntax for type uuid")) {
      return jsonResponse({ error: "Booking not found" }, 404);
    }

    // Connection-level failures → 503
    if (
      msg.includes("connection") ||
      msg.includes("timeout") ||
      msg.includes("failed to generate iam token")
    ) {
      return jsonResponse(
        { error: "Service unavailable — database connection failed" },
        503,
      );
    }
  }

  // Check deno-postgres error fields for UUID syntax errors
  if (error && typeof error === "object") {
    const fields = (error as Record<string, unknown>).fields;
    if (fields && typeof fields === "object") {
      const fieldMsg = (fields as Record<string, unknown>).message;
      if (typeof fieldMsg === "string" && fieldMsg.includes("invalid input syntax for type uuid")) {
        return jsonResponse({ error: "Booking not found" }, 404);
      }
    }
  }

  return jsonResponse({ error: "Internal Server Error" }, 500);
}
