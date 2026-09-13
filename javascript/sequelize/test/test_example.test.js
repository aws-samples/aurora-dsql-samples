/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Unit tests for the Sequelize + Aurora DSQL hotel sample.
// Pure-logic tests: no AWS credentials, no network, and no live Aurora DSQL
// cluster are required. Run from the project root with:
//   npm test
//
// Covers config, models, and the OCC retry utility.

import { describe, test, expect } from '@jest/globals';
import { Sequelize } from 'sequelize';
import { withOccRetry, isOccError, OCC_SQLSTATE, BASE_DELAY_MS } from '../src/retry.js';
import { defineModels } from '../src/models.js';

// Load a fresh copy of db.js with a given env. db.js reads env vars at module
// load and throws on invalid config, so each config test imports it in isolation.
// A cache-busting query string forces a fresh ESM module evaluation each time.
let loadCounter = 0;
async function loadDbFresh(env) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    return await import(`../src/db.js?v=${loadCounter++}`);
  } finally {
    process.env = saved;
  }
}

// ---------------------------------------------------------------------------
// retry.js
// ---------------------------------------------------------------------------

describe('retry', () => {
  test('constants match the reference implementation', () => {
    expect(OCC_SQLSTATE).toBe('40001');
    expect(BASE_DELAY_MS).toBe(50);
  });

  test('isOccError detects structured SQLSTATE on the error itself', () => {
    expect(isOccError({ code: '40001' })).toBe(true);
  });

  test('isOccError detects SQLSTATE on wrapped parent/original (Sequelize)', () => {
    expect(isOccError({ parent: { code: '40001' } })).toBe(true);
    expect(isOccError({ original: { code: '40001' } })).toBe(true);
  });

  test('isOccError matches DSQL OC000/OC001 in the message', () => {
    expect(isOccError(new Error('conflict SQLSTATE 40001'))).toBe(true);
    expect(isOccError(new Error('serialization failure OC000'))).toBe(true);
    expect(isOccError(new Error('serialization failure OC001'))).toBe(true);
  });

  test('isOccError returns false for non-OCC and nullish errors', () => {
    expect(isOccError({ code: '23505' })).toBe(false); // unique_violation
    expect(isOccError(new Error('some unrelated failure'))).toBe(false);
    expect(isOccError(null)).toBe(false);
    expect(isOccError(undefined)).toBe(false);
  });

  test('withOccRetry returns immediately on success (no retry)', async () => {
    let calls = 0;
    const result = await withOccRetry(async () => {
      calls += 1;
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  test('withOccRetry retries on OCC conflict then succeeds', async () => {
    let calls = 0;
    const result = await withOccRetry(async () => {
      calls += 1;
      if (calls < 3) {
        const err = new Error('serialization failure');
        err.code = '40001';
        throw err;
      }
      return 'recovered';
    }, 3);
    expect(result).toBe('recovered');
    expect(calls).toBe(3);
  });

  test('withOccRetry does NOT retry a non-OCC error', async () => {
    let calls = 0;
    await expect(
      withOccRetry(async () => {
        calls += 1;
        const err = new Error('boom');
        err.code = '23505';
        throw err;
      }, 3)
    ).rejects.toThrow(/boom/);
    expect(calls).toBe(1); // failed on first attempt, no retries
  });

  test('withOccRetry gives up after maxRetries and rethrows', async () => {
    let calls = 0;
    await expect(
      withOccRetry(async () => {
        calls += 1;
        const err = new Error('always conflicts');
        err.code = '40001';
        throw err;
      }, 2)
    ).rejects.toThrow(/always conflicts/);
    expect(calls).toBe(3); // 1 initial + 2 retries
  });
});

// ---------------------------------------------------------------------------
// db.js  (config logic — no connection is opened)
// ---------------------------------------------------------------------------

const BASE_ENV = {
  CLUSTER_ENDPOINT: 'example.dsql.us-west-2.on.aws',
  CLUSTER_REGION: 'us-west-2',
};

describe('config', () => {
  test('admin user selects the public schema', async () => {
    const db = await loadDbFresh({ ...BASE_ENV, CLUSTER_USER: 'admin' });
    expect(db.SCHEMA).toBe('public');
    expect(db.CLUSTER_USER).toBe('admin');
  });

  test('non-admin user defaults to the hotel schema', async () => {
    const db = await loadDbFresh({ ...BASE_ENV, CLUSTER_USER: 'hotel_app' });
    expect(db.SCHEMA).toBe('hotel');
  });

  test('non-admin user honors CLUSTER_SCHEMA override', async () => {
    const db = await loadDbFresh({
      ...BASE_ENV,
      CLUSTER_USER: 'hotel_app',
      CLUSTER_SCHEMA: 'custom_schema',
    });
    expect(db.SCHEMA).toBe('custom_schema');
  });

  test('missing CLUSTER_USER throws', async () => {
    await expect(
      loadDbFresh({ ...BASE_ENV, CLUSTER_USER: '' })
    ).rejects.toThrow(/Missing required environment variable CLUSTER_USER/);
  });

  test('invalid schema name is rejected (SQL injection guard)', async () => {
    await expect(
      loadDbFresh({
        ...BASE_ENV,
        CLUSTER_USER: 'hotel_app',
        CLUSTER_SCHEMA: 'bad; DROP TABLE guest;',
      })
    ).rejects.toThrow(/Invalid schema name/);
  });
});

// ---------------------------------------------------------------------------
// models.js  (model definitions — no connection is opened)
// ---------------------------------------------------------------------------

function newSequelize() {
  // Constructing a Sequelize instance does not open a connection until a query
  // runs, so this is safe offline with dummy credentials.
  return new Sequelize('postgres', 'u', 'p', { dialect: 'postgres', logging: false });
}

describe('models', () => {
  test('defineModels returns the four hotel entities', () => {
    const models = defineModels(newSequelize());
    for (const name of ['Guest', 'Room', 'Reservation', 'Payment']) {
      expect(models[name]).toBeTruthy();
    }
  });

  test('Guest uses a UUID primary key with UUIDV4 default', () => {
    const { Guest } = defineModels(newSequelize());
    const idAttr = Guest.getAttributes().id;
    expect(idAttr.primaryKey).toBe(true);
    expect(idAttr.type.constructor.name).toBe('UUID');
  });

  test('expected columns exist on each model', () => {
    const { Guest, Room, Reservation, Payment } = defineModels(newSequelize());
    expect(Guest.getAttributes().email).toBeTruthy();
    expect(Guest.getAttributes().loyaltyTier).toBeTruthy();
    expect(Room.getAttributes().roomNumber).toBeTruthy();
    expect(Room.getAttributes().ratePerNight).toBeTruthy();
    expect(Reservation.getAttributes().guestId).toBeTruthy();
    expect(Reservation.getAttributes().roomId).toBeTruthy();
    expect(Payment.getAttributes().reservationId).toBeTruthy();
    expect(Payment.getAttributes().paymentMethod).toBeTruthy();
  });

  test('associations are registered (relationship queries via include)', () => {
    const { Guest, Reservation } = defineModels(newSequelize());
    expect(Object.keys(Reservation.associations).length).toBeGreaterThan(0);
    expect(Object.keys(Guest.associations).length).toBeGreaterThan(0);
  });
});
