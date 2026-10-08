#!/usr/bin/env bash
#
# run-flyway.sh
#
# Wraps the Flyway CLI with Aurora DSQL-specific defaults:
#   - Points at the config at /flyway/conf/flyway.conf (built from
#     flyway.conf.example if not present), with the cluster hostname
#     substituted from DSQL_ENDPOINT.
#   - Points at the migrations volume at /flyway/migrations.
#   - Retries on non-zero exit, which covers OCC errors (SQLSTATE 40001)
#     if Flyway's own lockRetryCount isn't enough.
#
# No manual IAM token minting is needed: the flyway-dsql-ext extension
# installed in /flyway/drivers/ delegates connection setup to the
# Aurora DSQL JDBC Connector, which auto-mints a 15-minute token from
# the ambient AWS credentials for every new connection.
#
# Usage:
#   bash scripts/run-flyway.sh migrate            # apply pending migrations
#   bash scripts/run-flyway.sh info               # show migration status
#   bash scripts/run-flyway.sh validate
#
# Required env:
#   DSQL_ENDPOINT    - cluster endpoint hostname
#
# Optional env:
#   AWS_REGION       - default: us-east-1 (also encoded in the hostname)
#   FLYWAY_RETRY     - shell-level retry budget on OCC errors (default: 3)
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
: "${DSQL_ENDPOINT:?DSQL_ENDPOINT must be set}"
FLYWAY_RETRY="${FLYWAY_RETRY:-3}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POC_ROOT="$(dirname "$SCRIPT_DIR")"

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
    cp "$POC_ROOT/flyway.conf.example" "$FLYWAY_CONF"
  fi
  sed -i -e "s/REPLACE-WITH-YOUR-CLUSTER\.dsql\.us-east-1\.on\.aws/$DSQL_ENDPOINT/g" "$FLYWAY_CONF" 2>/dev/null || true
fi

# Only retry on errors Flyway + Aurora DSQL raises transiently:
#   - SQLSTATE 40001          OCC serialization conflict (OC000, OC001)
#   - SQLSTATE 23505          duplicate key on flyway_schema_history
#                             (installed_rank race between parallel runs)
#   - "security token ... is expired"  IAM token aged out between retries
# Anything else (syntax errors, unsupported SQL, missing migration file,
# config error) is terminal -- retrying just wastes time and clutters output.
is_retryable() {
  local log="$1"
  grep -qE 'SQL State  : 40001|SQL State  : 23505|change conflicts with another transaction|duplicate key value violates unique constraint "flyway_schema_history_pkey"|security token.*is expired' "$log"
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
