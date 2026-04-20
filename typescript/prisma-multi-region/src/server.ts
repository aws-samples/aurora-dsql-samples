// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import express, { Request, Response } from "express";
import { MultiRegionDsqlClient } from "./dsql-client";
import { healthCheck } from "./health";

const app = express();
app.use(express.json());

const dsql = new MultiRegionDsqlClient();

/**
 * Execute a database operation with automatic failover to the secondary region.
 * Note: Error detection is simplified for this sample. Production apps should
 * implement more robust circuit-breaker patterns.
 */
async function withFailover<T>(operation: (client: Awaited<ReturnType<typeof dsql.getClient>>) => Promise<T>): Promise<T> {
  try {
    return await operation(await dsql.getClient());
  } catch (err: any) {
    if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT" || err.message?.includes("unavailable")) {
      console.warn("Primary failed, attempting failover...");
      const fallback = await dsql.failover();
      return await operation(fallback);
    }
    throw err;
  }
}

// Health check
app.get("/health", async (_req: Request, res: Response) => {
  const health = await healthCheck(dsql);
  res.status(health.status === "healthy" ? 200 : 503).json(health);
});

// List orders
app.get("/orders", async (_req: Request, res: Response) => {
  try {
    const orders = await withFailover((client) =>
      client.order.findMany({
        include: { items: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    );
    res.json(orders);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create order
app.post("/orders", async (req: Request, res: Response) => {
  try {
    const { product, quantity, items } = req.body;

    if (!product || typeof product !== "string") {
      res.status(400).json({ error: "product is required and must be a string" });
      return;
    }
    if (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 1)) {
      res.status(400).json({ error: "quantity must be a positive integer" });
      return;
    }
    if (items !== undefined && !Array.isArray(items)) {
      res.status(400).json({ error: "items must be an array" });
      return;
    }

    const order = await withFailover((client) =>
      client.order.create({
        data: {
          product,
          quantity: quantity || 1,
          region: process.env.AWS_REGION || "unknown",
          items: items?.length
            ? { create: items.map((i: { name: string; price: number }) => ({ name: String(i.name), price: Number(i.price) })) }
            : undefined,
        },
        include: { items: true },
      }),
    );

    res.status(201).json(order);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get order by ID
app.get("/orders/:id", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const order = await withFailover((client) =>
      client.order.findUnique({
        where: { id: req.params.id },
        include: { items: true },
      }),
    );

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json(order);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;

async function main() {
  await dsql.connect();
  console.log(`Connected to DSQL (${dsql.getRegionInfo().localRegion})`);

  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  const shutdown = async () => {
    console.log("Shutting down...");
    server.close();
    await dsql.dispose();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
