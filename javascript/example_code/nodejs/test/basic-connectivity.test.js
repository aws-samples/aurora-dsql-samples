import { getClient } from '../src/connection-util.js';

const clusterEndpoint = "h4abtsicxaovobxmhveyghyxqi.c0001.us-east-1.prod.sql.axdb.aws.dev";
const region = "us-east-1";

let client;

beforeAll(async () => {
  client = await getClient(clusterEndpoint, region);
})

afterAll(async () => {
  await client.end()
})

test('SELECT 1', async () => {
  const result = await client.query('SELECT 1 as value')
  expect(result.rows[0].value).toBe(1);
});
