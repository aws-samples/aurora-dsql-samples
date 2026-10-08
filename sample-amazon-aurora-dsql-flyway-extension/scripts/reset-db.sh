#!/usr/bin/env bash
#
# reset-db.sh
#
# Drop every object the POC migrations and Flyway created, so you can
# run `make migrate` from a clean slate.
#
# DANGEROUS: unconditionally drops the users, sessions, demo_products,
# demo_orders tables and the flyway_schema_history. Only safe to run
# against a dedicated development cluster.
#
# Required env:
#   AWS_REGION
#   DSQL_ENDPOINT

set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
: "${DSQL_ENDPOINT:?DSQL_ENDPOINT must be set}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Resetting POC schema on $DSQL_ENDPOINT (DANGEROUS)"
echo

export PGPASSWORD="$(bash "$SCRIPT_DIR/mint-token.sh")"
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
# before parents. The POC's dependency graph is:
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
DROP TABLE IF EXISTS demo_orders;
DROP TABLE IF EXISTS demo_products;
DROP TABLE IF EXISTS flyway_schema_history;
DROP TABLE IF EXISTS dsql_migration_history;
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
