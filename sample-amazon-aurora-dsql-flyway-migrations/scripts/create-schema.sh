#!/usr/bin/env bash
#
# create-schema.sh
#
# Create the dedicated schema this sample migrates into, if it is not already
# there. Idempotent, so `make migrate` can depend on it.
#
# Why this exists as a separate step rather than flyway.createSchemas=true:
# that setting does not work on Aurora DSQL. Flyway puts the CREATE SCHEMA and
# the CREATE TABLE for flyway_schema_history in one transaction, Aurora DSQL
# rejects two DDL statements in a single transaction, so nothing commits.
# Flyway retries the pair several times and then fails with
#
#   SQL State  : 3F000
#   Message    : ERROR: schema "..." does not exist
#
# which does not point at the cause at all. One CREATE SCHEMA in its own
# statement avoids the whole problem.
#
# Why a dedicated schema rather than public: the table names here are generic.
# users and sessions in particular are also created by the
# aurora-dsql-auth-session-mgmt sample, and this sample's reset drops them.
# Keeping everything in its own schema means the two can share a cluster, and
# it makes reset a single DROP SCHEMA CASCADE instead of a list of table names
# that has to be kept in step with the migrations.
#
# Required env:
#   DSQL_ENDPOINT
# Optional env:
#   AWS_REGION    default us-east-1
#   DSQL_SCHEMA   default flyway_sample
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
: "${DSQL_ENDPOINT:?DSQL_ENDPOINT must be set}"
DSQL_SCHEMA="${DSQL_SCHEMA:-flyway_sample}"

# Guard against SQL injection through the schema name, and against a name
# that would need quoting. Flyway writes it into identifiers too.
if [[ ! "$DSQL_SCHEMA" =~ ^[a-z_][a-z0-9_]*$ ]]; then
  echo "ERROR: DSQL_SCHEMA must match ^[a-z_][a-z0-9_]*$ (got '$DSQL_SCHEMA')" >&2
  exit 1
fi

# Refuse the shared and system schemas, matching scripts/reset-db.sh exactly.
#
# The guard belongs here as well as in reset-db.sh: `make migrate` depends on
# this script, so without it `DSQL_SCHEMA=public make migrate` would migrate
# into public and put the sample's generic table names where they collide with
# other samples. Guarding only the destructive script does not help if the
# creating script lets you get there.
case "$DSQL_SCHEMA" in
  public|pg_catalog|information_schema|sys)
    echo "ERROR: refusing to use the '$DSQL_SCHEMA' schema." >&2
    echo "       This sample creates generic table names (users, sessions)" >&2
    echo "       that collide with other samples, and \`make reset\` drops the" >&2
    echo "       whole schema. Set DSQL_SCHEMA to a dedicated schema." >&2
    exit 1
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Assign first, then export. `export PGPASSWORD="$(cmd)"` makes the shell see
# export's exit status rather than the command's, so a failure to mint a token
# would be silently ignored and psql would then fail with a confusing
# authentication error instead.
PGPASSWORD="$(bash "$SCRIPT_DIR/mint-token.sh")"
export PGPASSWORD
PSQL_CONNINFO="host=$DSQL_ENDPOINT port=5432 dbname=postgres user=admin sslmode=verify-full sslrootcert=system"

attempt=1
max_attempts=5
until psql "$PSQL_CONNINFO" -v ON_ERROR_STOP=1 -q \
        -c "CREATE SCHEMA IF NOT EXISTS $DSQL_SCHEMA;"
do
  if (( attempt >= max_attempts )); then
    echo "ERROR: could not create schema $DSQL_SCHEMA after $max_attempts attempts" >&2
    exit 1
  fi
  echo "  psql failed (attempt $attempt/$max_attempts); retrying..." >&2
  (( attempt++ ))
  sleep $(( attempt * 2 ))
done

echo "==> Schema '$DSQL_SCHEMA' ready on $DSQL_ENDPOINT"
