import { v4 as uuidv4 } from 'uuid';
import { getClient } from './connection-util.js';

const createTables = async (client) => {
  return client`CREATE TABLE IF NOT EXISTS owner (
    id UUID PRIMARY KEY,
    name VARCHAR(30) NOT NULL,
    city VARCHAR(80) NOT NULL,
    telephone VARCHAR(20)
  )`;
}

const createOwner = async (client) => {
  const owners = [{
    id: uuidv4(),
    name: "John Doe",
    city: "Las Vegas",
    telephone: "555-555-555"
  }];
  
  return client`INSERT INTO owner ${ client(owners) }`
}

const readOwner = async (client) => {
  const result = await client`SELECT * FROM owner`;
  console.log(result);
  return Promise.resolve();
}

const updateOwner = async (client) => {
  return client`UPDATE owner SET telephone = '888-888-8888' WHERE name = 'John Doe'`
}

const deleteOwner = async (client) => {
  return client`DELETE FROM owner WHERE name = 'John Doe'`
}

const clusterEndpoint = "iyabtsicv4n64az4jwlngi2sgm.c0001.us-east-1.prod.sql.axdb.aws.dev";
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
  await client.end();
}
