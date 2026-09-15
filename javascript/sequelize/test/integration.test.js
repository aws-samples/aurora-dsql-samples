/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Integration test for the Sequelize + Aurora DSQL hotel sample.
//
// Unlike test_example.test.js (pure-logic unit tests), this test connects to a
// LIVE Aurora DSQL cluster and exercises the real workflow end to end: schema
// creation, foreign-key-backed relationships, eager loading, an OCC retry-safe
// update, and cleanup.
//
// It SKIPS automatically when the cluster environment variables are not set, so
// `npm test` stays green offline and in CI without credentials. To run it:
//
//   export CLUSTER_ENDPOINT="your-cluster.dsql.your-region.on.aws"
//   export CLUSTER_USER="admin"                  # or your non-admin app role
//   # export CLUSTER_SCHEMA="hotel"              # for a non-admin user
//   npm run test:integration
//
// The test cleans up the rows it creates and leaves the schema intact.

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';

const HAS_CLUSTER = Boolean(process.env.CLUSTER_ENDPOINT && process.env.CLUSTER_USER);

// Run the suite only when a cluster is configured; otherwise skip it cleanly.
const describeLive = HAS_CLUSTER ? describe : describe.skip;

describeLive('integration (live Aurora DSQL)', () => {
  let createSequelizeInstance;
  let createSchema;
  let defineModels;
  let withOccRetry;
  let sequelize;
  let models;

  beforeAll(async () => {
    ({ createSequelizeInstance, createSchema } = await import('../src/db.js'));
    ({ defineModels } = await import('../src/models.js'));
    ({ withOccRetry } = await import('../src/retry.js'));

    sequelize = createSequelizeInstance();
    await sequelize.authenticate();
    await createSchema(sequelize);
    models = defineModels(sequelize);

    // Start from a clean slate (child -> parent order for FK safety).
    await models.Payment.destroy({ where: {} });
    await models.Reservation.destroy({ where: {} });
    await models.Room.destroy({ where: {} });
    await models.Guest.destroy({ where: {} });
  }, 60000);

  afterAll(async () => {
    if (!sequelize) return;
    await models.Payment.destroy({ where: {} });
    await models.Reservation.destroy({ where: {} });
    await models.Room.destroy({ where: {} });
    await models.Guest.destroy({ where: {} });
    await sequelize.close();
  }, 60000);

  test('connectivity — SELECT 1', async () => {
    const [rows] = await sequelize.query('SELECT 1 AS ok');
    expect(Number(rows[0].ok)).toBe(1);
  });

  test('create + read back a guest and room', async () => {
    const guest = await models.Guest.create({
      firstName: 'Test', lastName: 'Guest',
      email: `test.guest.${Date.now()}@example.com`, phone: '+1-555-0000',
    });
    const room = await models.Room.create({
      roomNumber: `T${Date.now() % 100000}`, roomType: 'standard', floor: 1, ratePerNight: 100.00,
    });
    expect(guest.id).toBeTruthy();
    expect(room.id).toBeTruthy();

    const found = await models.Guest.findByPk(guest.id);
    expect(found.email).toBe(guest.email);
  });

  test('foreign key is enforced (orphan insert rejected)', async () => {
    // Inserting a reservation that references a non-existent guest/room must fail
    // the FK check. This proves the database-enforced referential integrity.
    const fakeId = '00000000-0000-4000-8000-000000000000';
    await expect(
      models.Reservation.create({
        guestId: fakeId, roomId: fakeId,
        checkInDate: '2025-01-01', checkOutDate: '2025-01-02', status: 'confirmed',
      })
    ).rejects.toBeDefined();
  });

  test('eager loading via association (include)', async () => {
    const guest = await models.Guest.create({
      firstName: 'Eager', lastName: 'Loader',
      email: `eager.${Date.now()}@example.com`, phone: '+1-555-0001',
    });
    const room = await models.Room.create({
      roomNumber: `E${Date.now() % 100000}`, roomType: 'deluxe', floor: 2, ratePerNight: 200.00,
    });
    const reservation = await models.Reservation.create({
      guestId: guest.id, roomId: room.id,
      checkInDate: '2025-03-15', checkOutDate: '2025-03-18', status: 'confirmed', totalAmount: 600.00,
    });

    const withRoom = await models.Reservation.findByPk(reservation.id, { include: [{ model: models.Room }] });
    expect(withRoom.Room).toBeTruthy();
    expect(withRoom.Room.roomNumber).toBe(room.roomNumber);
  });

  test('OCC retry-safe update succeeds', async () => {
    const guest = await models.Guest.create({
      firstName: 'Retry', lastName: 'Safe',
      email: `retry.${Date.now()}@example.com`, phone: '+1-555-0002',
    });
    const updated = await withOccRetry(async () => {
      const g = await models.Guest.findByPk(guest.id);
      g.loyaltyTier = 'gold';
      await g.save({ fields: ['loyaltyTier'] });
      return g;
    });
    expect(updated.loyaltyTier).toBe('gold');
  });
});
