// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Property-based tests for time range overlap detection.
 *
 * The booking API detects overlapping reservations using the SQL condition:
 *   `start_time < new_end_time AND end_time > new_start_time`
 *
 * This is equivalent to the pure function:
 *   `timeRangesOverlap(s1, e1, s2, e2) = s1 < e2 && s2 < e1`
 *
 * Since the overlap logic is embedded in SQL queries (not a standalone
 * function), we extract and test the equivalent pure logic here to verify
 * the mathematical properties: symmetry and correctness.
 *
 * @module overlap.property.test
 */

import fc from "fast-check";
import { assertEquals } from "@std/assert";

// ---------------------------------------------------------------------------
// Pure overlap function (mirrors the SQL logic in handlers.ts)
// ---------------------------------------------------------------------------

/**
 * Determines whether two time ranges overlap.
 *
 * This mirrors the SQL overlap detection used in the booking handlers:
 *   `WHERE start_time < $new_end AND end_time > $new_start`
 *
 * Two ranges [s1, e1) and [s2, e2) overlap iff s1 < e2 AND s2 < e1.
 *
 * @param start1 - Start of the first range (epoch ms)
 * @param end1 - End of the first range (epoch ms)
 * @param start2 - Start of the second range (epoch ms)
 * @param end2 - End of the second range (epoch ms)
 * @returns true if the ranges overlap
 */
export function timeRangesOverlap(
  start1: number,
  end1: number,
  start2: number,
  end2: number,
): boolean {
  return start1 < end2 && start2 < end1;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Generates a valid time range where end > start.
 * Uses epoch milliseconds for simplicity.
 */
const timeRangeArb = fc
  .tuple(
    fc.integer({ min: 0, max: 1_000_000_000 }),
    fc.integer({ min: 1, max: 1_000_000_000 }),
  )
  .map(([start, duration]) => ({
    start,
    end: start + duration,
  }));

// ---------------------------------------------------------------------------
// Property 2: Time range overlap detection
// ---------------------------------------------------------------------------

/**
 * Feature: deno-aurora-dsql-samples, Property 2: Time range overlap detection
 *
 * For any two time ranges where end > start, overlap returns true iff
 * start1 < end2 AND start2 < end1. Symmetric: overlaps(a, b) === overlaps(b, a).
 *
 * **Validates: Requirements 5.5, 6.5**
 */
Deno.test("property: overlap detection is symmetric", () => {
  fc.assert(
    fc.property(timeRangeArb, timeRangeArb, (a, b) => {
      const ab = timeRangesOverlap(a.start, a.end, b.start, b.end);
      const ba = timeRangesOverlap(b.start, b.end, a.start, a.end);
      assertEquals(ab, ba);
    }),
    { numRuns: 200 },
  );
});

Deno.test("property: non-overlapping ranges return false", () => {
  fc.assert(
    fc.property(
      timeRangeArb,
      fc.integer({ min: 1, max: 1_000_000 }),
      fc.integer({ min: 1, max: 1_000_000_000 }),
      (a, gap, duration) => {
        // Place range B entirely after range A with a gap
        const b = { start: a.end + gap, end: a.end + gap + duration };
        assertEquals(timeRangesOverlap(a.start, a.end, b.start, b.end), false);
        // Symmetry: also false in reverse
        assertEquals(timeRangesOverlap(b.start, b.end, a.start, a.end), false);
      },
    ),
    { numRuns: 200 },
  );
});

Deno.test("property: overlapping ranges return true when one contains the other", () => {
  fc.assert(
    fc.property(
      timeRangeArb,
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      (outer, frac1, frac2) => {
        // Create an inner range contained within the outer range using fractions
        const span = outer.end - outer.start;
        if (span < 2) return; // Need room for a sub-range

        const a = outer.start + Math.floor(frac1 * (span - 1));
        const b = outer.start + Math.floor(frac2 * (span - 1)) + 1;
        const innerStart = Math.min(a, b);
        const innerEnd = Math.max(a, b);

        if (innerStart < innerEnd && innerStart >= outer.start && innerEnd <= outer.end) {
          assertEquals(
            timeRangesOverlap(outer.start, outer.end, innerStart, innerEnd),
            true,
          );
        }
      },
    ),
    { numRuns: 200 },
  );
});

Deno.test("property: overlap matches the formula start1 < end2 AND start2 < end1", () => {
  fc.assert(
    fc.property(timeRangeArb, timeRangeArb, (a, b) => {
      const expected = a.start < b.end && b.start < a.end;
      const actual = timeRangesOverlap(a.start, a.end, b.start, b.end);
      assertEquals(actual, expected);
    }),
    { numRuns: 200 },
  );
});
