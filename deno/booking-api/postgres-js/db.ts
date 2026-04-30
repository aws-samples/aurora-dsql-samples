// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Database Client Module for Aurora DSQL (postgres.js via connector)
 *
 * Creates a pooled `sql` client backed by the
 * [Aurora DSQL Connector for Postgres.js](https://github.com/awslabs/aurora-dsql-connectors/tree/main/node/postgres-js).
 * The connector handles IAM token generation, token refresh, SSL/TLS, and
 * region auto-discovery. This module only concerns itself with wiring the
 * connector's options to our app configuration.
 *
 * The pool survives process lifetime; each HTTP request acquires a
 * connection from the pool for the duration of its query (or transaction)
 * and returns it automatically. This is more efficient than per-request
 * connections — token generation happens on pool refresh, not per request —
 * and works cleanly on serverless platforms that reuse warm processes
 * (e.g., Deno Deploy).
 *
 * @module db
 */

import { auroraDSQLPostgres } from "@aws/aurora-dsql-postgresjs-connector";

/**
 * The shape returned by `auroraDSQLPostgres(...)` — a tagged-template `sql`
 * function with postgres.js query helpers attached.
 */
export type Sql = ReturnType<typeof auroraDSQLPostgres>;

/**
 * Configuration for creating a DSQL-backed pooled client.
 *
 * @property endpoint - Aurora DSQL cluster hostname
 * @property user - PostgreSQL user; `"admin"` triggers admin-token auth
 * @property region - Optional AWS region; auto-discovered from the endpoint
 *   if omitted
 * @property max - Maximum pool size (default 10)
 * @property idleTimeoutSec - Idle connection timeout in seconds (default 30)
 * @property connectTimeoutSec - Connection timeout in seconds (default 10)
 */
export interface ClientOptions {
  endpoint: string;
  user: string;
  region?: string;
  max?: number;
  idleTimeoutSec?: number;
  connectTimeoutSec?: number;
}

/**
 * Creates a pooled postgres.js client for Aurora DSQL.
 *
 * The returned `sql` is a tagged-template function; use it for queries
 * (`sql\`SELECT ...\``) and transactions (`sql.begin(async (sql) => { ... })`).
 * Call `sql.end()` on process shutdown to drain pending queries.
 *
 * The connector maps postgres.js users to IAM token types:
 *   - `"admin"` → admin IAM token (full privileges)
 *   - anything else → regular IAM token (restricted database role)
 */
export function createClient(options: ClientOptions): Sql {
  return auroraDSQLPostgres({
    host: options.endpoint,
    user: options.user,
    region: options.region,
    max: options.max ?? 10,
    idle_timeout: options.idleTimeoutSec ?? 30,
    connect_timeout: options.connectTimeoutSec ?? 10,
  });
}
