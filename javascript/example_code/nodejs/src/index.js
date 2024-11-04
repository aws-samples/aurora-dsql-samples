import { v4 as uuidv4 } from 'uuid';
import { getClient } from './connection-util.js';

const createTables = async (client) => {
  return client.query(`CREATE TABLE IF NOT EXISTS owner (
    id UUID PRIMARY KEY,
    name VARCHAR(30) NOT NULL,
    city VARCHAR(80) NOT NULL,
    telephone VARCHAR(20)
  )`);
}

const createOwner = (client) => {
  return client.query("INSERT INTO owner(id, name, city, telephone) VALUES($1, $2, $3, $4)", [uuidv4(), "John Doe", "Las Vegas", "555-555-5555"]);
}

const readOwner = async (client) => {
  const result = await client.query("SELECT * FROM owner");
  console.log(result.rows);
  return Promise.resolve();
}

const updateOwner = (client) => {
  return client.query("UPDATE owner SET telephone = $1 WHERE name = $2", ["888-888-8888", "John Doe"]);
}

const deleteOwner = (client) => {
  return client.query("DELETE FROM owner WHERE name = $1", ["John Doe"]);
}

const clusterEndpoint = "h4abtsicxaovobxmhveyghyxqi.c0001.us-east-1.prod.sql.axdb.aws.dev";
const region = "us-east-1";

let client;
try {
  client = await getClient(clusterEndpoint, region);
  await createTables(client);
  await createOwner(client);
  await readOwner(client);
  await updateOwner(client);
  await readOwner(client);
  await deleteOwner(client);
} catch (error) {
  console.error(error);
} finally {
  client?.end()
}
