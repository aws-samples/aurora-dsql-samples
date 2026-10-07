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

# --- 1. Create tables and indexes as admin -------------------------------
echo "==> Running migrations as admin"
( cd "$PROJECT_DIR" && npm install --silent && \
  DSQL_ENDPOINT="$DSQL_ENDPOINT" DSQL_USER=admin AWS_REGION="$REGION" npm run migrate )

# --- 2. Create the least-privilege runtime role --------------------------
echo "==> Creating app_runtime role and grants"
ADMIN_TOKEN="$(aws dsql generate-db-connect-admin-auth-token \
  --hostname "$DSQL_ENDPOINT" --region "$REGION" --expires-in 3600)"

# CREATE ROLE / GRANT are idempotent-tolerant here: re-running is harmless and
# "already exists" style errors are ignored with ON_ERROR_STOP off for setup.
PGSSLMODE=require PGPASSWORD="$ADMIN_TOKEN" psql \
  --host "$DSQL_ENDPOINT" --username admin --dbname postgres -v ON_ERROR_STOP=0 <<SQL
CREATE ROLE app_runtime WITH LOGIN;
AWS IAM GRANT app_runtime TO '${TASK_ROLE_ARN}';
GRANT SELECT, INSERT, UPDATE, DELETE ON tenants       TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON users         TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounts      TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON contacts      TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON opportunities TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON activities    TO app_runtime;
SQL

echo "Database bootstrap complete. The service can now connect as app_runtime."
