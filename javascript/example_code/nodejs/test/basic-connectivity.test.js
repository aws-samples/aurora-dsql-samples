import { getClient } from '../src/connection-util.js';

const clusterEndpoint = "<your_cluster_endpoint>";
const region = "us-east-2";

let client;

beforeAll(async () => {
  client = await getClient(clusterEndpoint, region);
})

afterAll(async () => {
  client.end()
})

test('SELECT 1', async () => {
  const result = await client.query('SELECT 1 as value')
  expect(result.rows[0].value).toBe(1);
});
