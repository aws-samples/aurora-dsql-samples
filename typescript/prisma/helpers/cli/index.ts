#!/usr/bin/env node
/**
 * Aurora DSQL Prisma CLI
 *
 * Tools for working with Prisma and Aurora DSQL.
 */
import * as fs from "fs";
import { validateSchema, formatValidationResult } from "./validate";
import { transformMigration, formatTransformStats } from "./transform";

const HELP = `
Aurora DSQL Prisma Tools

Usage:
  npm run validate <schema>              Validate schema for DSQL compatibility
  npm run dsql-transform [input] [-o output]   Transform migration for DSQL

Commands:
  validate <schema>
    Validates a Prisma schema file for DSQL compatibility.
    Reports errors for unsupported features like autoincrement, foreign keys, etc.

  transform [input] [-o output]
    Transforms Prisma-generated SQL migrations to be DSQL-compatible.
    - Wraps each statement in BEGIN/COMMIT
    - Converts CREATE INDEX to CREATE INDEX ASYNC
    - Removes foreign key constraints

    If no input file is specified, reads from stdin.
    If no output file is specified, writes to stdout.

Examples:
  npm run validate prisma/schema.prisma

  # Transform from file to file
  npm run dsql-transform raw.sql -o migration.sql

  # Transform using pipes
  npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script | npm run dsql-transform > migration.sql
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
                console.error("Usage: npm run validate <schema>");
                process.exit(1);
            }

            const result = await validateSchema(schemaPath);
            console.log(formatValidationResult(result, schemaPath));
            process.exit(result.valid ? 0 : 1);
        }

        case "transform": {
            await handleTransform(args.slice(1));
            break;
        }

        default:
            console.error(`Unknown command: ${command}`);
            console.log(HELP);
            process.exit(1);
    }
}

async function handleTransform(args: string[]): Promise<void> {
    // Check for help flag
    if (args.includes("--help") || args.includes("-h")) {
        console.log(`
Migration Transformer - Convert Prisma migrations for Aurora DSQL

Usage:
  npm run dsql-transform [input.sql] [-o output.sql] [--no-header]
  npx prisma migrate diff ... --script | npm run dsql-transform

Options:
  -o, --output <file>   Write output to file instead of stdout
  --no-header           Omit the generated header comment
  -h, --help            Show this help message

Examples:
  # Transform from file to file
  npm run dsql-transform raw.sql -o migration.sql

  # Transform using pipes
  npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script | npm run dsql-transform > migration.sql

  # Without header comment
  npm run dsql-transform raw.sql --no-header -o migration.sql
`);
        process.exit(0);
    }

    let inputFile: string | null = null;
    let outputFile: string | null = null;
    let includeHeader = true;

    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "-o" || args[i] === "--output") {
            outputFile = args[++i];
        } else if (args[i] === "--no-header") {
            includeHeader = false;
        } else if (!args[i].startsWith("-")) {
            inputFile = args[i];
        }
    }

    // Read input
    let sql: string;
    if (inputFile) {
        if (!fs.existsSync(inputFile)) {
            console.error(`Error: Input file not found: ${inputFile}`);
            process.exit(1);
        }
        sql = fs.readFileSync(inputFile, "utf-8");
    } else {
        // Read from stdin
        sql = await readStdin();
        if (!sql.trim()) {
            console.error("Error: No input provided");
            console.error(
                "Usage: npm run dsql-transform [input.sql] [-o output.sql]",
            );
            console.error(
                "       npx prisma migrate diff ... --script | npm run dsql-transform",
            );
            process.exit(1);
        }
    }

    // Transform
    const result = transformMigration(sql, { includeHeader });

    // Write output
    if (outputFile) {
        fs.writeFileSync(outputFile, result.sql);
        console.error(formatTransformStats(result.stats, result.warnings));
        console.error(`Output written to: ${outputFile}`);
    } else {
        // Write SQL to stdout, stats to stderr
        console.log(result.sql);
        console.error(formatTransformStats(result.stats, result.warnings));
    }
}

function readStdin(): Promise<string> {
    return new Promise((resolve) => {
        // Check if stdin is a TTY (interactive terminal)
        if (process.stdin.isTTY) {
            resolve("");
            return;
        }

        let data = "";
        process.stdin.setEncoding("utf-8");
        process.stdin.on("data", (chunk) => {
            data += chunk;
        });
        process.stdin.on("end", () => {
            resolve(data);
        });
    });
}

main().catch((error) => {
    console.error("Error:", error.message);
    process.exit(1);
});
