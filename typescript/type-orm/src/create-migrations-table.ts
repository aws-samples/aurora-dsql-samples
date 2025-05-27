import { DsqlSigner } from "@aws-sdk/dsql-signer";
import { Client } from "pg";
import { getEnvironmentVariables } from "./utils";
import { escapeIdentifier } from "pg/lib/utils";
import fs from "fs";
import path from "path";

const createMigrationsTable = async () => {
  const { user, clusterEndpoint, region } = getEnvironmentVariables();

  const signer = new DsqlSigner({
    hostname: clusterEndpoint,
    region: region,
  });

  let token: string;
  let client: Client | undefined;
  let schema = "public";

  try {
    if (user === "admin") {
      token = await signer.getDbConnectAdminAuthToken();
    } else {
      // Non admin user
      token = await signer.getDbConnectAuthToken();
      schema = "myschema";
    }

    client = new Client({
      user: user,
      password: token,
      host: clusterEndpoint,
      port: 5432,
      database: "postgres",
      ssl: {
        rejectUnauthorized: true,
      },
    });

    await client.connect();
    // The following is required to set the default schema for the migration scripts
    // The schema can't be changed when the migration script is generated
    await client.query(
      `ALTER USER ${escapeIdentifier(user)} 
      set SEARCH_PATH = ${escapeIdentifier(schema)};`
    );
    await client.query(
      `CREATE TABLE IF NOT EXISTS 
      ${client.escapeIdentifier(schema)}."migrations" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "timestamp" bigint NOT NULL,
        "name" character varying NOT NULL
      )`
    );
    console.log(`Created the migration table in ${schema}`);
  } catch (error) {
    console.error("Failed to create the migration table:", error);
    throw error;
  } finally {
    if (client) {
      await client.end();
    }
  }
};

createMigrationsTable();
