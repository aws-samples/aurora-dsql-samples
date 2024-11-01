import pg from 'pg';
import { generateToken } from './token-gen.js';
const { Client } = pg;

async function getClient(clusterEndpoint, region) {
    const action = "DbConnectSuperuser";
    const expiresIn = 3600;
    let token;
    try {
        token = await generateToken(clusterEndpoint, action, region, expiresIn);
        const client = new Client({
            host: clusterEndpoint,
            user: "axdb_superuser",
            password: token,
            database: "postgres",
            port: 5432,
            ssl: true,
        });
        await client.connect();
        return Promise.resolve(client);
    } catch (error) {
        return Promise.resolve(error);
    }
}

export { getClient }
