// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { MultiRegionDsqlClient } from "../src/dsql-client";

jest.setTimeout(60000);

describe("DSQL Prisma multi-region client", () => {
  let dsql: MultiRegionDsqlClient;

  beforeAll(async () => {
    dsql = new MultiRegionDsqlClient();
    await dsql.connect();
  });

  afterAll(async () => {
    await dsql.dispose();
  });

  test("basic query works", async () => {
    const client = await dsql.getClient();
    const result = await client.$queryRaw`SELECT 1 as test`;
    expect(result).toEqual([{ test: 1 }]);
  });

  test("CRUD operations work on orders", async () => {
    const client = await dsql.getClient();

    // Create
    const order = await client.order.create({
      data: {
        product: "Test Widget",
        quantity: 3,
        region: "test",
      },
    });
    expect(order.id).toBeDefined();
    expect(order.product).toBe("Test Widget");
    expect(order.quantity).toBe(3);
    expect(order.status).toBe("pending");

    // Read
    const found = await client.order.findUnique({
      where: { id: order.id },
    });
    expect(found?.product).toBe("Test Widget");

    // Update
    const updated = await client.order.update({
      where: { id: order.id },
      data: { status: "shipped" },
    });
    expect(updated.status).toBe("shipped");

    // Delete
    await client.order.delete({ where: { id: order.id } });

    // Verify deleted
    const deleted = await client.order.findUnique({
      where: { id: order.id },
    });
    expect(deleted).toBeNull();
  });

  test("order with items (relation) works", async () => {
    const client = await dsql.getClient();

    // Create order with nested items
    const order = await client.order.create({
      data: {
        product: "Bundle",
        quantity: 1,
        region: "test",
        items: {
          create: [
            { name: "Part A", price: 9.99 },
            { name: "Part B", price: 14.5 },
          ],
        },
      },
      include: { items: true },
    });

    expect(order.items).toHaveLength(2);
    expect(order.items.map((i) => i.name).sort()).toEqual(["Part A", "Part B"]);

    // Query with relation
    const fetched = await client.order.findUnique({
      where: { id: order.id },
      include: { items: true },
    });
    expect(fetched?.items).toHaveLength(2);

    // Clean up — delete items first (no FK cascade in DSQL)
    await client.orderItem.deleteMany({ where: { orderId: order.id } });
    await client.order.delete({ where: { id: order.id } });
  });

  test("UUID generation works", async () => {
    const client = await dsql.getClient();

    const order = await client.order.create({
      data: {
        product: "UUID Test",
        quantity: 1,
        region: "test",
      },
    });

    // Verify UUID format (8-4-4-4-12 hex characters)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(order.id).toMatch(uuidRegex);

    await client.order.delete({ where: { id: order.id } });
  });
});
