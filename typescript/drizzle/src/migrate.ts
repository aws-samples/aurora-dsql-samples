import { migrate } from "@aws/aurora-dsql-drizzle";
import { createDsqlDb } from "./dsql-client";

async function main() {
  const db = createDsqlDb();
  try {
    const result = await migrate(db, { migrationsFolder: "./drizzle" });
    if (!result.success) {
      console.error(
        `Migration failed at ${result.error.migrationName} ` +
          `statement ${result.error.statementIndex}: ${result.error.message}`,
      );
      if (result.error.sql) {
        console.error(result.error.sql);
      }
      process.exit(1);
    }
    console.log(
      `Applied ${result.appliedStatements} statement(s) across ` +
        `${result.completedMigrations} migration(s).`,
    );
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error("Error running migrations:", error);
  process.exit(1);
});
