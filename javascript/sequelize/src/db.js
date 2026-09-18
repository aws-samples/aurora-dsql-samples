/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as pg from 'pg';
import { Sequelize } from 'sequelize';
import { AuroraDSQLClient } from '@aws/aurora-dsql-node-postgres-connector';

const CLUSTER_ENDPOINT = process.env.CLUSTER_ENDPOINT;

// CLUSTER_USER selects the database role to connect as:
//   'admin'      -> admin access, "public" schema
//   <app role>   -> non-admin least-privilege access (e.g. 'hotel_app'), custom schema
// The Aurora DSQL connector automatically uses an admin auth token for the
// "admin" user and a standard token for any other user, and it auto-detects the
// AWS Region from the cluster hostname. No manual token handling is required.
const CLUSTER_USER = process.env.CLUSTER_USER;
if (!CLUSTER_USER) {
  throw new Error(
    "Missing required environment variable CLUSTER_USER. " +
    "Set to 'admin' for admin access or your app role name (e.g., 'hotel_app') for non-admin."
  );
}

// Admin uses the "public" schema; non-admin users use a custom schema.
const ADMIN_USER = 'admin';
const SCHEMA = CLUSTER_USER === ADMIN_USER
  ? 'public'
  : (process.env.CLUSTER_SCHEMA || 'hotel');

// Validate the schema name to prevent SQL injection via environment variable tampering.
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(SCHEMA)) {
  throw new Error(`Invalid schema name: '${SCHEMA}'. Must be alphanumeric/underscore only.`);
}

function createSequelizeInstance() {
  // Integrate the Aurora DSQL connector by swapping node-postgres's Client for
  // AuroraDSQLClient via Sequelize's dialectModule. The connector handles IAM
  // token generation/refresh and Region auto-discovery from CLUSTER_ENDPOINT.
  //
  // Note on OCC retry + transactions: the retry helper in retry.js re-runs the
  // whole operation on an OCC conflict (SQLSTATE 40001 / OC000 / OC001). Sequelize
  // connections run in autocommit mode by default, so a single statement is
  // committed on its own and is safe to retry. Do NOT wrap a retried operation in
  // a bare sequelize.transaction() — a mid-transaction conflict can leave the
  // connection in a failed transaction state. If you need a multi-statement atomic
  // unit, use a Sequelize managed transaction INSIDE the retried function so each
  // attempt begins a fresh transaction.
  const sequelize = new Sequelize({
    host: CLUSTER_ENDPOINT,
    username: CLUSTER_USER,
    dialect: 'postgres',
    dialectModule: {
      ...pg,
      Client: AuroraDSQLClient,
    },
    dialectOptions: {
      clientMinMessages: 'ignore',
    },
    // Route all queries to the selected schema (public for admin, custom for non-admin).
    searchPath: SCHEMA,
    // Prevent Sequelize from sending unsupported SET commands to Aurora DSQL.
    standardConformingStrings: false,
    keepDefaultTimezone: true,
    logging: false,
    pool: {
      max: 5,
      min: 1,
      acquire: 30000,
      idle: 10000,
    },
  });

  return sequelize;
}

async function createSchema(sequelize) {
  // Aurora DSQL does not support multiple DDL statements in a single transaction.
  // Execute each CREATE TABLE as an individual raw query. Tables are created in
  // the selected schema by setting the search_path first.
  //
  // Foreign keys: reservation and payment declare REFERENCES to their parent
  // tables, so referenced tables (guest, room, reservation) MUST be created
  // before the tables that reference them — hence the order below.
  //
  // We use the default ON DELETE behavior (NO ACTION), following AWS guidance to
  // prefer NO ACTION/RESTRICT over CASCADE when child-row cardinality is
  // unbounded (a guest accumulates reservations and payments over time).
  // Cascading actions run in a single transaction and count against the Aurora
  // DSQL transaction row limit (3,000 rows), so a cascade could fail unexpectedly.
  //
  // Note: schema creation requires DDL privileges. The connected user runs this
  // DDL, so whoever runs it owns the resulting tables. In the non-admin path the
  // app role (e.g. hotel_app) is granted USAGE + CREATE on its schema and thus
  // owns the tables it creates here — which implicitly includes DDL rights
  // (DROP/ALTER) on those tables, not just CRUD. This is a deliberate convenience
  // so the non-admin path can self-provision its own schema. For a stricter
  // least-privilege setup, create the tables as admin and grant the app role
  // USAGE + CRUD only (no CREATE); see setup_app_user.sql.
  await sequelize.query(`SET search_path TO "${SCHEMA}"`, { raw: true });

  const tables = [
    `CREATE TABLE IF NOT EXISTS "guest" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "firstName" VARCHAR(100) NOT NULL,
      "lastName" VARCHAR(100) NOT NULL,
      "email" VARCHAR(150) NOT NULL UNIQUE,
      "phone" VARCHAR(20) NOT NULL,
      "loyaltyTier" VARCHAR(20) DEFAULT 'standard',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS "room" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "roomNumber" VARCHAR(10) NOT NULL UNIQUE,
      "roomType" VARCHAR(30) NOT NULL,
      "floor" INTEGER NOT NULL,
      "ratePerNight" DECIMAL(10,2) NOT NULL,
      "isAvailable" BOOLEAN DEFAULT TRUE,
      "maxOccupancy" INTEGER DEFAULT 2,
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS "reservation" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "guestId" UUID NOT NULL REFERENCES "guest" ("id"),
      "roomId" UUID NOT NULL REFERENCES "room" ("id"),
      "checkInDate" DATE NOT NULL,
      "checkOutDate" DATE NOT NULL,
      "status" VARCHAR(20) DEFAULT 'confirmed',
      "totalAmount" DECIMAL(10,2),
      "specialRequests" TEXT,
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS "payment" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "reservationId" UUID NOT NULL REFERENCES "reservation" ("id"),
      "guestId" UUID NOT NULL REFERENCES "guest" ("id"),
      "amount" DECIMAL(10,2) NOT NULL,
      "paymentMethod" VARCHAR(30) NOT NULL,
      "status" VARCHAR(20) DEFAULT 'pending',
      "processedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    )`,
  ];

  for (const ddl of tables) {
    await sequelize.query(ddl, { raw: true });
  }
}

export { createSequelizeInstance, createSchema, SCHEMA, CLUSTER_USER };
