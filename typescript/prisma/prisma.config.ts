import * as path from "node:path";
import { defineConfig } from "prisma/config";
import { DsqlSigner } from "@aws-sdk/dsql-signer";

async function extractRegionFromEndpoint(endpoint: string): Promise<string> {
    const match = endpoint.match(
        /^[a-z0-9]+\.dsql(?:-[^.]+)?\.([a-z0-9-]+)\.on\.aws$/,
    );
    if (!match) {
        throw new Error(`Unknown DSQL endpoint format: ${endpoint}`);
    }
    return match[1];
}

async function getDatabaseUrl(): Promise<string> {
    const endpoint = process.env.CLUSTER_ENDPOINT;
    if (!endpoint) {
        throw new Error("CLUSTER_ENDPOINT environment variable is required");
    }

    const user = process.env.CLUSTER_USER ?? "admin";
    const region =
        process.env.AWS_REGION ?? (await extractRegionFromEndpoint(endpoint));
    const schema = user === "admin" ? "public" : "myschema";

    const signer = new DsqlSigner({ hostname: endpoint, region });
    const token =
        user === "admin"
            ? await signer.getDbConnectAdminAuthToken()
            : await signer.getDbConnectAuthToken();
    const encodedToken = encodeURIComponent(token);

    return `postgresql://${user}:${encodedToken}@${endpoint}:5432/postgres?sslmode=verify-full&schema=${schema}`;
}

export default defineConfig({
    schema: path.join(__dirname, "prisma", "veterinary-schema.prisma"),
    migrations: {
        path: path.join(__dirname, "prisma", "migrations"),
    },
    datasource: {
        url: await getDatabaseUrl(),
    },
});
