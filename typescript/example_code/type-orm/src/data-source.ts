import "reflect-metadata";
import { DataSource } from "typeorm";
import { DsqlSigner } from "@aws-sdk/dsql-signer";
import { join } from "path";

const clusterEndpoint = "m4abtthl5ti4xehekve7aljv7i.c0001.us-east-1.prod.sql.axdb.aws.dev";
const region = "us-east-1";

const signer = new DsqlSigner({
    hostname: clusterEndpoint,
    region: region
});

const getDataSource = async () => {

  const token = await signer.getDbConnectAdminAuthToken();
  const AppDataSource = new DataSource({
    type: "postgres",
    host: clusterEndpoint,
    port: 5432,
    username: "admin",
    password: token,
    database: "postgres",
    ssl: true,
    synchronize: false,
    logging: false,
    entities: [join(__dirname, "/entity/**/*{.ts,.js}")],
    schema: "public",
    migrations: [join(__dirname, "/migrations/**/*{.ts,.js}")],
    migrationsRun: false,
  });
  return AppDataSource;
}

export default getDataSource();
