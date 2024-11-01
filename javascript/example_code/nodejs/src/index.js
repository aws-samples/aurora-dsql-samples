import { v4 as uuidv4 } from 'uuid';
import { getClient } from './connection-util.js';

const createTables = async (client) => {
  await client.query(`CREATE TABLE IF NOT EXISTS owner (
    id UUID PRIMARY KEY,
    name VARCHAR(30) NOT NULL,
    city VARCHAR(80) NOT NULL,
    telephone VARCHAR(20)
  )`);
  return Promise.resolve();
}

const createOwner = async (client) => {
  await client.query("INSERT INTO owner(id, name, city, telephone) VALUES($1, $2, $3, $4)", [uuidv4(), "John Doe", "Las Vegas", "555-555-5555"]);
  return Promise.resolve();
}

const readOwner = async (client) => {
  const result = await client.query("SELECT * FROM owner");
  console.log(result.rows);
  return Promise.resolve();
}

const updateOwner = async (client) => {
  await client.query("UPDATE owner SET telephone = $1 WHERE name = $2", ["888-888-8888", "John Doe"]);
  return Promise.resolve();
}

const deleteOwner = async (client) => {
  await client.query("DELETE FROM owner WHERE name = $1", ["John Doe"]);
  return Promise.resolve();
}

const clusterEndpoint = "h4abtsicxaovobxmhveyghyxqi.c0001.us-east-1.prod.sql.axdb.aws.dev";
const region = "us-east-1";

try {
  const client = await getClient(clusterEndpoint, region);
  await createTables(client);
  await createOwner(client);
  await readOwner(client);
  await updateOwner(client);
  await readOwner(client);
  await deleteOwner(client);
  await client.end();
} catch (error) {
  console.error(error);
}
