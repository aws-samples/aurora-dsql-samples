import { DsqlPrismaClient } from "../src/dsql-client";
import { MILLIS_IN_SECOND } from "../src/utils";

jest.setTimeout(60000);

/**
 * Wait long enough for the provided time to expire.
 *
 * @param expirySeconds The number of seconds that the target takes to expire.
 */
function waitForExpiry(expirySeconds: number): Promise<void> {
    const waitTime = 2 * expirySeconds * MILLIS_IN_SECOND;
    console.log(
        "Waiting for %d seconds to exceed expiry time...",
        expirySeconds,
    );
    return new Promise((resolve) => setTimeout(resolve, waitTime));
}

/**
 * Get the unique ID associated with the current connection.
 */
async function getCurrentSessionId(client: DsqlPrismaClient): Promise<string> {
    const result = await client.$queryRaw<[{ current_session_id: string }]>`
        SELECT sys.current_session_id()
    `;

    const sessionId = result[0].current_session_id;
    console.log(`Current session id: ${sessionId}`);

    return sessionId;
}

describe("DSQL Prisma client", () => {
    test("pool connection works", async () => {
        const client = new DsqlPrismaClient();

        const result = await client.$queryRaw`SELECT 1 as test`;
        expect(result).toEqual([{ test: 1 }]);

        await client.dispose();
    });

    test("connection concurrency with multiple sessions", async () => {
        const numConnections = 10;
        const client = new DsqlPrismaClient({
            max: numConnections,
        });

        const promises = Array.from({ length: numConnections }, async () => {
            const result = await client.$queryRaw<
                [{ current_session_id: string }]
            >`
                SELECT sys.current_session_id()
                FROM pg_sleep(5)
            `;
            return result[0].current_session_id;
        });

        const sessionIds = await Promise.all(promises);
        const uniqueSessionIds = new Set(sessionIds);
        expect(uniqueSessionIds.size).toBe(numConnections);

        await client.dispose();
    });

    test("new connection created after pool expiry", async () => {
        const connectionExpirySecs = 2;
        const client = new DsqlPrismaClient({
            min: 1,
            max: 1,
            maxLifetimeSeconds: connectionExpirySecs,
        });

        const sessionIdBefore = await getCurrentSessionId(client);
        await waitForExpiry(connectionExpirySecs);
        const sessionIdAfter = await getCurrentSessionId(client);

        expect(sessionIdBefore).not.toBe(sessionIdAfter);

        await client.dispose();
    });

    test("established connection still usable after token expiry", async () => {
        const tokenExpirySecs = 2;
        const client = new DsqlPrismaClient(
            {
                min: 1,
                max: 1,
            },
            tokenExpirySecs,
        );

        const sessionIdBefore = await getCurrentSessionId(client);
        await waitForExpiry(tokenExpirySecs);
        const sessionIdAfter = await getCurrentSessionId(client);

        expect(sessionIdBefore).toBe(sessionIdAfter);

        await client.dispose();
    });

    test("lazy connection usable after initial inactivity", async () => {
        const tokenExpirySecs = 2;
        const client = new DsqlPrismaClient(
            {
                min: 0,
                max: 1,
            },
            tokenExpirySecs,
        );

        await waitForExpiry(tokenExpirySecs);
        const sessionId = await getCurrentSessionId(client);
        expect(sessionId).toBeDefined();

        await client.dispose();
    });
});
