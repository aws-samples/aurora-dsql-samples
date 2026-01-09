/**
 * Aurora DSQL Prisma client with automatic IAM authentication.
 *
 * Uses the Aurora DSQL Connector for connection pooling and token management.
 */
import { PrismaClient } from "@generated/prisma-vet/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { AuroraDSQLPool } from "@aws/aurora-dsql-node-postgres-connector";
import { getRequiredEnv } from "./utils";

const ADMIN = "admin";
const ADMIN_SCHEMA = "public";
const NON_ADMIN_SCHEMA = "myschema";

export class DsqlPrismaClient extends PrismaClient {
    private readonly pool: AuroraDSQLPool;

    constructor() {
        const host = getRequiredEnv("CLUSTER_ENDPOINT");
        const user = getRequiredEnv("CLUSTER_USER");
        const schema = user === ADMIN ? ADMIN_SCHEMA : NON_ADMIN_SCHEMA;

        const pool = new AuroraDSQLPool({
            host,
            user,
            application_name: "prisma",
            // Set search_path on connection to ensure proper schema access in DSQL
            options: `-c search_path=${schema}`,
        });

        const adapter = new PrismaPg(pool, { schema });

        super({
            adapter,
            log: ["query", "info", "warn", "error"],
        });

        this.pool = pool;
    }

    public async dispose(): Promise<void> {
        await this.$disconnect();
        await this.pool.end();
    }
}
