import { createApp } from "./app.js";
import { closePool } from "./db/pool.js";

const app = createApp();

const port = Number(process.env.PORT ?? 3000);

/**
 * Bind to loopback by default so `npm run dev` does not put the API on your
 * local network. Inside a container the listener has to accept the container
 * network for the ECS Express Gateway to reach it, so the Dockerfile sets
 * HOST=0.0.0.0 explicitly. Keep the default here loopback: the container opts
 * in, local development does not opt out.
 */
const host = process.env.HOST ?? "127.0.0.1";

const server = app.listen(port, host, () => {
  console.log(`multi-tenant CRM listening on ${host}:${port}`);
});

// Graceful shutdown so the ECS/Fargate task stops cleanly and the pool drains.
async function shutdown(signal: string): Promise<void> {
  console.log(`received ${signal}, shutting down`);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
