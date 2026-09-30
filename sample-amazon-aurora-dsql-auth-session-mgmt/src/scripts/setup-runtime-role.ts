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
// Ordering: `users` and `sessions` must already exist before this script
// runs, since GRANT … ON <table> requires the table to exist (verified
// live: it fails with `42P01 relation "users" does not exist`). Run
// `npm start` once first to apply migrations, OR run this script after
// any deploy that already migrated. The script's first action is a
// presence check on both tables; it exits early with a clear error if
// either is missing.
//
// Privilege scope: the script grants `SELECT, INSERT, UPDATE, DELETE` on
// `sessions`, which is broader than the runtime alone needs (the blog's
// production-deployment snippet shows only S/I/U because the auth flow
// soft-deletes via UPDATE revoked_at = NOW() rather than hard-deleting).
// The DELETE is here so the housekeeping job (`npm run housekeeping`)
// can purge expired/revoked rows under the same role. If you prefer
// stricter separation, split into two roles: an `app_runtime` with S/I/U
// and an `app_housekeeping` with SELECT + DELETE, and run housekeeping
// under separate credentials.
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
// guard your invocation with environment checks.
//
// Undo path: to drop the role you must first revoke its table privileges
// AND the IAM mapping. The table grants and the IAM mapping are
// independent dependencies; both block `DROP ROLE` independently with
// `2BP01 cannot be dropped because some objects depend on it`. The three
// REVOKEs can be in any order, but all must precede `DROP ROLE`:
//
//   REVOKE ALL ON users    FROM app_runtime;
//   REVOKE ALL ON sessions FROM app_runtime;
//   AWS IAM REVOKE app_runtime FROM 'arn:aws:iam::111122223333:role/auth-service-task-role';
//   DROP ROLE app_runtime;
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

/**
 * IAM role ARN regex.
 *
 * Matches `arn:aws[-partition]:iam::<12-digit-account>:role/<name>` where
 * `<name>` may contain word characters and the IAM-allowed punctuation
 * (`+ = , . @ -`). This is intentionally strict: any value that doesn't
 * match is rejected before we interpolate it into the SQL statement.
 */
const IAM_ROLE_ARN_REGEX =
  /^arn:aws[a-z-]*:iam::\d{12}:role\/[\w+=,.@-]+$/;

/**
 * PostgreSQL identifier regex (letters, digits, underscores; cannot start
 * with a digit; max 63 chars). Used to validate `APP_ROLE_NAME` before
 * interpolating it into the SQL statement, since `CREATE ROLE` and `GRANT`
 * statements cannot use parameterized identifiers.
 */
const PG_IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;

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

  if (!IAM_ROLE_ARN_REGEX.test(taskRoleArn)) {
    console.error(
      `[setup-runtime-role] APP_TASK_ROLE_ARN=${taskRoleArn} is not a ` +
        'valid IAM role ARN. Expected format: ' +
        'arn:aws:iam::<12-digit-account>:role/<name>',
    );
    process.exit(1);
  }

  // Validate role name to avoid SQL injection via env input. Role identifiers
  // must be alphanumeric or underscore, max 63 chars per PostgreSQL.
  if (!PG_IDENTIFIER_REGEX.test(roleName)) {
    console.error(
      `[setup-runtime-role] APP_ROLE_NAME=${roleName} is not a valid ` +
        'PostgreSQL identifier. Use only letters, digits, and underscores.',
    );
    process.exit(1);
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    // Precondition: the tables we're about to grant on must already exist.
    // Without this check, a deployer who runs setup-runtime-role before
    // migrations sees `42P01 relation "users" does not exist` partway
    // through the script, leaving a dangling role with no privileges.
    console.log(
      '[setup-runtime-role] verifying users and sessions tables exist ...',
    );
    try {
      await client.query('SELECT 1 FROM users LIMIT 0');
      await client.query('SELECT 1 FROM sessions LIMIT 0');
    } catch (precheckError) {
      console.error(
        '[setup-runtime-role] users or sessions table is missing. ' +
          'Run migrations first (e.g. `npm start` once, which runs ' +
          'migrations on startup) before invoking this script.',
        precheckError,
      );
      process.exit(1);
    }

    console.log(`[setup-runtime-role] creating role "${roleName}" ...`);
    await client.query(`CREATE ROLE ${roleName} WITH LOGIN`);

    console.log(
      `[setup-runtime-role] mapping IAM principal ${taskRoleArn} to ` +
        `"${roleName}" ...`,
    );
    // AWS IAM GRANT does not accept parameterized values for either the
    // role identifier or the IAM principal literal (verified live: passing
    // `$1` for the ARN raises `42601 syntax error at or near "$1"`).
    // Both inputs are validated above against strict regexes before being
    // interpolated, so this is safe against injection.
    await client.query(
      `AWS IAM GRANT ${roleName} TO '${taskRoleArn}'`,
    );

    console.log(`[setup-runtime-role] granting privileges on users ...`);
    await client.query(
      `GRANT SELECT, INSERT, UPDATE ON users TO ${roleName}`,
    );

    console.log(`[setup-runtime-role] granting privileges on sessions ...`);
    // DELETE is included so housekeeping (npm run housekeeping) can purge
    // old rows under the same role. See the script header for the
    // alternative (split runtime/housekeeping roles).
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
