/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */

import { DataTypes } from 'sequelize';

// Resolve the schema the same way db.js does, but locally so that importing this
// module never depends on db.js's connection/env validation. Admin uses the
// "public" schema; non-admin app users use a custom schema (default "hotel").
// Models are schema-qualified (see `schema: SCHEMA` below) so every query targets
// the intended schema regardless of the connection's search_path — this prevents
// an unqualified table name from resolving to a same-named table in another schema
// (for example public.payment) that the app role has no privileges on.
const ADMIN_USER = 'admin';
const SCHEMA = process.env.CLUSTER_USER === ADMIN_USER
  ? 'public'
  : (process.env.CLUSTER_SCHEMA || 'hotel');

function defineModels(sequelize) {
  // Guest model
  const Guest = sequelize.define('Guest', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: true,
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    loyaltyTier: {
      type: DataTypes.STRING(20),
      defaultValue: 'standard', // standard, silver, gold, platinum
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  }, {
    tableName: 'guest',
    schema: SCHEMA,
    timestamps: true,
  });

  // Room model
  const Room = sequelize.define('Room', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    roomNumber: {
      type: DataTypes.STRING(10),
      allowNull: false,
      unique: true,
    },
    roomType: {
      type: DataTypes.STRING(30),
      allowNull: false, // standard, deluxe, suite, penthouse
    },
    floor: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    ratePerNight: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    isAvailable: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    maxOccupancy: {
      type: DataTypes.INTEGER,
      defaultValue: 2,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  }, {
    tableName: 'room',
    schema: SCHEMA,
    timestamps: true,
  });

  // Reservation model
  const Reservation = sequelize.define('Reservation', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    guestId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    roomId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    checkInDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    checkOutDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'confirmed', // confirmed, checked_in, checked_out, cancelled
    },
    totalAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    specialRequests: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  }, {
    tableName: 'reservation',
    schema: SCHEMA,
    timestamps: true,
  });

  // Payment model
  const Payment = sequelize.define('Payment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    reservationId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    guestId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    paymentMethod: {
      type: DataTypes.STRING(30),
      allowNull: false, // credit_card, debit_card, cash, loyalty_points
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'pending', // pending, completed, failed, refunded
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  }, {
    tableName: 'payment',
    schema: SCHEMA,
    timestamps: true,
  });

  // Define associations. Aurora DSQL supports foreign key constraints, and this
  // sample enforces referential integrity at the database level (see the
  // REFERENCES clauses in db.js). The associations below give Sequelize the
  // relationship metadata for eager loading (include) and association helpers.
  //
  // We keep the default ON DELETE behavior (NO ACTION) rather than CASCADE:
  // per AWS guidance, prefer NO ACTION/RESTRICT when child-row cardinality is
  // unbounded (guests accumulate reservations and payments), because cascading
  // actions run in one transaction and count against the DSQL 3,000-row limit.
  //
  // Under DSQL's optimistic concurrency control, FK checks add extra reads and
  // concurrent conflicts on referenced key columns fail with a retryable
  // serialization error (OC000 / SQLSTATE 40001) rather than waiting on a lock —
  // so write paths should use the OCC retry helper (see retry.js).
  Guest.hasMany(Reservation, { foreignKey: 'guestId' });
  Reservation.belongsTo(Guest, { foreignKey: 'guestId' });

  Room.hasMany(Reservation, { foreignKey: 'roomId' });
  Reservation.belongsTo(Room, { foreignKey: 'roomId' });

  Reservation.hasMany(Payment, { foreignKey: 'reservationId' });
  Payment.belongsTo(Reservation, { foreignKey: 'reservationId' });

  Guest.hasMany(Payment, { foreignKey: 'guestId' });
  Payment.belongsTo(Guest, { foreignKey: 'guestId' });

  return { Guest, Room, Reservation, Payment };
}

export { defineModels };
