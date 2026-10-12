#!/usr/bin/env bash
#
# reset-db.sh
#
# Drop every object the sample's migrations and Flyway created, so you can
# run `make migrate` from a clean slate.
#
# DANGEROUS: drops the tables listed below, several of which have generic
# names that collide with other samples in this repository. Prompts for
# confirmation first. Only run against a cluster dedicated to this sample.
#
# Required env:
#   AWS_REGION
#   DSQL_ENDPOINT
#
# Optional env:
#   RESET_DB_ASSUME_YES=true   skip the confirmation prompt (for CI)

set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
: "${DSQL_ENDPOINT:?DSQL_ENDPOINT must be set}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cat <<WARN
==> Resetting the sample schema on $DSQL_ENDPOINT

This drops the following tables if they exist:

  audit_log  sessions  products  users  flyway_schema_history

Several of those names are generic. In particular, users and sessions are
also created by the aurora-dsql-auth-session-mgmt sample. If this cluster
hosts anything other than this sample, those tables and all their data will
be destroyed.

Only continue against a cluster dedicated to this sample.
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

# Pipe every DROP into a SINGLE psql invocation. One connection, one TLS
# handshake, one IAM auth.
#
# Why the retry loop: Aurora DSQL frontend nodes can return
# "SSL SYSCALL error: EOF detected" on connection establishment -- a transient
# frontend-layer failure that resolves on retry. The Flyway JDBC Connector
# handles this transparently; raw psql does not, so this script retries
# the whole operation up to 5 times with linear backoff.
#
# Table order matters: child tables (that hold FKs to others) must drop
# before parents. The dependency graph is:
#   audit_log → users (FK)
# Everything else is independent. If you add new tables with FKs, add
# them above their parents in this list.
attempt=1
max_attempts=5
until psql "$PSQL_CONNINFO" -v ON_ERROR_STOP=1 <<'SQL'
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS flyway_schema_history;
SQL
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
echo "==> Done. Run \`make migrate\` to re-apply migrations."
