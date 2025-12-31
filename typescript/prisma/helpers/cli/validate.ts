/**
 * Aurora DSQL Schema Validator for Prisma
 *
 * Validates Prisma schemas for DSQL compatibility and reports issues.
 *
 * MAINTENANCE NOTE: These checks are based on DSQL limitations documented at:
 * https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-unsupported-features.html
 *
 * If DSQL adds support for any of these features, update this validator and the README table.
 */
import * as fs from "fs";
import * as path from "path";

export interface ValidationIssue {
    type: "error" | "warning";
    message: string;
    line?: number;
    suggestion?: string;
}

export interface ValidationResult {
    valid: boolean;
    issues: ValidationIssue[];
}

/**
 * Validates a Prisma schema file for Aurora DSQL compatibility.
 */
export async function validateSchema(
    schemaPath: string,
): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];

    if (!fs.existsSync(schemaPath)) {
        return {
            valid: false,
            issues: [
                {
                    type: "error",
                    message: `Schema file not found: ${schemaPath}`,
                },
            ],
        };
    }

    const schemaContent = fs.readFileSync(schemaPath, "utf-8");
    const lines = schemaContent.split("\n");

    // Check for relationMode = "prisma"
    checkRelationMode(schemaContent, lines, issues);

    // Check for autoincrement()
    checkAutoincrement(lines, issues);

    // Check for @id fields without UUID
    checkIdFields(lines, issues);

    // Check for unsupported features
    checkUnsupportedFeatures(lines, issues);

    return {
        valid: issues.filter((i) => i.type === "error").length === 0,
        issues,
    };
}

function checkRelationMode(
    content: string,
    lines: string[],
    issues: ValidationIssue[],
): void {
    const hasDatasource = content.includes("datasource");
    const hasRelationMode = /relationMode\s*=\s*["']prisma["']/.test(content);

    if (hasDatasource && !hasRelationMode) {
        // Find the datasource block line
        const datasourceLine = lines.findIndex((l) => l.includes("datasource"));
        issues.push({
            type: "error",
            message: 'Missing relationMode = "prisma" in datasource block',
            line: datasourceLine + 1,
            suggestion:
                'Add relationMode = "prisma" to your datasource block. DSQL does not support foreign key constraints.',
        });
    }
}

function checkAutoincrement(lines: string[], issues: ValidationIssue[]): void {
    lines.forEach((line, index) => {
        if (line.includes("autoincrement()")) {
            issues.push({
                type: "error",
                message: "autoincrement() is not supported in DSQL",
                line: index + 1,
                suggestion:
                    'Use @default(dbgenerated("gen_random_uuid()")) @db.Uuid instead',
            });
        }
    });
}

function checkIdFields(lines: string[], issues: ValidationIssue[]): void {
    lines.forEach((line, index) => {
        // Check if line has @id but uses Int type (common mistake)
        if (
            line.includes("@id") &&
            /\bInt\b/.test(line) &&
            !line.includes("autoincrement")
        ) {
            issues.push({
                type: "warning",
                message: "Int @id field without autoincrement may cause issues",
                line: index + 1,
                suggestion:
                    "Consider using String @id with UUID for DSQL compatibility",
            });
        }

        // Check for @id with String but missing @db.Uuid
        if (
            line.includes("@id") &&
            /\bString\b/.test(line) &&
            line.includes("gen_random_uuid") &&
            !line.includes("@db.Uuid")
        ) {
            issues.push({
                type: "warning",
                message:
                    "@id field using gen_random_uuid() should have @db.Uuid",
                line: index + 1,
                suggestion: "Add @db.Uuid to ensure proper UUID storage",
            });
        }
    });
}

function checkUnsupportedFeatures(
    lines: string[],
    issues: ValidationIssue[],
): void {
    lines.forEach((line, index) => {
        // Check for @db.Serial (sequences not supported)
        if (line.includes("@db.Serial")) {
            issues.push({
                type: "error",
                message: "@db.Serial is not supported in DSQL (no sequences)",
                line: index + 1,
                suggestion: "Use @db.Uuid with gen_random_uuid() instead",
            });
        }

        // Check for @@fulltext (not supported)
        if (line.includes("@@fulltext")) {
            issues.push({
                type: "error",
                message: "@@fulltext indexes are not supported in DSQL",
                line: index + 1,
            });
        }

        // Check for @db.SmallSerial, @db.BigSerial (sequences not supported)
        if (
            line.includes("@db.SmallSerial") ||
            line.includes("@db.BigSerial")
        ) {
            issues.push({
                type: "error",
                message:
                    "Serial types are not supported in DSQL (no sequences)",
                line: index + 1,
                suggestion: "Use @db.Uuid with gen_random_uuid() instead",
            });
        }

        // Check for BigInt @id (common pattern that won't work without sequences)
        if (line.includes("@id") && /\bBigInt\b/.test(line)) {
            issues.push({
                type: "warning",
                message:
                    "BigInt @id typically requires sequences which DSQL does not support",
                line: index + 1,
                suggestion:
                    "Consider using String @id with UUID for DSQL compatibility",
            });
        }
    });
}

/**
 * Formats validation results for console output.
 */
export function formatValidationResult(
    result: ValidationResult,
    schemaPath: string,
): string {
    const lines: string[] = [];
    const fileName = path.basename(schemaPath);

    if (result.issues.length === 0) {
        lines.push(`✓ ${fileName}: Schema is DSQL-compatible`);
        return lines.join("\n");
    }

    lines.push(`Validating ${fileName}...`);
    lines.push("");

    for (const issue of result.issues) {
        const icon = issue.type === "error" ? "✗" : "⚠";
        const lineInfo = issue.line ? ` (line ${issue.line})` : "";
        lines.push(`${icon} ${issue.message}${lineInfo}`);
        if (issue.suggestion) {
            lines.push(`  → ${issue.suggestion}`);
        }
    }

    lines.push("");
    const errorCount = result.issues.filter((i) => i.type === "error").length;
    const warningCount = result.issues.filter(
        (i) => i.type === "warning",
    ).length;

    if (errorCount > 0) {
        lines.push(
            `✗ Validation failed: ${errorCount} error(s), ${warningCount} warning(s)`,
        );
    } else {
        lines.push(`⚠ Validation passed with ${warningCount} warning(s)`);
    }

    return lines.join("\n");
}
