#!/usr/bin/env bash
#
# verify-schema.sh
#
# Inspect the Aurora DSQL cluster after a migration run:
#   1. List tables in the public schema.
#   2. Show flyway_schema_history (Flyway's own tracking table).
#   3. Show the state of secondary indexes.
#
# Required env:
#   AWS_REGION       - region of the DSQL cluster (default: us-east-1)
#   DSQL_ENDPOINT    - cluster endpoint hostname
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
: "${DSQL_ENDPOINT:?DSQL_ENDPOINT must be set}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export PGPASSWORD="$(bash "$SCRIPT_DIR/mint-token.sh")"
PSQL_CONNINFO="host=$DSQL_ENDPOINT port=5432 dbname=postgres user=admin sslmode=verify-full sslrootcert=system"

echo
echo "=== Tables in schema 'public' ==="
psql "$PSQL_CONNINFO" -c "
  SELECT table_name
    FROM information_schema.tables
   WHERE table_schema = 'public'
   ORDER BY table_name;
"

echo
echo "=== flyway_schema_history ==="
psql "$PSQL_CONNINFO" -c "
  SELECT installed_rank, version, description, type, success, execution_time
    FROM flyway_schema_history
   ORDER BY installed_rank;
" 2>/dev/null || echo "(flyway_schema_history not present yet; run \`make migrate\` first)"

echo
echo "=== Secondary indexes ==="
psql "$PSQL_CONNINFO" -c "
  SELECT schemaname, tablename, indexname, indexdef
    FROM pg_indexes
   WHERE schemaname = 'public'
   ORDER BY tablename, indexname;
"
