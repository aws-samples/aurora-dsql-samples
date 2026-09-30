/**
 * Aurora DSQL Drizzle client with automatic IAM authentication.
 *
 * `drizzle()` from @aws/aurora-dsql-drizzle builds an AuroraDSQLPool (IAM token
 * auth + pooling) under the standard drizzle-orm/node-postgres driver.
 */
import { drizzle } from "@aws/aurora-dsql-drizzle";
import * as schema from "./schema";
import { getRequiredEnv } from "./utils";

const ADMIN = "admin";
const ADMIN_SCHEMA = "public";
const NON_ADMIN_SCHEMA = "myschema";

export type VeterinaryDb = ReturnType<typeof createDsqlDb>;

export function createDsqlDb() {
  const host = getRequiredEnv("CLUSTER_ENDPOINT");
  const user = getRequiredEnv("CLUSTER_USER");
  const dbSchema = user === ADMIN ? ADMIN_SCHEMA : NON_ADMIN_SCHEMA;

  return drizzle({
    connection: {
      host,
      user,
      application_name: "drizzle-vet",
      // Set search_path on connection to ensure proper schema access in DSQL.
      options: `-c search_path=${dbSchema}`,
    },
    schema,
  });
}
