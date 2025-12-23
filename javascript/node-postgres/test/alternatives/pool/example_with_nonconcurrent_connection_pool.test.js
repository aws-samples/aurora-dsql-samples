import { example } from '../../../src/alternatives/pool/example_with_nonconcurrent_connection_pool.js';

test('Smoke test - example_with_nonconcurrent_connection_pool', async () => {
  await example();
}, 30000);
