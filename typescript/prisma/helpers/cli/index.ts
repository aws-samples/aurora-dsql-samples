#!/usr/bin/env node
/**
 * Aurora DSQL Prisma CLI
 *
 * Tools for working with Prisma and Aurora DSQL.
 */
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { validateSchema, formatValidationResult } from "./validate";
import { transformMigration, formatTransformStats } from "./transform";

const HELP = `
Aurora DSQL Prisma Tools

Usage:
  npm run dsql-migrate <schema> -o <output>    Validate, generate, and transform migration
  npm run validate <schema>                    Validate schema for DSQL compatibility
  npm run dsql-transform [input] [-o output]   Transform migration for DSQL

Commands:
  migrate <schema> -o <output> [--from-url <url>]
    All-in-one command: validates schema, generates migration, and transforms for DSQL.
    Exits on validation failure so you can fix and re-run.
    Use --from-url for incremental migrations against an existing database.

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
  # All-in-one migration (recommended)
  npm run dsql-migrate prisma/schema.prisma -o prisma/migrations/001_init/migration.sql

  # Incremental migration (after schema changes)
  npm run dsql-migrate prisma/schema.prisma -o prisma/migrations/002_changes/migration.sql --from-url "$DATABASE_URL"

  # Manual workflow
  npm run validate prisma/schema.prisma
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
        case "migrate": {
            await handleMigrate(args.slice(1));
            break;
        }

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

async function handleMigrate(args: string[]): Promise<void> {
    // Check for help flag
    if (args.includes("--help") || args.includes("-h")) {
        console.log(`
DSQL Migration Generator - All-in-one migration workflow

Usage:
  npm run dsql-migrate <schema.prisma> -o <output.sql> [--from-url <url>]

Options:
  -o, --output <file>   Output file for the migration (required)
  --from-url <url>      Compare against existing database (for incremental migrations)
  --force               Force transformation even with unsupported statements
  --no-header           Omit the generated header comment
  -h, --help            Show this help message

This command:
  1. Validates your schema for DSQL compatibility
  2. Generates migration SQL using Prisma
  3. Transforms the SQL for DSQL (wraps in transactions, async indexes, removes FKs)

If validation fails, the command exits so you can fix your schema and re-run.

Examples:
  # Initial migration
  npm run dsql-migrate prisma/schema.prisma -o prisma/migrations/001_init/migration.sql

  # Incremental migration (after schema changes)
  npm run dsql-migrate prisma/schema.prisma -o prisma/migrations/002_changes/migration.sql --from-url "$DATABASE_URL"
`);
        process.exit(0);
    }

    let schemaPath: string | null = null;
    let outputFile: string | null = null;
    let fromUrl: string | null = null;
    let fromEmpty = false;
    let includeHeader = true;
    let force = false;

    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "-o" || args[i] === "--output") {
            outputFile = args[++i];
        } else if (args[i] === "--from-url") {
            fromUrl = args[++i];
            if (!fromUrl || fromUrl.startsWith("-")) {
                console.error("Error: --from-url requires a URL argument");
                process.exit(1);
            }
        } else if (args[i] === "--from-empty") {
            fromEmpty = true;
        } else if (args[i] === "--no-header") {
            includeHeader = false;
        } else if (args[i] === "--force") {
            force = true;
        } else if (!args[i].startsWith("-")) {
            schemaPath = args[i];
        }
    }

    if (!schemaPath) {
        console.error("Error: Schema path required");
        console.error(
            "Usage: npm run dsql-migrate <schema.prisma> -o <output.sql>",
        );
        process.exit(1);
    }

    if (!outputFile) {
        console.error("Error: Output file required");
        console.error(
            "Usage: npm run dsql-migrate <schema.prisma> -o <output.sql>",
        );
        process.exit(1);
    }

    // Default to --from-empty if no --from-* option specified
    if (!fromUrl && !fromEmpty) {
        fromEmpty = true;
    }

    // Step 1: Validate schema
    console.log(`Validating ${path.basename(schemaPath)}...`);
    const validationResult = await validateSchema(schemaPath);

    if (!validationResult.valid) {
        console.log(formatValidationResult(validationResult, schemaPath));
        console.error("\nFix the schema errors above and re-run.");
        process.exit(1);
    }

    // Show warnings if any
    const warnings = validationResult.issues.filter(
        (i) => i.type === "warning",
    );
    if (warnings.length > 0) {
        console.log(formatValidationResult(validationResult, schemaPath));
    } else {
        console.log(`✓ Schema is DSQL-compatible`);
    }

    // Step 2: Generate migration using Prisma
    const fromSource = fromUrl ? "database" : "empty";
    console.log(`\nGenerating migration (from ${fromSource})...`);

    const fromArg = fromUrl ? `--from-url "${fromUrl}"` : "--from-empty";
    const prismaCmd = `npx prisma migrate diff ${fromArg} --to-schema-datamodel "${schemaPath}" --script`;

    let rawSql: string;
    try {
        rawSql = execSync(prismaCmd, {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
        });
    } catch (error: unknown) {
        const execError = error as { stderr?: string; message?: string };
        console.error("Error generating migration:");
        console.error(execError.stderr || execError.message);
        process.exit(1);
    }

    // Check if migration is empty
    if (!rawSql.trim() || rawSql.trim() === "-- This is an empty migration.") {
        console.log("\n✓ No changes detected - schema is up to date");
        process.exit(0);
    }

    // Step 3: Transform for DSQL
    console.log("Transforming for DSQL compatibility...");
    const transformResult = transformMigration(rawSql, {
        includeHeader,
        force,
    });

    // Check for unsupported statements
    if (transformResult.unsupportedStatements.length > 0 && !force) {
        console.error("\n✗ Migration contains unsupported DSQL statements:\n");
        for (const stmt of transformResult.unsupportedStatements) {
            console.error(`  ${stmt}`);
        }
        console.error("\nDSQL doesn't support ALTER TABLE DROP CONSTRAINT.");
        console.error(
            "This typically happens when Prisma regenerates primary key constraints",
        );
        console.error("even though they haven't changed.\n");
        console.error("Check your schema:");
        console.error(
            "  - If the primary key columns are the same, use --force to skip these",
        );
        console.error(
            "  - If you're actually changing the primary key, recreate the table instead",
        );
        process.exit(1);
    }

    // Ensure output directory exists
    const outputDir = path.dirname(outputFile);
    if (outputDir && !fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write output
    fs.writeFileSync(outputFile, transformResult.sql);

    console.log(
        formatTransformStats(transformResult.stats, transformResult.warnings),
    );
    console.log(`\n✓ Migration written to: ${outputFile}`);
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
  --force               Force transformation even with unsupported statements
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
    let force = false;

    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "-o" || args[i] === "--output") {
            outputFile = args[++i];
        } else if (args[i] === "--no-header") {
            includeHeader = false;
        } else if (args[i] === "--force") {
            force = true;
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
    const result = transformMigration(sql, { includeHeader, force });

    // Check for unsupported statements
    if (result.unsupportedStatements.length > 0 && !force) {
        console.error("\n✗ Migration contains unsupported DSQL statements:\n");
        for (const stmt of result.unsupportedStatements) {
            console.error(`  ${stmt}`);
        }
        console.error("\nDSQL doesn't support ALTER TABLE DROP CONSTRAINT.");
        console.error("Use --force to skip these statements.");
        process.exit(1);
    }

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
