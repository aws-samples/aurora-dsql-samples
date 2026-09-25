/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */

import { createSequelizeInstance } from './db.js';

async function main() {
  console.log('1. Connecting to Aurora DSQL...');
  const sequelize = createSequelizeInstance();

  console.log('2. Testing connection...');
  await sequelize.authenticate();
  console.log('   ✓ Connected successfully');

  console.log('3. Running test query...');
  const [results] = await sequelize.query('SELECT 1 AS test');
  console.log(`   ✓ Query result: ${JSON.stringify(results)}`);

  console.log('4. Closing connection...');
  await sequelize.close();
  console.log('   ✓ Disconnected');

  console.log('\n✓ All connection tests passed!');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
