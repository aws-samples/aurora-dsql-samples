#!/usr/bin/env bash
#
# run-flyway.sh
#
# Wraps the Flyway CLI with Aurora DSQL-specific defaults:
#   - Points at the config at /flyway/conf/flyway.conf (built from
#     flyway.conf.example if not present), with the cluster hostname
#     substituted from DSQL_ENDPOINT.
#   - Points at the migrations volume at /flyway/migrations.
#   - Retries the whole Flyway invocation on the one failure a retry can
#     fix: the schema-history primary key race between two parallel runs.
#
# Transaction-level OCC conflicts are handled inside Flyway by the Aurora
# DSQL module via flyway.dsql.occMaxRetries, not here. See limitation 2 in
# KNOWN_LIMITATIONS.md: neither retry makes concurrent runs safe, so
# serialize migrations in your pipeline.
#
# No manual IAM token minting is needed. The official Flyway Aurora DSQL
# module in /flyway/drivers/ connects through the Aurora DSQL JDBC
# Connector, which mints a 15-minute token from the ambient AWS
# credentials on every new connection.
#
# Usage: prefer `make migrate`. It creates the schema first, via
# scripts/create-schema.sh, which this script does not do. Invoked directly
# against a cluster where the schema does not exist yet, Flyway fails with
# SQLSTATE 3F000, schema does not exist.
#
#   make migrate                                  # apply pending migrations
#   make info                                     # show migration status
#   make validate
#
# Required env:
#   DSQL_ENDPOINT    - cluster endpoint hostname
#
# Optional env:
#   AWS_REGION       - default: us-east-1 (also encoded in the hostname)
#   FLYWAY_RETRY     - total attempts on the schema-history PK race (default: 3)
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
: "${DSQL_ENDPOINT:?DSQL_ENDPOINT must be set}"
FLYWAY_RETRY="${FLYWAY_RETRY:-3}"
# A budget below 1 would skip the loop entirely and never invoke Flyway.
(( FLYWAY_RETRY >= 1 )) || FLYWAY_RETRY=1
DSQL_SCHEMA="${DSQL_SCHEMA:-flyway_sample}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SAMPLE_ROOT="$(dirname "$SCRIPT_DIR")"

# Resolve the config path. Inside the container the config lives on a
# read-only mount, so if we don't already have a per-run copy at /tmp,
# build one from the example and sed the host into place.
if [[ -z "${FLYWAY_CONF:-}" ]]; then
  if [[ -f "/flyway/conf/flyway.conf" ]]; then
    FLYWAY_CONF="/tmp/flyway.conf"
    cp /flyway/conf/flyway.conf "$FLYWAY_CONF"
  elif [[ -f "/flyway/conf/flyway.conf.example" ]]; then
    FLYWAY_CONF="/tmp/flyway.conf"
    cp /flyway/conf/flyway.conf.example "$FLYWAY_CONF"
  else
    FLYWAY_CONF="/tmp/flyway.conf"
    cp "$SAMPLE_ROOT/flyway.conf.example" "$FLYWAY_CONF"
  fi
  sed -i -e "s/REPLACE-WITH-YOUR-CLUSTER\.dsql\.us-east-1\.on\.aws/$DSQL_ENDPOINT/g" \
         -e "s/REPLACE-WITH-YOUR-SCHEMA/$DSQL_SCHEMA/g" "$FLYWAY_CONF" 2>/dev/null || true
fi

# Retry only the schema-history PK race between parallel runs: the loser's
# history insert fails before its transaction commits, so it leaves no row,
# and a fresh invocation re-reads the history and carries on.
#
# A 40001 is not retried. The module records the migration before it commits,
# so a failed commit can leave it marked successful, and a re-run would report
# "up to date" over a change that never committed. Observed on a live cluster:
# a migration doing `UPDATE t SET v = v + 1000` then `pg_sleep(8)`, raced by a
# writer touching the same row, exhausted occMaxRetries and exited 1 with
# SQLSTATE 40001; the retry here then reported "up to date" and exited 0, while
# flyway_schema_history held that version with success = t and the +1000 was
# never applied. An expired-credentials error is not retried either: the same
# credentials fail the same way.
#
# Anything else (syntax errors, unsupported SQL, missing migration file,
# config error) is terminal; retrying just wastes time and clutters output.
#
# Retrying does NOT make concurrent migrate runs safe. A race can leave a
# failed migration that needs `flyway repair`, which no retry here will fix.
# See limitation 2 in KNOWN_LIMITATIONS.md.
#
# The match is deliberately narrow. A bare "SQL State : 23505" would also match
# a genuine unique-constraint violation in a migration, for example a seed
# insert colliding on a user table's unique index. That is a defect in the
# migration, not a transient conflict, and retrying it hides the cause.
is_retryable() {
  grep -q 'duplicate key value violates unique constraint "flyway_schema_history_pkey"' "$1"
}

LOG_DIR="${LOG_DIR:-/tmp/flyway-logs}"
mkdir -p "$LOG_DIR"

attempt=1
while (( attempt <= FLYWAY_RETRY )); do
  LOG_FILE="$LOG_DIR/flyway-$$-$attempt.log"
  echo "==> flyway $* (attempt $attempt/$FLYWAY_RETRY)"
  if flyway -configFiles="$FLYWAY_CONF" "$@" 2>&1 | tee "$LOG_FILE"; then
    exit 0
  fi
  rc=${PIPESTATUS[0]}

  if ! is_retryable "$LOG_FILE"; then
    echo "==> Flyway exited $rc with a non-retryable error; stopping." >&2
    exit "$rc"
  fi

  if (( attempt >= FLYWAY_RETRY )); then
    break
  fi

  echo "==> Flyway exited $rc (retryable); backing off before retry" >&2
  sleep $(( attempt * 2 ))
  (( attempt++ ))
done

echo "ERROR: Flyway failed after $FLYWAY_RETRY attempts" >&2
exit 1
