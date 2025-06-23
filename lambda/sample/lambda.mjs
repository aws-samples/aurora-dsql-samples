import {DsqlSigner} from "@aws-sdk/dsql-signer";
import {Pool} from "pg";

let pool;

async function dsql_sample(clusterEndpoint, region) {
    await initPool(clusterEndpoint, region)
    await createTable(pool);
    for (let i = 0; i < 10; i++) {
        await insertAndReadData(pool);
    }
    await dropTable(pool)
}

async function initPool(endpoint, region) {
    if (pool === undefined) {
        console.log("Creating connection pool.")
        const signer = new DsqlSigner({
            hostname: endpoint,
            region,
        });
        // <https://node-postgres.com/apis/client>
        // By default `rejectUnauthorized` is true in TLS options
        // <https://nodejs.org/api/tls.html#tls_tls_connect_options_callback>
        // The config does not offer any specific parameter to set sslmode to verify-full
        // Settings are controlled either via connection string or by setting
        // rejectUnauthorized to false in ssl options
        pool = new Pool({
            host: endpoint,
            port: 5432,
            database: "postgres",
            user: "admin",
            password: async function () {
                return await signer.getDbConnectAdminAuthToken()
            },
            ssl: true,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });
    }
}

async function createTable(pool) {
    let client;
    try {
        client = await getClientFromPool(pool);
        // Create a new table
        let start = Date.now();
        await client.query(`CREATE TABLE IF NOT EXISTS sample (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              val INTEGER NOT NULL
            )`);
        console.log(`Created table Sample - Time elapsed: ${Date.now() - start} ms`);
    } finally {
        if (client !== undefined) client.release();
    }
}

async function dropTable(pool) {
    let client;
    try {
        client = await getClientFromPool(pool);
        let start = Date.now();
        await client.query(`DROP TABLE IF EXISTS sample`);
        console.log(`Dropped table Sample - Time elapsed: ${Date.now() - start} ms`);
    } finally {
        if (client !== undefined) client.release();
    }
}

async function insertAndReadData(pool) {
    let client;
    try {
        let val = Math.floor(Math.random() * 1000000);
        client = await getClientFromPool(pool);
        let start = Date.now();
        await client.query("INSERT INTO sample(val) VALUES($1)", [val]);
        console.log(`Inserted data to Sample - Time elapsed: ${Date.now() - start} ms`);

        // Check that data is inserted by reading it back
        start = Date.now();
        const result = await client.query("SELECT id, val FROM sample WHERE val = $1", [val]);
        console.log(`Retrieved row: ID=${result.rows[0].id}, Val=${result.rows[0].val}`);
        console.log(`Retrieved row from Sample - Time elapsed: ${Date.now() - start} ms`);
    } finally {
        if (client !== undefined) client.release();
    }
}

async function getClientFromPool(pool) {
    let start = Date.now();
    const client = await pool.connect();
    console.log(`Retrieved DSQL connection - Time elapsed: ${Date.now() - start} ms`);
    return client;
}

// https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html
export const handler = async (event) => {
    const endpoint = process.env.CLUSTER_ENDPOINT
    const region = process.env.CLUSTER_REGION
    const responseCode = await dsql_sample(endpoint, region);

    const response = {
        statusCode: responseCode,
        endpoint: endpoint,
    };
    return response;
};
