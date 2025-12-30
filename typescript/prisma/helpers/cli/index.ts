#!/usr/bin/env node
/**
 * Aurora DSQL Prisma CLI
 *
 * Tools for working with Prisma and Aurora DSQL.
 */
import { validateSchema, formatValidationResult } from "./validate";

const HELP = `
Aurora DSQL Prisma CLI

Usage:
  npx aurora-dsql-prisma <command> [options]

Commands:
  validate <schema>   Validate a Prisma schema for DSQL compatibility

Examples:
  npx aurora-dsql-prisma validate prisma/schema.prisma
`;

async function main(): Promise<void> {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
        console.log(HELP);
        process.exit(0);
    }

    const command = args[0];

    switch (command) {
        case "validate": {
            const schemaPath = args[1];
            if (!schemaPath) {
                console.error("Error: Schema path required");
                console.error(
                    "Usage: npx aurora-dsql-prisma validate <schema>",
                );
                process.exit(1);
            }

            const result = await validateSchema(schemaPath);
            console.log(formatValidationResult(result, schemaPath));
            process.exit(result.valid ? 0 : 1);
        }

        default:
            console.error(`Unknown command: ${command}`);
            console.log(HELP);
            process.exit(1);
    }
}

main().catch((error) => {
    console.error("Error:", error.message);
    process.exit(1);
});
