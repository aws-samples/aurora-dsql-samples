// ---------------------------------------------------------------------------
// Setup Runtime Database Role
// ---------------------------------------------------------------------------
//
// One-shot setup script that creates a least-privilege Aurora DSQL database
// role for the application runtime, maps an IAM principal to it, and grants
// the minimum privileges the auth service needs on `users` and `sessions`.
//
// The default behavior of `connection.ts` is to connect as `admin`, which
// gives the application far more authority than it needs. Per Aurora DSQL's
// "Database roles and IAM authentication" guidance, production deployments
// should use a custom role that maps to the runtime IAM principal (your
// ECS task role, Lambda execution role, etc.) and has only the privileges
// the workload requires.
//
// This script runs the SQL the blog post walks through in the "Production
// deployment" section, packaged so you can execute it once during
// environment setup rather than copy-pasting from the blog.
//
// Usage (from the repo root):
//   AWS_REGION=us-east-1 \
//   DSQL_ENDPOINT=<cluster-id>.dsql.us-east-1.on.aws \
//   APP_ROLE_NAME=app_runtime \
//   APP_TASK_ROLE_ARN=arn:aws:iam::111122223333:role/auth-service-task-role \
//   ts-node src/scripts/setup-runtime-role.ts
//
// Idempotency: this script uses CREATE ROLE / GRANT statements that fail
// if the role already exists. Re-run only after dropping the role, or
// guard your invocation with environment checks. The blog and README both
// note this is a one-off setup step, not part of the regular DDL migration.
//
// Required environment:
//   DSQL_ENDPOINT      - cluster endpoint (e.g. abc.dsql.us-east-1.on.aws)
//   APP_ROLE_NAME      - DB role to create (default: app_runtime)
//   APP_TASK_ROLE_ARN  - IAM principal ARN to map to the DB role
//   AWS_REGION         - region the cluster lives in
//   AWS_*              - admin credentials (must be able to CREATE ROLE
//                        and AWS IAM GRANT)
// ---------------------------------------------------------------------------

import { closePool, getPool } from '../db/connection';

const DEFAULT_ROLE_NAME = 'app_runtime';

async function main(): Promise<void> {
  const roleName = process.env.APP_ROLE_NAME ?? DEFAULT_ROLE_NAME;
  const taskRoleArn = process.env.APP_TASK_ROLE_ARN;

  if (!taskRoleArn) {
    console.error(
      '[setup-runtime-role] APP_TASK_ROLE_ARN is required. Set it to the ' +
        'IAM principal ARN that should map to the runtime DB role ' +
        '(e.g. arn:aws:iam::123456789012:role/auth-service-task-role).',
    );
    process.exit(1);
  }

  // Validate role name to avoid SQL injection via env input. Role identifiers
  // must be alphanumeric or underscore, max 63 chars per PostgreSQL.
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(roleName)) {
    console.error(
      `[setup-runtime-role] APP_ROLE_NAME=${roleName} is not a valid ` +
        'PostgreSQL identifier. Use only letters, digits, and underscores.',
    );
    process.exit(1);
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    console.log(`[setup-runtime-role] creating role "${roleName}" ...`);
    await client.query(`CREATE ROLE ${roleName} WITH LOGIN`);

    console.log(
      `[setup-runtime-role] mapping IAM principal ${taskRoleArn} to ` +
        `"${roleName}" ...`,
    );
    // AWS IAM GRANT cannot use a parameterized role identifier; the role
    // name has been validated above to ensure it's a safe identifier.
    await client.query(
      `AWS IAM GRANT ${roleName} TO $1`,
      [taskRoleArn],
    );

    console.log(`[setup-runtime-role] granting privileges on users ...`);
    await client.query(
      `GRANT SELECT, INSERT, UPDATE ON users TO ${roleName}`,
    );

    console.log(`[setup-runtime-role] granting privileges on sessions ...`);
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO ${roleName}`,
    );

    console.log(
      `[setup-runtime-role] done. The application can now connect as ` +
        `user "${roleName}" using the dsql:DbConnect IAM permission.`,
    );
  } finally {
    client.release();
    await closePool();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[setup-runtime-role] failed:', error);
    process.exit(1);
  });
}
