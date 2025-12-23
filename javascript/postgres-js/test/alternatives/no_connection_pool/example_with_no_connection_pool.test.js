import { example } from '../../../src/alternatives/no_connection_pool/example_with_no_connection_pool.js';

test('Smoke test - example_with_no_connection_pool', async () => {
  await example();
}, 30000);
