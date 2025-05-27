import { DsqlSigner } from "@aws-sdk/dsql-signer";
import { Client } from "pg";
import { getEnvironmentVariables } from "./utils";
import fs from "fs";
import path from "path";

const dropMigrationsTable = async () => {
  const { user, clusterEndpoint, region } = getEnvironmentVariables();

  const signer = new DsqlSigner({
    hostname: clusterEndpoint,
    region: region,
  });

  let token: string;
  let schema = "public";
  let client: Client | undefined;

  try {
    if (user === "admin") {
      token = await signer.getDbConnectAdminAuthToken();
    } else {
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
    await client.query(
      `DROP TABLE IF EXISTS ${client.escapeIdentifier(schema)}."migrations"`
    );
    console.log(`Dropped the migration table from ${schema}`);
  } catch (error) {
    console.error("Failed to drop the migration table:", error);
    throw error;
  } finally {
    if (client) {
      await client.end();
    }
  }
};

dropMigrationsTable();
