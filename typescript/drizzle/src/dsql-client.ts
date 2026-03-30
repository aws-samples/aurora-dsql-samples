/**
 * Aurora DSQL Drizzle client with automatic IAM authentication.
 *
 * Uses the Aurora DSQL Connector for connection pooling and token management.
 */
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { AuroraDSQLPool } from "@aws/aurora-dsql-node-postgres-connector";
import { getRequiredEnv } from "./utils";
import * as schema from "./schema";

const ADMIN = "admin";
const ADMIN_SCHEMA = "public";
const NON_ADMIN_SCHEMA = "myschema";

export type DsqlDatabase = NodePgDatabase<typeof schema>;

export function createDsqlClient(): {
    db: DsqlDatabase;
    pool: AuroraDSQLPool;
} {
    const host = getRequiredEnv("CLUSTER_ENDPOINT");
    const user = getRequiredEnv("CLUSTER_USER");
    const searchPath = user === ADMIN ? ADMIN_SCHEMA : NON_ADMIN_SCHEMA;

    const pool = new AuroraDSQLPool({
        host,
        user,
        // Set search_path on connection to ensure proper schema access in DSQL
        options: `-c search_path=${searchPath}`,
    });

    const db = drizzle({ client: pool, schema });

    return { db, pool };
}
