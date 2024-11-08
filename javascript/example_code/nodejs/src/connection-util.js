import pg from "pg";
import { generateToken } from "./token-gen.js";
const { Client } = pg;

async function getClient(clusterEndpoint, region) {
    const action = "DbConnectSuperuser";
    let token;
    try {
        // The token expiration time is optional, and the default value 900 seconds
        token = await generateToken(clusterEndpoint, action, region);
        const client = new Client({
            host: clusterEndpoint,
            user: "admin",
            password: token,
            database: "postgres",
            port: 5432,
            ssl: {
                require: true,
                rejectUnauthorized: false
            }
        });
        await client.connect();
        return Promise.resolve(client);
    } catch (error) {
        return Promise.reject(error);
    }
}

export { getClient }
