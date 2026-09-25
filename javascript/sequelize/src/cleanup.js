/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */

import { createSequelizeInstance } from './db.js';
import { defineModels } from './models.js';

async function main() {
  console.log('Connecting to Aurora DSQL...');
  const sequelize = createSequelizeInstance();
  await sequelize.authenticate();

  const { Guest, Room, Reservation, Payment } = defineModels(sequelize);

  console.log('Cleaning up data...');
  // Delete in child-to-parent order. With foreign keys and the default NO ACTION
  // behavior, deleting a parent row that still has referencing children fails, so
  // payments and reservations must be removed before rooms and guests.
  await Payment.destroy({ where: {} });
  await Reservation.destroy({ where: {} });
  await Room.destroy({ where: {} });
  await Guest.destroy({ where: {} });

  console.log('✓ All data removed.');
  await sequelize.close();
}

main().catch((err) => {
  console.error('Cleanup error:', err.message);
  process.exit(1);
});
