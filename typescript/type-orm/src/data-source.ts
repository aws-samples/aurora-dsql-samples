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

  let token: string;
  let schema: string = "public";

  try {
    if (user === "admin") {
      token = await signer.getDbConnectAdminAuthToken();
    } else {
      token = await signer.getDbConnectAuthToken();
      schema = "myschema";
    }

    let AppDataSource = new DataSource({
      type: "postgres",
      host: clusterEndpoint,
      port: 5432,
      username: user,
      password: token,
      database: "postgres",
      ssl: {
        ca: fs.readFileSync(path.join(__dirname, "root.pem")),
        rejectUnauthorized: true,
      },
      synchronize: false,
      logging: false,
      entities: [path.join(__dirname, "/entity/**/*{.ts,.js}")],
      schema: schema,
      migrations: [path.join(__dirname, "/migrations/**/*{.ts,.js}")],
      migrationsRun: false,
    });

    return AppDataSource;
  } catch (error) {
    console.error("Failed to initialize data source:", error);
    throw error;
  }
};

export default getDataSource();
