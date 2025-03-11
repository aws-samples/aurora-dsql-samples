import { example } from '../src/index.js';

test('Smoke test', async () => {
  await example();
}, 20000);
