import { generateToken } from "./token-gen.js";
import postgres from "postgres"

async function getClient(clusterEndpoint, region) {
    const action = "DbConnectSuperuser";
    const expiresIn = 3600;
    let token;
    try {
        token = await generateToken(clusterEndpoint, action, region, expiresIn);
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
