import { createDsqlDb } from "./dsql-client";
import { runVeterinaryExample } from "./example";
import { VeterinaryService } from "./veterinary-service";

async function main() {
  console.log("Starting Drizzle DSQL Example...");

  const db = createDsqlDb();
  try {
    const service = new VeterinaryService(db);
    await runVeterinaryExample(service);
    console.log("Example completed successfully!");
  } finally {
    await db.$client.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Error running example:", error);
    process.exit(1);
  });
}
