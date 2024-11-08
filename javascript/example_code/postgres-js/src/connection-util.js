import { generateToken } from "./token-gen.js";
import postgres from "postgres"

async function getClient(clusterEndpoint, region) {
    const action = "DbConnectSuperuser";
    let token;
    try {
        // The token expiration time is optional, and the default value 900 seconds
        token = await generateToken(clusterEndpoint, action, region);
        const sql = postgres({
            host: clusterEndpoint,
            user: "admin",
            password: token,
            database: "postgres",
            port: 5432,
            ssl: "require",
          });
        return Promise.resolve(sql)
    } catch (error) {
        return Promise.reject(error);
    }
}

export { getClient }
