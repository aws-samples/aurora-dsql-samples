
import postgres from 'postgres'
import { generateToken } from '../src/token-gen.js';

let sql;

beforeAll(async () => {
  const hostname = "foobazclustername.c0001.us-east-2.gamma.sql.axdb.aws.dev";
  // If you use a custom database role, change the action to DbConnect
  const action = "DbConnectSuperuser";
  const region = "us-east-2";
  const expiresIn = 3600;
  let token;
  try {
    token = await generateToken(hostname, action, region, expiresIn);
    console.log("Token generated succesfully!");
  } catch (error) {
    console.error("Error generating token: ", error);
    process.exit(1)
  }

  sql = postgres({
    host: hostname,
    user: "axdb_superuser",
    pass: token,
    db: "postgres",
    port: 5432,
    ssl: "require",
    })
})

afterAll(async () => {
    await sql.end()
})

test('SELECT 1', async () => {
    const result = await sql`SELECT 1 AS value`
    expect(result[0].value).toBe(1);
});
