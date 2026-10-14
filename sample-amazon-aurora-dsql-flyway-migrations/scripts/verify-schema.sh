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
#   DSQL_SCHEMA      - schema to inspect (default: flyway_sample)
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
: "${DSQL_ENDPOINT:?DSQL_ENDPOINT must be set}"
DSQL_SCHEMA="${DSQL_SCHEMA:-flyway_sample}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Assign first, then export. `export PGPASSWORD="$(cmd)"` reports export's
# exit status, not the command's, so a failed token mint would pass unnoticed
# and surface later as an authentication error.
PGPASSWORD="$(bash "$SCRIPT_DIR/mint-token.sh")"
export PGPASSWORD
PSQL_CONNINFO="host=$DSQL_ENDPOINT port=5432 dbname=postgres user=admin sslmode=verify-full sslrootcert=system options=-csearch_path=$DSQL_SCHEMA"

echo
echo "=== Tables in schema '$DSQL_SCHEMA' ==="
psql "$PSQL_CONNINFO" -c "
  SELECT table_name
    FROM information_schema.tables
   WHERE table_schema = '$DSQL_SCHEMA'
   ORDER BY table_name;
"

echo
echo "=== flyway_schema_history ==="
psql "$PSQL_CONNINFO" -c "
  SELECT installed_rank, version, description, type, success, execution_time
    FROM $DSQL_SCHEMA.flyway_schema_history
   ORDER BY installed_rank;
" 2>/dev/null || echo "(flyway_schema_history not present yet; run \`make migrate\` first)"

echo
echo "=== Secondary indexes ==="
# indisvalid and indisready come from pg_index, and matter here: a
# CREATE INDEX ASYNC build that failed leaves the index listed in pg_indexes
# but with indisvalid = false, so presence alone proves nothing.
psql "$PSQL_CONNINFO" -c "
  SELECT n.nspname   AS schema,
         t.relname   AS table,
         i.relname   AS index,
         x.indisvalid,
         x.indisready
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = i.relnamespace
   WHERE n.nspname = '$DSQL_SCHEMA'
   ORDER BY t.relname, i.relname;
"
