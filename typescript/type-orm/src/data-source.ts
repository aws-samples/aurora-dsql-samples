import "reflect-metadata";
import { DataSource } from "typeorm";
import { DsqlSigner } from "@aws-sdk/dsql-signer";
import { join } from "path";

const clusterEndpoint = process.env.CLUSTER_ENDPOINT!;
const region = process.env.REGION!;

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
