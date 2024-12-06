import { DsqlSigner } from "@aws-sdk/dsql-signer";
import { Client } from 'pg'
import { clusterEndpoint } from "./cluster-endpoint";

const createMigrationsTable = async () => {

    const region = "us-east-1";

    const signer = new DsqlSigner({
        hostname: clusterEndpoint,
        region: region
    });

    const token = await signer.getDbConnectAdminAuthToken();

    const client = new Client({
        user: "admin",
        password: token,
        host: clusterEndpoint,
        port: 5432,
        database: "postgres",
        ssl: true
    })

    await client.connect();
    await client.query('CREATE TABLE IF NOT EXISTS "migrations" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL , "timestamp" bigint NOT NULL, "name" character varying NOT NULL)');
    await client.end();
}

createMigrationsTable();