import { DsqlSigner } from "@aws-sdk/dsql-signer";
import { PrismaClient } from "@generated/prisma-vet/client";
import { getRequiredEnv, MILLIS_IN_SECOND, SECONDS_IN_MINUTE } from "./utils";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool, PoolConfig } from "pg";

const ADMIN = "admin";
const ADMIN_SCHEMA = "public";
const NON_ADMIN_SCHEMA = "myschema";

const DEFAULT_TOKEN_EXPIRY_SECS = 15 * SECONDS_IN_MINUTE;

export class DsqlPrismaClient extends PrismaClient {
    private readonly pool;

    constructor(
        poolConfig?: Partial<PoolConfig>,
        tokenExpirySeconds: number = DEFAULT_TOKEN_EXPIRY_SECS,
    ) {
        const host = getRequiredEnv("CLUSTER_ENDPOINT");
        const region = getRequiredEnv("REGION");
        const user = getRequiredEnv("CLUSTER_USER");

        const pool = new Pool({
            host: host,
            user: user,
            database: "postgres",
            port: 5432,
            password: async () => {
                return await this.generatePasswordToken(
                    host,
                    region,
                    user,
                    tokenExpirySeconds,
                );
            },
            ssl: { rejectUnauthorized: true },
            min: 2,
            max: 5,
            connectionTimeoutMillis: 5 * MILLIS_IN_SECOND,
            maxLifetimeSeconds: 20 * SECONDS_IN_MINUTE,
            ...poolConfig,
        });

        const adapter = new PrismaPg(pool, {
            disposeExternalPool: false,
            schema: user === ADMIN ? ADMIN_SCHEMA : NON_ADMIN_SCHEMA,
        });

        super({
            adapter: adapter,
            log: ["query", "info", "warn", "error"],
        });

        this.pool = pool;
    }

    private async generatePasswordToken(
        endpoint: string,
        region: string,
        user: string,
        tokenExpirySeconds: number,
    ): Promise<string> {
        const signer = new DsqlSigner({
            hostname: endpoint,
            region,
            expiresIn: tokenExpirySeconds,
        });
        return user === ADMIN
            ? await signer.getDbConnectAdminAuthToken()
            : await signer.getDbConnectAuthToken();
    }

    public async dispose(): Promise<void> {
        await this.$disconnect();
        await this.pool.end();
    }
}
