import { example } from '../../../src/alternatives/no_connection_pool/example_with_no_connector.js';

test('Smoke test - example_with_no_connector', async () => {
  await example();
}, 30000);
