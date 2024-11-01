import { getClient } from '../src/connection-util.js';

const clusterEndpoint = "iyabtsicv4n64az4jwlngi2sgm.c0001.us-east-1.prod.sql.axdb.aws.dev";
const region = "us-east-1";

let client;

beforeAll(async () => {
  client = await getClient(clusterEndpoint, region);
})

afterAll(async () => {
  await client.end()
})

test('SELECT 1', async () => {
  const result = await client`SELECT 1 as value`
  expect(result[0].value).toBe(1);
});
