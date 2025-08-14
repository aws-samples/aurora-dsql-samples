import { runVeterinaryExample } from "./example";
import { DsqlPrismaClient } from "./dsql-client";
import { VeterinaryService } from "./veterinary-service";

async function main() {
    console.log("Starting Prisma DSQL Example...");

    try {
        const client = new DsqlPrismaClient();
        try {
            const service = new VeterinaryService(client);
            await runVeterinaryExample(service);
            console.log("Example completed successfully!");
        } finally {
            await client.dispose();
        }
    } catch (error) {
        console.error("Error running example:", error);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}
