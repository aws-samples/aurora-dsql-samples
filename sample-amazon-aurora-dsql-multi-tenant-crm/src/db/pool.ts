import { AuroraDSQLPool } from "@aws/aurora-dsql-node-postgres-connector";

/**
 * Shared Aurora DSQL connection pool.
 *
 * The Aurora DSQL connector wraps node-postgres and generates a short-lived
 * IAM authentication token for every physical connection -- there is no
 * database password anywhere in the app. The AWS Region is parsed out of the
 * cluster hostname automatically.
 *
 * `maxLifetimeSeconds` is set below the 1-hour Aurora DSQL connection cap so
 * the pool proactively recycles connections and a request never lands on a
 * connection the cluster is about to close.
 */
const endpoint = process.env.DSQL_ENDPOINT;
if (!endpoint) {
  throw new Error("DSQL_ENDPOINT environment variable is required");
}

export const pool = new AuroraDSQLPool({
  host: endpoint,
  // Non-admin, least-privilege runtime role. Created once as `admin` in
  // scripts/setup-db.sh. Use `admin` only for one-off setup/migrations.
  user: process.env.DSQL_USER ?? "app_runtime",
  database: process.env.DSQL_DATABASE ?? "postgres",
  max: Number(process.env.DSQL_POOL_MAX ?? 10),
  idleTimeoutMillis: 300_000,
  // 55 minutes: retire connections before the 1-hour DSQL cap.
  maxLifetimeSeconds: 3300,
  // OCC retry policy applied by pool.transaction() on SQLSTATE 40001.
  retry: {
    maxRetries: Number(process.env.OCC_MAX_RETRIES ?? 5),
    baseDelayMs: 25,
  },
});

/**
 * node-postgres emits 'error' on the pool when an IDLE connection fails, for
 * example when Aurora DSQL closes one that has reached its lifetime cap or a
 * network path drops. That event has no associated query to reject, so without
 * a listener Node treats it as an unhandled 'error' event and terminates the
 * process. Logging it is enough: the pool discards the bad connection and
 * opens a fresh one on the next checkout.
 */
pool.on("error", (err: Error) => {
  console.error("Idle database connection error (pool will recover):", err.message);
});

export async function closePool(): Promise<void> {
  await pool.end();
}
