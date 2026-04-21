// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Property-based tests for malformed JSON rejection.
 *
 * Verifies that for any string that is not valid JSON, sending it as the
 * body of a POST /bookings or PUT /bookings/:id request results in an
 * HTTP 400 response with a descriptive error in the JSON body.
 *
 * This tests the validation layer in the handlers — the JSON parsing
 * happens before any database interaction, so no DB mocking is needed.
 *
 * @module validation.property.test
 */

import fc from "fast-check";
import { assertEquals, assertStringIncludes } from "@std/assert";
import { handleRequest } from "./handlers.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CTX = { endpoint: "test.dsql.us-east-1.on.aws", user: "admin" };

/**
 * Generates strings that are NOT valid JSON.
 *
 * Filters out any string that happens to be valid JSON (e.g., "null",
 * "true", "123", quoted strings, etc.).
 */
const nonJsonStringArb = fc
  .oneof(
    // Random strings that are very unlikely to be valid JSON
    fc.string({ minLength: 1, maxLength: 100 }).filter((s) => {
      try {
        JSON.parse(s);
        return false; // It's valid JSON — exclude it
      } catch {
        return true; // Not valid JSON — include it
      }
    }),
    // Explicitly malformed patterns
    fc.constant("{invalid"),
    fc.constant("not json at all"),
    fc.constant("{\"key\": }"),
    fc.constant("[1, 2,]"),
    fc.constant("{'single': 'quotes'}"),
  );

// ---------------------------------------------------------------------------
// Property 4: Malformed JSON rejection
// ---------------------------------------------------------------------------

/**
 * Feature: deno-aurora-dsql-samples, Property 4: Malformed JSON rejection
 *
 * For any string that is not valid JSON, sending it as body of
 * POST /bookings or PUT /bookings/:id results in HTTP 400 with a
 * descriptive error in the JSON body.
 *
 * **Validates: Requirements 7.6**
 */
Deno.test("property: POST /bookings rejects malformed JSON with 400", async () => {
  await fc.assert(
    fc.asyncProperty(nonJsonStringArb, async (badBody) => {
      const req = new Request("http://localhost:8000/bookings", {
        method: "POST",
        body: badBody,
        headers: { "Content-Type": "application/json" },
      });

      const res = await handleRequest(req, CTX);
      assertEquals(res.status, 400);

      const body = await res.json();
      assertStringIncludes(body.error, "Invalid JSON");
    }),
    { numRuns: 100 },
  );
});

Deno.test("property: PUT /bookings/:id rejects malformed JSON with 400", async () => {
  await fc.assert(
    fc.asyncProperty(nonJsonStringArb, async (badBody) => {
      const req = new Request("http://localhost:8000/bookings/test-id-123", {
        method: "PUT",
        body: badBody,
        headers: { "Content-Type": "application/json" },
      });

      const res = await handleRequest(req, CTX);
      assertEquals(res.status, 400);

      const body = await res.json();
      assertStringIncludes(body.error, "Invalid JSON");
    }),
    { numRuns: 100 },
  );
});
