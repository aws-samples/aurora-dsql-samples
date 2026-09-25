/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */

import { createSequelizeInstance, createTables } from './db.js';
import { defineModels } from './models.js';
import { withOccRetry } from './retry.js';

async function createGuests(Guest) {
  const guestsData = [
    { firstName: 'Sarah', lastName: 'Mitchell', email: 'sarah.mitchell@example.com', phone: '+1-555-0301' },
    { firstName: 'James', lastName: 'Park', email: 'james.park@example.com', phone: '+1-555-0302' },
    { firstName: 'Maria', lastName: 'Garcia', email: 'maria.garcia@example.com', phone: '+1-555-0303', loyaltyTier: 'gold' },
  ];

  const guests = [];
  for (const data of guestsData) {
    const guest = await Guest.create(data);
    guests.push(guest);
    console.log(`  Created guest: ${guest.firstName} ${guest.lastName} (${guest.loyaltyTier})`);
  }
  return guests;
}

async function createRooms(Room) {
  const roomsData = [
    { roomNumber: '101', roomType: 'standard', floor: 1, ratePerNight: 129.99, maxOccupancy: 2 },
    { roomNumber: '205', roomType: 'deluxe', floor: 2, ratePerNight: 219.99, maxOccupancy: 3 },
    { roomNumber: '301', roomType: 'suite', floor: 3, ratePerNight: 399.99, maxOccupancy: 4 },
    { roomNumber: '401', roomType: 'penthouse', floor: 4, ratePerNight: 799.99, maxOccupancy: 4 },
  ];

  const rooms = [];
  for (const data of roomsData) {
    const room = await Room.create(data);
    rooms.push(room);
    console.log(`  Created room: ${room.roomNumber} (${room.roomType}) - ${room.ratePerNight}/night`);
  }
  return rooms;
}

function calculateNights(checkIn, checkOut) {
  const oneDay = 24 * 60 * 60 * 1000;
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  return Math.round((end - start) / oneDay);
}

async function makeReservation(Reservation, Room, guest, room, checkIn, checkOut, specialRequests) {
  const nights = calculateNights(checkIn, checkOut);
  const totalAmount = (parseFloat(room.ratePerNight) * nights).toFixed(2);

  const reservation = await Reservation.create({
    guestId: guest.id,
    roomId: room.id,
    checkInDate: checkIn,
    checkOutDate: checkOut,
    status: 'confirmed',
    totalAmount,
    specialRequests: specialRequests || null,
  });

  // Mark room as unavailable
  await room.update({ isAvailable: false });

  console.log(`  Reservation created: ${guest.firstName} ${guest.lastName} in Room ${room.roomNumber}`);
  console.log(`    Check-in: ${checkIn} | Check-out: ${checkOut} | ${nights} nights | Total: ${totalAmount}`);

  return reservation;
}

async function checkIn(Reservation, reservation) {
  await reservation.update({ status: 'checked_in' });
  console.log(`  Guest checked in (Reservation: ${reservation.id.substring(0, 8)}...)`);
  return reservation;
}

async function checkOut(Reservation, Room, reservation) {
  await reservation.update({ status: 'checked_out' });

  // Mark room as available again
  const room = await Room.findByPk(reservation.roomId);
  if (room) {
    await room.update({ isAvailable: true });
  }

  console.log(`  Guest checked out from Room ${room ? room.roomNumber : 'unknown'}`);
  return reservation;
}

async function processPayment(Payment, reservation, method) {
  const payment = await Payment.create({
    reservationId: reservation.id,
    guestId: reservation.guestId,
    amount: reservation.totalAmount,
    paymentMethod: method,
    status: 'completed',
    processedAt: new Date(),
  });

  console.log(`  Payment processed: ${payment.amount} via ${method}`);
  return payment;
}

async function queryGuestHistory(Guest, Reservation, Room, guest) {
  const reservations = await Reservation.findAll({
    where: { guestId: guest.id },
    include: [{ model: Room }],
    order: [['checkInDate', 'DESC']],
  });

  console.log(`\n  Reservation history for ${guest.firstName} ${guest.lastName}:`);
  for (const res of reservations) {
    const roomInfo = res.Room ? `Room ${res.Room.roomNumber} (${res.Room.roomType})` : 'Unknown room';
    console.log(`    ${roomInfo} | ${res.checkInDate} to ${res.checkOutDate} | Status: ${res.status} | Total: ${res.totalAmount}`);
  }
}

async function queryRoomAvailability(Room) {
  const availableRooms = await Room.findAll({
    where: { isAvailable: true },
    order: [['ratePerNight', 'ASC']],
  });

  console.log(`\n  Available rooms (${availableRooms.length}):`);
  for (const room of availableRooms) {
    console.log(`    Room ${room.roomNumber} | ${room.roomType} | Floor ${room.floor} | ${room.ratePerNight}/night | Max: ${room.maxOccupancy} guests`);
  }
}

async function queryRevenueReport(Payment, Reservation) {
  const completedPayments = await Payment.findAll({
    where: { status: 'completed' },
  });

  const totalRevenue = completedPayments.reduce(
    (sum, p) => sum + parseFloat(p.amount), 0
  );

  const totalReservations = await Reservation.count();
  const checkedOut = await Reservation.count({ where: { status: 'checked_out' } });

  console.log(`\n  Revenue Report:`);
  console.log(`    Total reservations: ${totalReservations}`);
  console.log(`    Completed stays: ${checkedOut}`);
  console.log(`    Total revenue: ${totalRevenue.toFixed(2)}`);
  console.log(`    Payments processed: ${completedPayments.length}`);
}

async function upgradeLoyaltyTierWithRetry(Guest, guestId, newTier) {
  // Re-read and update: the retry-safe pattern. The operation re-reads the guest
  // inside the closure so each retry acts on the latest row, and writes only the
  // changed column (scoped update) to reduce the OCC conflict surface.
  const updated = await withOccRetry(async () => {
    const guest = await Guest.findByPk(guestId);
    guest.loyaltyTier = newTier;
    await guest.save({ fields: ['loyaltyTier'] });
    return guest;
  });
  console.log(`  Loyalty tier updated (retry-safe): ${updated.firstName} ${updated.lastName} -> ${updated.loyaltyTier}`);
  return updated;
}

async function cleanup(Guest, Room, Reservation, Payment) {
  await Payment.destroy({ where: {} });
  await Reservation.destroy({ where: {} });
  await Room.destroy({ where: {} });
  await Guest.destroy({ where: {} });
  console.log('  Cleanup complete.');
}

async function main() {
  console.log('='.repeat(70));
  console.log('  Sequelize + Aurora DSQL: Hotel Reservation System Demo');
  console.log('='.repeat(70));

  // Initialize database connection (the Aurora DSQL connector generates the IAM
  // token when a connection is actually opened, e.g. during authenticate()).
  console.log('\n▶ Initializing database connection...');
  const sequelize = createSequelizeInstance();

  // Test connection
  await sequelize.authenticate();
  console.log('  Connection established successfully.');

  // Create tables
  console.log('\n▶ Creating tables...');
  await createTables(sequelize);

  // Define models
  const { Guest, Room, Reservation, Payment } = defineModels(sequelize);

  // Clear any existing rows so this demo is repeatable. This is a DESTRUCTIVE
  // operation: it deletes all rows from the guest, room, reservation, and payment
  // tables in the active schema before seeding fresh demo data. Run this sample
  // only against a database/schema dedicated to it, not one holding real data.
  console.log('\n▶ Cleaning existing data...');
  await cleanup(Guest, Room, Reservation, Payment);

  // Create guests
  console.log('\n▶ Registering guests...');
  const guests = await createGuests(Guest);

  // Create rooms
  console.log('\n▶ Setting up rooms...');
  const rooms = await createRooms(Room);

  // Simulate reservation workflow
  console.log('\n▶ Processing reservations...');

  console.log('\n  --- Reservation 1: Sarah books a standard room ---');
  const res1 = await makeReservation(
    Reservation, Room, guests[0], rooms[0],
    '2025-03-15', '2025-03-18', 'Late check-in requested'
  );
  await checkIn(Reservation, res1);
  await checkOut(Reservation, Room, res1);
  await processPayment(Payment, res1, 'credit_card');

  console.log('\n  --- Reservation 2: James books the suite ---');
  const res2 = await makeReservation(
    Reservation, Room, guests[1], rooms[2],
    '2025-03-20', '2025-03-25', 'Anniversary celebration - champagne please'
  );
  await checkIn(Reservation, res2);
  await checkOut(Reservation, Room, res2);
  await processPayment(Payment, res2, 'debit_card');

  console.log('\n  --- Reservation 3: Maria (Gold member) books the penthouse ---');
  const res3 = await makeReservation(
    Reservation, Room, guests[2], rooms[3],
    '2025-04-01', '2025-04-05', 'Loyalty upgrade confirmed'
  );
  await checkIn(Reservation, res3);
  await checkOut(Reservation, Room, res3);
  await processPayment(Payment, res3, 'loyalty_points');

  // Query operations
  console.log('\n▶ Querying guest history...');
  await queryGuestHistory(Guest, Reservation, Room, guests[0]);
  await queryGuestHistory(Guest, Reservation, Room, guests[2]);

  console.log('\n▶ Checking room availability...');
  await queryRoomAvailability(Room);

  console.log('\n▶ Revenue report...');
  await queryRevenueReport(Payment, Reservation);

  // Demonstrate the OCC retry pattern with a retry-safe update.
  console.log('\n▶ Updating guest loyalty tier (OCC retry-safe)...');
  await upgradeLoyaltyTierWithRetry(Guest, guests[0].id, 'gold');

  // Summary
  console.log('\n' + '='.repeat(70));
  const totalGuests = await Guest.count();
  const totalRooms = await Room.count();
  const totalRes = await Reservation.count();
  console.log(`  Summary: ${totalGuests} guests, ${totalRooms} rooms, ${totalRes} reservations processed`);
  console.log('='.repeat(70));

  // Cleanup (commented out - use cleanup.js separately)
  // console.log('\n▶ Cleaning up...');
  // await cleanup(Guest, Room, Reservation, Payment);

  // Close connection
  await sequelize.close();
  console.log('\n✓ Demo completed successfully!');
}

export { main };

// Only run the demo when this file is executed directly (e.g. `node src/app.js`
// or `npm start`), not when it is imported by a test. import.meta.url matches
// process.argv[1] only for the entry-point script, so importing this module has
// no side effects and tests can call main() explicitly.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Application error:', err);
    process.exit(1);
  });
}
