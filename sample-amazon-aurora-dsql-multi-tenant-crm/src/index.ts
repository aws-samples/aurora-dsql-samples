import express from "express";
import { router } from "./routes/index.js";
import { errorHandler } from "./middleware/error.js";
import { closePool } from "./db/pool.js";

const app = express();
// Bound the request body. body-parser raises a 413 above this, which the error
// handler passes through rather than reporting as a server fault.
app.use(express.json({ limit: "100kb" }));
app.use(router);
app.use(errorHandler);

const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () => {
  console.log(`multi-tenant CRM listening on port ${port}`);
});

// Graceful shutdown so ECS/Fargate task stops cleanly and the pool drains.
async function shutdown(signal: string): Promise<void> {
  console.log(`received ${signal}, shutting down`);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

export { app };
