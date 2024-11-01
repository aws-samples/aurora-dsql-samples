import { generateToken } from './token-gen.js';
import { postgres } from 'postgres'

async function getClient(clusterEndpoint, region) {
    const action = "DbConnectSuperuser";
    const expiresIn = 3600;
    let token;
    try {
        token = await generateToken(clusterEndpoint, action, region, expiresIn);
        const sql = postgres({
            host: hostname,
            user: "axdb_superuser",
            password: token,
            database: "postgres",
            port: 5432,
            ssl: "require",
          });
        return sql
    } catch (error) {
        throw error;
    }
}

export { getClient }