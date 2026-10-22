#!/usr/bin/env bash
#
# reset-db.sh
#
# Drop the schema this sample migrates into, with everything in it, so you can
# run `make migrate` from a clean slate.
#
# DANGEROUS: this destroys every object in the schema and all its data.
# Prompts for confirmation first.
#
# One DROP SCHEMA CASCADE, so the blast radius is exactly what this sample
# created, and it cannot drift from the migrations.
#
# Required env:
#   DSQL_ENDPOINT
#
# Optional env:
#   AWS_REGION                 default us-east-1
#   DSQL_SCHEMA                default flyway_sample
#   RESET_DB_ASSUME_YES=true   skip the confirmation prompt (for CI)

set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
: "${DSQL_ENDPOINT:?DSQL_ENDPOINT must be set}"
DSQL_SCHEMA="${DSQL_SCHEMA:-flyway_sample}"

if [[ ! "$DSQL_SCHEMA" =~ ^[a-z_][a-z0-9_]*$ ]]; then
  echo "ERROR: DSQL_SCHEMA must match ^[a-z_][a-z0-9_]*$ (got '$DSQL_SCHEMA')" >&2
  exit 1
fi

# Refuse to drop a schema that is not this sample's. public in particular is
# shared with every other sample on the cluster.
case "$DSQL_SCHEMA" in
  public|pg_catalog|information_schema|sys)
    echo "ERROR: refusing to drop the '$DSQL_SCHEMA' schema." >&2
    echo "       Set DSQL_SCHEMA to this sample's own schema." >&2
    exit 1
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cat <<WARN
==> Resetting the sample schema on $DSQL_ENDPOINT

This runs:

  DROP SCHEMA $DSQL_SCHEMA CASCADE;

which destroys every table, index and row in that schema, including
flyway_schema_history. Objects in other schemas are untouched.

WARN

if [[ "${RESET_DB_ASSUME_YES:-}" != "true" ]]; then
  read -r -p "Type 'drop' to continue: " CONFIRM
  [[ "$CONFIRM" == "drop" ]] || { echo "Aborted."; exit 1; }
fi
echo

# Capture the token separately so a mint failure surfaces here rather than
# being masked by export's exit status.
PGPASSWORD="$(bash "$SCRIPT_DIR/mint-token.sh")"
export PGPASSWORD
PSQL_CONNINFO="host=$DSQL_ENDPOINT port=5432 dbname=postgres user=admin sslmode=verify-full sslrootcert=system"

# Why the retry loop: Aurora DSQL frontend nodes can return
# "SSL SYSCALL error: EOF detected" on connection establishment -- a transient
# frontend-layer failure that resolves on retry. The Flyway JDBC Connector
# handles this transparently; raw psql does not, so this script retries
# the whole operation up to 5 times with linear backoff.
#
# CASCADE handles drop ordering, so the foreign key from audit_log to users no
# longer needs the table list to be in dependency order.
attempt=1
max_attempts=5
until psql "$PSQL_CONNINFO" -v ON_ERROR_STOP=1 -q \
        -c "DROP SCHEMA IF EXISTS $DSQL_SCHEMA CASCADE;"
do
  if (( attempt >= max_attempts )); then
    echo "ERROR: psql failed after $max_attempts attempts" >&2
    exit 1
  fi
  echo "  psql failed (attempt $attempt/$max_attempts); retrying..." >&2
  (( attempt++ ))
  sleep $(( attempt * 2 ))
done

echo
echo "==> Done. Run \`make migrate\` to re-create the schema and apply migrations."
