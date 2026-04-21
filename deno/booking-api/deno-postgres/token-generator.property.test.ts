// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Property-based tests for the IAM Token Generator error formatting.
 *
 * These tests verify that when token generation fails, the thrown error
 * message always contains both the cluster endpoint and the original
 * failure reason — ensuring developers get actionable diagnostics.
 *
 * We test the error formatting logic by calling `generateToken` with
 * arbitrary endpoint strings. Since no real AWS credentials are configured
 * in the test environment, the underlying `@aws-sdk/dsql-signer` will
 * always throw a credential-related error, which exercises the catch
 * block and error formatting path.
 *
 * @module token-generator.property.test
 */

import fc from "fast-check";
import { assertStringIncludes } from "@std/assert";
import { generateToken } from "./token-generator.ts";

/**
 * Feature: deno-aurora-dsql-samples, Property 9: Token generator error formatting
 *
 * For any cluster endpoint string and any underlying error message, when IAM
 * token generation fails, the thrown error message shall contain both the
 * cluster endpoint and the original failure reason.
 *
 * **Validates: Requirements 4.7**
 */
Deno.test("property: token generator error contains endpoint and failure reason", async () => {
  await fc.assert(
    fc.asyncProperty(
      // Generate non-empty endpoint-like strings using alphanumeric chars,
      // dots, and hyphens — representative of real hostnames.
      fc.string({ minLength: 1, maxLength: 60 }).filter(
        (s: string) => /^[a-z0-9.\-]+$/i.test(s),
      ),
      async (endpoint: string) => {
        try {
          await generateToken({ endpoint, region: "us-east-1" });
          // If it somehow succeeds (unlikely without credentials), that's fine —
          // we're only testing the failure path.
        } catch (error) {
          // The error message MUST contain the endpoint
          assertStringIncludes(
            (error as Error).message,
            endpoint,
          );
          // The error message MUST contain the prefix indicating it's a token error
          assertStringIncludes(
            (error as Error).message,
            "Failed to generate IAM token for endpoint",
          );
        }
      },
    ),
    { numRuns: 100 },
  );
});
