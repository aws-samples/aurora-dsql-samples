#!/usr/bin/env bash
#
# setup-db.sh -- one-time database bootstrap, run as the DSQL `admin` role.
# Run once after deploy.sh, from AWS CloudShell (psql and Node are available).
#
#   DSQL_ENDPOINT=<cluster>.dsql.<region>.on.aws AWS_REGION=us-east-1 \
#     scripts/setup-db.sh
#
# It:
#   1. Creates the CRM tables and async indexes (as admin) via the migration runner.
#   2. Creates the least-privilege `app_runtime` role, maps the ECS task role's
#      IAM ARN to it, and grants only the table privileges the service needs.
#
# The application then connects as `app_runtime` (dsql:DbConnect), never admin.
#
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
STATE_FILE="$SCRIPT_DIR/.state.env"
[[ -f "$STATE_FILE" ]] && source "$STATE_FILE" || true

: "${DSQL_ENDPOINT:?Set DSQL_ENDPOINT (or run deploy.sh first)}"
: "${TASK_ROLE_ARN:?TASK_ROLE_ARN not found in state; run deploy.sh first}"

# Validate the ARN before handing it to psql. A typo here would otherwise be
# reported by the database as a syntax error part-way through the script.
if [[ ! "$TASK_ROLE_ARN" =~ ^arn:aws[a-zA-Z-]*:iam::[0-9]{12}:role/.+$ ]]; then
  echo "ERROR: TASK_ROLE_ARN is not a valid IAM role ARN:" >&2
  echo "  $TASK_ROLE_ARN" >&2
  echo "Expected arn:aws:iam::<12-digit-account>:role/<name>" >&2
  exit 1
fi

# --- 1. Create tables and indexes as admin -------------------------------
echo "==> Running migrations as admin"
( cd "$PROJECT_DIR" && npm install --silent && \
  DSQL_ENDPOINT="$DSQL_ENDPOINT" DSQL_USER=admin AWS_REGION="$REGION" npm run migrate )

# --- 2. Create the least-privilege runtime role --------------------------
echo "==> Creating app_runtime role and grants"
ADMIN_TOKEN="$(aws dsql generate-db-connect-admin-auth-token \
  --hostname "$DSQL_ENDPOINT" --region "$REGION" --expires-in 3600)"

# Create the role only if it is absent, so the rest of the script can run under
# ON_ERROR_STOP=1 and a genuine failure actually stops it. Previously this ran
# with ON_ERROR_STOP=0 to tolerate "role already exists", which also meant a
# bad endpoint or ARN produced a wall of errors followed by "complete".
ROLE_EXISTS="$(PGSSLMODE=require PGPASSWORD="$ADMIN_TOKEN" psql \
  --host "$DSQL_ENDPOINT" --username admin --dbname postgres \
  -v ON_ERROR_STOP=1 -tAc \
  "SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime'")"

if [[ "$ROLE_EXISTS" != "1" ]]; then
  echo "    creating role app_runtime"
  PGSSLMODE=require PGPASSWORD="$ADMIN_TOKEN" psql \
    --host "$DSQL_ENDPOINT" --username admin --dbname postgres \
    -v ON_ERROR_STOP=1 -c "CREATE ROLE app_runtime WITH LOGIN"
else
  echo "    role app_runtime already exists"
fi

# Grant only the privileges the service actually exercises. No endpoint deletes
# a record, so DELETE is not granted anywhere. Per table:
#   tenants       SELECT  tenantContext checks the tenant exists and is active
#                 INSERT  seed script, and the opt-in tenant admin route
#   users         SELECT  verifying that an opportunity owner_id is in-tenant
#   accounts      SELECT, INSERT
#   contacts      SELECT, INSERT
#   opportunities SELECT, INSERT, UPDATE  (stage transitions)
#   activities    SELECT, INSERT, UPDATE  (bulk complete)
PGSSLMODE=require PGPASSWORD="$ADMIN_TOKEN" psql \
  --host "$DSQL_ENDPOINT" --username admin --dbname postgres -v ON_ERROR_STOP=1 <<SQL
AWS IAM GRANT app_runtime TO '${TASK_ROLE_ARN}';
GRANT SELECT, INSERT         ON tenants       TO app_runtime;
GRANT SELECT                 ON users         TO app_runtime;
GRANT SELECT, INSERT         ON accounts      TO app_runtime;
GRANT SELECT, INSERT         ON contacts      TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON opportunities TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON activities    TO app_runtime;
SQL

echo "Database bootstrap complete. The service can now connect as app_runtime."
