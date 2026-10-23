#!/usr/bin/env bash
#
# race-report.sh
#
# Report the state of the sample's schema, for scripts/reproduce-occ-conflict.sh
# to call before and after it races two migrate runs.
#
# This runs INSIDE the container, because that is where psql and the IAM token
# minting live. reproduce-occ-conflict.sh itself runs on the host so it can
# start two containers in parallel, and the host has no psql, so a psql call
# made from there silently fails and would report "0 of 16 applied, 0 failed
# rows" for a race that had plainly left a failed migration behind.
#
# Output is one key=value pair per line, for the caller to read with `eval` or
# grep:
#
#   history_exists=1
#   applied=2
#   failed=1
#   invalid_indexes=1
#
# Plus a human-readable dump of flyway_schema_history on stderr.
#
# Required env:
#   DSQL_ENDPOINT
# Optional env:
#   AWS_REGION    default us-east-1
#   DSQL_SCHEMA   default flyway_sample
set -uo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
: "${DSQL_ENDPOINT:?DSQL_ENDPOINT must be set}"
DSQL_SCHEMA="${DSQL_SCHEMA:-flyway_sample}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PGPASSWORD="$(bash "$SCRIPT_DIR/mint-token.sh")"
export PGPASSWORD
CONN="host=$DSQL_ENDPOINT port=5432 dbname=postgres user=admin sslmode=verify-full sslrootcert=system"

# Every query distinguishes "no rows" from "could not connect". A connection
# failure must not be reported as a count of zero, which is the mistake this
# script exists to avoid.
q() { # sql -> prints value, returns non-zero if psql itself failed
  psql "$CONN" -tAc "$1" 2>/dev/null
}

HISTORY_EXISTS=0
if n=$(q "SELECT COUNT(*) FROM information_schema.tables
           WHERE table_schema='$DSQL_SCHEMA' AND table_name='flyway_schema_history';"); then
  [[ "$n" == "1" ]] && HISTORY_EXISTS=1
else
  echo "race-report: could not query the cluster" >&2
  echo "query_failed=1"
  exit 1
fi

APPLIED=0
FAILED=0
if (( HISTORY_EXISTS == 1 )); then
  # No `|| APPLIED=0` fallback: a failed query must report query_failed=1, not
  # a count of zero, which would be indistinguishable from a clean schema.
  if ! APPLIED=$(q "SELECT COUNT(*) FROM $DSQL_SCHEMA.flyway_schema_history WHERE success=TRUE;"); then
    echo "race-report: could not count applied migrations" >&2
    echo "query_failed=1"
    exit 1
  fi
  if ! FAILED=$(q "SELECT COUNT(*) FROM $DSQL_SCHEMA.flyway_schema_history WHERE success=FALSE;"); then
    echo "race-report: could not count failed migrations" >&2
    echo "query_failed=1"
    exit 1
  fi
  {
    echo "    Schema history:"
    psql "$CONN" -tAc "
      SELECT '      v' || COALESCE(version,'-') || ' | ' || description ||
             ' | success=' || success
        FROM $DSQL_SCHEMA.flyway_schema_history
       ORDER BY installed_rank;" 2>/dev/null
  } >&2
else
  echo "    Schema history: table does not exist" >&2
fi

if ! INVALID=$(q "SELECT COUNT(*) FROM pg_index x
                    JOIN pg_class i ON i.oid = x.indexrelid
                    JOIN pg_namespace n ON n.oid = i.relnamespace
                   WHERE n.nspname = '$DSQL_SCHEMA' AND NOT x.indisvalid;"); then
  echo "race-report: could not count invalid indexes" >&2
  echo "query_failed=1"
  exit 1
fi

echo "query_failed=0"
echo "history_exists=$HISTORY_EXISTS"
echo "applied=${APPLIED:-0}"
echo "failed=${FAILED:-0}"
echo "invalid_indexes=${INVALID:-0}"
