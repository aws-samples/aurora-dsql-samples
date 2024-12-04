import { DsqlSigner } from '@aws-sdk/dsql-signer';
import { Client } from 'pg'

const dropMigrationsTable = async () => {

    const clusterEndpoint = process.env.CLUSTER_ENDPOINT!;
    const region = process.env.REGION!;

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
    await client.query('DROP TABLE IF EXISTS migrations');
    await client.end();
}

dropMigrationsTable();