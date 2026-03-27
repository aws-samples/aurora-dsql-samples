import { applyMigrations } from "./migrate";
import { createDsqlClient } from "./dsql-client";
import { runVeterinaryExample } from "./example";

export async function runExamples() {
    console.log("Starting Drizzle DSQL Example...");

    const { db, pool } = createDsqlClient();

    try {
        console.log("Running migrations...");
        await applyMigrations(pool, "./drizzle");

        await runVeterinaryExample(db);

        console.log("Example completed successfully!");
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    runExamples().catch((error) => {
        console.error("Error running example:", error);
        process.exit(1);
    });
}
