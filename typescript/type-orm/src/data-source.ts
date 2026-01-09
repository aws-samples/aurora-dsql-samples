import "reflect-metadata";
import { DataSource } from "typeorm";
import { DsqlSigner } from "@aws-sdk/dsql-signer";
import path from "path";
import fs from "fs";

import { getEnvironmentVariables } from "./utils";

const getDataSource = async () => {
  const { user, clusterEndpoint, region } = getEnvironmentVariables();

  const signer = new DsqlSigner({
    hostname: clusterEndpoint,
    region: region,
  });

  let schema: string = "public";

  try {
    if (user !== "admin") {
      schema = "myschema";
    } 

    let AppDataSource = new DataSource({
      type: "postgres",
      host: clusterEndpoint,
      port: 5432,
      username: user,
      password: () => user === "admin" 
        ? signer.getDbConnectAdminAuthToken() 
        : signer.getDbConnectAuthToken(),
      database: "postgres",
      ssl: {
        rejectUnauthorized: true,
      },
      synchronize: false,
      logging: false,
      entities: [path.join(__dirname, "/entity/**/*{.ts,.js}")],
      schema: schema,
      migrations: [path.join(__dirname, "/migrations/**/*{.ts,.js}")],
      migrationsRun: false,
      // Pool options
      extra: {
        min: 0,
        max: 5,                      
        idleTimeoutMillis: 600000,     // 10 minutes
        connectionTimeoutMillis: 30000,   
        maxLifetimeSeconds: 3300,  // 55 minutes (connector handles token refresh)
      },
    });

    return AppDataSource;
  } catch (error) {
    console.error("Failed to initialize data source:", error);
    throw error;
  }
};

export default getDataSource();
