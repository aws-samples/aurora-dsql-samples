// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

/**
 * HTTP Request Handlers for the Booking API (postgres.js)
 *
 * Implements booking CRUD endpoints using URL-based routing and a
 * postgres.js `sql` client (pooled, backed by the Aurora DSQL connector).
 * Each handler uses a short `sql.begin(...)` transaction for writes.
 * Overlap detection runs inside the transaction; the unique index on
 * `(resource_name, start_time, end_time)` is the commit-time backstop
 * for identical-window race conditions.
 *
 * Error responses follow a consistent JSON format with appropriate HTTP
 * status codes: 400 (bad request), 404 (not found), 409 (overlap),
 * 503 (transient DB conflict / unavailable), 500 (unexpected).
 *
 * @module handlers
 */

import { withOccRetry } from "./occ-retry.ts";
import type { Sql } from "./db.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum JSON request body size in bytes (16 KB). Aurora DSQL bookings are
 * small structured records; 16 KB is ample. Enforcing a cap protects against
 * memory exhaustion from oversized payloads. Clients exceeding this receive
 * HTTP 413.
 */
const MAX_JSON_BODY_BYTES = 16 * 1024;

/**
 * Strict UUID v4 (RFC 4122) path regex for booking IDs. Matching upstream
 * returns 404 for obviously malformed IDs without reaching the DB layer.
 */
const BOOKING_ID_REGEX =
  /^\/bookings\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Application context passed to every request handler.
 */
export interface AppContext {
  /** Pooled postgres.js client backed by the DSQL connector. */
  sql: Sql;
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
// SQLSTATE helpers
// ---------------------------------------------------------------------------

function extractSqlState(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as Record<string, unknown>).code;
  return typeof code === "string" ? code : undefined;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/**
 * Routes an incoming HTTP request to the appropriate booking handler.
 *
 * Matches on HTTP method and URL path. Unmatched routes return 404. Any
 * unexpected error is caught and returned as a 500 response.
 */
export async function handleRequest(
  req: Request,
  ctx: AppContext,
): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  try {
    // Health check — no database query required
    if (method === "GET" && path === "/health") {
      return jsonResponse({ status: "ok" });
    }

    if (method === "POST" && path === "/bookings") {
      return await createBooking(req, ctx);
    }
    if (method === "GET" && path === "/bookings") {
      return await listBookings(ctx);
    }
    if (method === "GET" && BOOKING_ID_REGEX.test(path)) {
      return await getBooking(path, ctx);
    }
    if (method === "PUT" && BOOKING_ID_REGEX.test(path)) {
      return await updateBooking(req, path, ctx);
    }
    if (method === "DELETE" && BOOKING_ID_REGEX.test(path)) {
      return await deleteBooking(path, ctx);
    }

    return jsonResponse({ error: "Not Found" }, 404);
  } catch (error) {
    logError("Request error", error);
    return jsonResponse({ error: "Internal Server Error" }, 500);
  }
}

// ---------------------------------------------------------------------------
// Body parsing (with size cap)
// ---------------------------------------------------------------------------

/**
 * Reads and JSON-parses the request body, enforcing `MAX_JSON_BODY_BYTES`.
 *
 * Returns `{ body }` on success, or `{ error }` Response if the body is
 * missing, exceeds the cap, or is not valid JSON. The caller returns the
 * error Response unchanged.
 */
async function readJsonBody<T>(
  req: Request,
): Promise<{ body: T } | { error: Response }> {
  const contentLength = req.headers.get("content-length");
  if (contentLength !== null) {
    const advertised = Number.parseInt(contentLength, 10);
    if (Number.isFinite(advertised) && advertised > MAX_JSON_BODY_BYTES) {
      return { error: jsonResponse({ error: "Request body too large" }, 413) };
    }
  }

  const reader = req.body?.getReader();
  if (!reader) {
    return { error: jsonResponse({ error: "Missing request body" }, 400) };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_JSON_BODY_BYTES) {
      await reader.cancel();
      return { error: jsonResponse({ error: "Request body too large" }, 413) };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);

  try {
    return { body: JSON.parse(text) as T };
  } catch {
    return {
      error: jsonResponse({ error: "Invalid JSON in request body" }, 400),
    };
  }
}

// ---------------------------------------------------------------------------
// Time-range validation helper
// ---------------------------------------------------------------------------

/**
 * Parses and validates an ISO-8601 time-range pair.
 *
 * Returns `{ startDate, endDate }` on success, or an `{ error }` Response
 * if either string doesn't parse to a valid `Date` or if `endDate` is not
 * strictly after `startDate`. The DB's `CHECK (end_time > start_time)`
 * constraint is the second line of defense; this helper gives callers a
 * clear 400 instead of a 500 from the database type error when the client
 * sends a non-parseable timestamp.
 */
function parseTimeRange(
  startTime: string,
  endTime: string,
): { startDate: Date; endDate: Date } | { error: Response } {
  const startDate = new Date(startTime);
  const endDate = new Date(endTime);
  if (Number.isNaN(startDate.getTime())) {
    return {
      error: jsonResponse(
        { error: "Invalid ISO-8601 timestamp for start_time" },
        400,
      ),
    };
  }
  if (Number.isNaN(endDate.getTime())) {
    return {
      error: jsonResponse(
        { error: "Invalid ISO-8601 timestamp for end_time" },
        400,
      ),
    };
  }
  if (endDate <= startDate) {
    return {
      error: jsonResponse(
        { error: "end_time must be after start_time" },
        400,
      ),
    };
  }
  return { startDate, endDate };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * POST /bookings — Create a new booking.
 *
 * Validates the request, checks for overlap inside a transaction, inserts
 * with a server-generated UUID, and returns the created record. Wrapped
 * in `withOccRetry` for automatic OC000/OC001 retry.
 */
async function createBooking(
  req: Request,
  ctx: AppContext,
): Promise<Response> {
  const parsed = await readJsonBody<CreateBookingRequest>(req);
  if ("error" in parsed) return parsed.error;
  const body = parsed.body;

  for (
    const field of [
      "resource_name",
      "start_time",
      "end_time",
      "booked_by",
    ] as const
  ) {
    if (!body[field]) {
      return jsonResponse({ error: `Missing required field: ${field}` }, 400);
    }
  }

  const timeRange = parseTimeRange(body.start_time, body.end_time);
  if ("error" in timeRange) return timeRange.error;

  try {
    const result = await withOccRetry(() =>
      ctx.sql.begin(async (tx) => {
        // Overlap detection inside the transaction.
        //
        // Write-skew caveat: two concurrent transactions inserting
        // overlapping-but-distinct windows (e.g., 9:00–10:00 and
        // 9:30–10:30) may both pass this SELECT and both commit —
        // DSQL's OCC only conflicts writes to the same physical rows,
        // and the unique index on (resource_name, start_time, end_time)
        // catches only identical windows. For strict serialization,
        // maintain a `resources` table and `SELECT ... FOR UPDATE` on
        // the resource row before this check. See README § "Concurrency
        // model" for details.
        const overlap = await tx<{ id: string }[]>`
          SELECT id FROM bookings
          WHERE resource_name = ${body.resource_name}
            AND start_time < ${body.end_time}
            AND end_time > ${body.start_time}
          LIMIT 1
        `;

        if (overlap.length > 0) {
          return {
            conflict: true as const,
            conflicting_id: overlap[0].id,
          };
        }

        try {
          const inserted = await tx<Booking[]>`
            INSERT INTO bookings (resource_name, start_time, end_time, booked_by)
            VALUES (${body.resource_name}, ${body.start_time}, ${body.end_time}, ${body.booked_by})
            RETURNING *
          `;

          return {
            conflict: false as const,
            booking: inserted[0],
          };
        } catch (error: unknown) {
          // 23505 = unique_violation. Thrown by idx_bookings_uniq_window
          // when a concurrent transaction committed the same window
          // between our SELECT and INSERT. Map to the same 409 response.
          if (extractSqlState(error) === "23505") {
            return {
              conflict: true as const,
              conflicting_id: null,
            };
          }
          throw error;
        }
      })
    );

    if (result.conflict) {
      return jsonResponse(
        {
          error: "Booking conflicts with existing reservation",
          conflicting_id: result.conflicting_id,
        },
        409,
      );
    }
    return jsonResponse(result.booking, 201);
  } catch (error) {
    return handleDbError(error);
  }
}

/**
 * Maximum rows returned by `listBookings`. A sample-simplification: returns
 * the first N bookings in `start_time` order with no cursor or `offset`
 * support. Production deployments should replace this with keyset pagination
 * (e.g., `?limit=50&after=<id>`) and index `(start_time, id)` for stable
 * ordering — see README for the pattern.
 */
const MAX_LIST_BOOKINGS = 1000;

/**
 * GET /bookings — List bookings, capped at `MAX_LIST_BOOKINGS`.
 *
 * The cap prevents an unbounded result from exhausting server memory or
 * producing an excessively large response on a cluster with many rows.
 * See `MAX_LIST_BOOKINGS` for pagination guidance.
 */
async function listBookings(ctx: AppContext): Promise<Response> {
  try {
    const rows = await ctx.sql<Booking[]>`
      SELECT * FROM bookings ORDER BY start_time LIMIT ${MAX_LIST_BOOKINGS}
    `;
    return jsonResponse(rows);
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
    const rows = await ctx.sql<Booking[]>`
      SELECT * FROM bookings WHERE id = ${id}
    `;
    if (rows.length === 0) {
      return jsonResponse({ error: "Booking not found" }, 404);
    }
    return jsonResponse(rows[0]);
  } catch (error) {
    return handleDbError(error);
  }
}

/**
 * PUT /bookings/:id — Update an existing booking.
 *
 * Accepts partial updates. Re-checks overlap excluding self when time
 * fields change. Wrapped in `withOccRetry`.
 */
async function updateBooking(
  req: Request,
  path: string,
  ctx: AppContext,
): Promise<Response> {
  const id = path.split("/").pop()!;

  const parsed = await readJsonBody<UpdateBookingRequest>(req);
  if ("error" in parsed) return parsed.error;
  const body = parsed.body;

  try {
    const result = await withOccRetry(() =>
      ctx.sql.begin(async (tx) => {
        const existing = await tx<Booking[]>`
          SELECT * FROM bookings WHERE id = ${id}
        `;
        if (existing.length === 0) {
          return { notFound: true as const };
        }

        const current = existing[0];
        const updated = {
          resource_name: body.resource_name ?? current.resource_name,
          start_time: body.start_time ?? current.start_time,
          end_time: body.end_time ?? current.end_time,
          booked_by: body.booked_by ?? current.booked_by,
        };

        const updatedRange = parseTimeRange(
          updated.start_time,
          updated.end_time,
        );
        if ("error" in updatedRange) {
          return { invalidTime: updatedRange.error };
        }

        // Same write-skew caveat as createBooking's overlap check —
        // see that comment and README § "Concurrency model" for details.
        const overlap = await tx<{ id: string }[]>`
          SELECT id FROM bookings
          WHERE resource_name = ${updated.resource_name}
            AND start_time < ${updated.end_time}
            AND end_time > ${updated.start_time}
            AND id != ${id}
          LIMIT 1
        `;

        if (overlap.length > 0) {
          return {
            conflict: true as const,
            conflicting_id: overlap[0].id,
          };
        }

        try {
          const rows = await tx<Booking[]>`
            UPDATE bookings
            SET resource_name = ${updated.resource_name},
                start_time = ${updated.start_time},
                end_time = ${updated.end_time},
                booked_by = ${updated.booked_by}
            WHERE id = ${id}
            RETURNING *
          `;
          return { booking: rows[0] };
        } catch (error: unknown) {
          if (extractSqlState(error) === "23505") {
            return {
              conflict: true as const,
              conflicting_id: null,
            };
          }
          throw error;
        }
      })
    );

    if ("notFound" in result) {
      return jsonResponse({ error: "Booking not found" }, 404);
    }
    if ("invalidTime" in result) {
      return result.invalidTime!;
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
 */
async function deleteBooking(
  path: string,
  ctx: AppContext,
): Promise<Response> {
  const id = path.split("/").pop()!;

  try {
    const deleted = await withOccRetry(async () => {
      const rows = await ctx.sql<Booking[]>`
        DELETE FROM bookings WHERE id = ${id} RETURNING *
      `;
      return rows.length > 0 ? rows[0] : null;
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
 * Creates a JSON HTTP response.
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
 * - OCC conflict (SQLSTATE 40001/OC000/OC001) → 503
 * - Invalid UUID format → 404
 * - Connection failures → 503
 * - Everything else → 500
 */
function handleDbError(error: unknown): Response {
  logError("Database error", error);

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    if (msg.includes("invalid input syntax for type uuid")) {
      return jsonResponse({ error: "Booking not found" }, 404);
    }

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

  const sqlstate = extractSqlState(error);
  if (sqlstate === "OC000" || sqlstate === "OC001" || sqlstate === "40001") {
    return jsonResponse(
      {
        error:
          "Service busy — transaction conflict. Retry after a short backoff.",
      },
      503,
    );
  }
  if (sqlstate === "22P02") {
    // invalid_text_representation — typically a bad UUID
    return jsonResponse({ error: "Booking not found" }, 404);
  }

  return jsonResponse({ error: "Internal Server Error" }, 500);
}

/**
 * Logs an error with only safe fields — never the full error object.
 *
 * postgres.js errors may include the executed query and bound parameters;
 * logging the full object can leak user input. This helper emits only
 * error name, SQLSTATE code, and message. Production deployments should
 * replace with a structured logger that explicitly allowlists fields.
 */
export function logError(context: string, error: unknown): void {
  if (error instanceof Error) {
    const errObj = error as Error & { code?: string; severity?: string };
    const code = errObj.code ?? "unknown";
    const severity = errObj.severity ?? "";
    console.error(
      `${context}: [${error.name}] ${severity}${severity ? " " : ""}(${code}) ${error.message}`,
    );
    return;
  }
  console.error(`${context}: [${typeof error}] (non-Error value)`);
}
