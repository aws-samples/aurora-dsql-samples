import { example } from '../src/index.js';

test('Smoke test', async () => {
  await example(process.env.CLUSTER_ENDPOINT, process.env.REGION);
  return Promise.resolve();
});
