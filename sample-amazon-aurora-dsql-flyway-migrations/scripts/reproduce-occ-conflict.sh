#!/usr/bin/env bash
#
# reproduce-occ-conflict.sh
#
# Force an Aurora DSQL OCC conflict by running two `make migrate`
# processes in parallel against the same cluster. Captures the output
# of each run so the OCC behaviour is backed by real log output
# to show.
#
# This demonstrates a failure mode. It is not a test with a passing
# expectation, because the outcome is not deterministic:
#
#   - Usually one run applies the migrations and the other sees a conflict
#     on the flyway_schema_history insert (SQLSTATE 23505) or an OCC
#     conflict (SQLSTATE 40001).
#   - Sometimes BOTH runs fail and the schema needs `flyway repair`.
#
# Either outcome is the point: concurrent migrate runs are unsafe on Aurora
# DSQL and no retry setting fixes that. Serialize them in your pipeline.
# See limitation 2 in KNOWN_LIMITATIONS.md.
#
# Required env:
#   AWS_REGION
#   DSQL_ENDPOINT
# Optional env:
#   DSQL_SCHEMA   default flyway_sample
#
# Exit codes:
#   0  the race ran and left a complete, consistent schema
#   1  the race ran and left work undone (the documented failure mode)
#   2  setup failed, so no race happened and no conclusion can be drawn

set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
: "${DSQL_ENDPOINT:?DSQL_ENDPOINT must be set}"
DSQL_SCHEMA="${DSQL_SCHEMA:-flyway_sample}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SAMPLE_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$SAMPLE_ROOT/tmp/occ"
mkdir -p "$LOG_DIR"

# This script runs on the host and drives containers, so it needs its own
# handle on docker compose rather than the Makefile's.
COMPOSE="${COMPOSE:-docker compose}"

A_LOG="$LOG_DIR/race-A-$(date +%s).log"
B_LOG="$LOG_DIR/race-B-$(date +%s).log"

echo "==> Starting two parallel \`make migrate\` runs against $DSQL_ENDPOINT"
echo "    Logs:"
echo "      A: $A_LOG"
echo "      B: $B_LOG"
echo

echo "==> Resetting schema so both runs have real work to do"
# A failed reset must abort, with exit 2 to mark it as a setup failure rather
# than a raced outcome. This previously ended in `>/dev/null 2>&1 || true`,
# which meant a reset that could not connect left the schema fully migrated.
# Both runs then had nothing to do, both exited 0, and the script reported
# success without ever racing anything.
if ! ( cd "$SAMPLE_ROOT" && RESET_DB_ASSUME_YES=true make reset ) >/tmp/occ-reset.log 2>&1; then
  echo "ERROR: reset failed, so there is no pending work to race." >&2
  echo "       Not reporting a result from a race that did not happen." >&2
  sed 's/^/       /' /tmp/occ-reset.log >&2
  exit 2
fi

echo "==> Creating the schema both runs will migrate into"
if ! ( cd "$SAMPLE_ROOT" && make create-schema ) >/tmp/occ-schema.log 2>&1; then
  echo "ERROR: could not create schema $DSQL_SCHEMA." >&2
  sed 's/^/       /' /tmp/occ-schema.log >&2
  exit 2
fi

# Confirm there really is pending work. If the history table already shows
# migrations applied, the race cannot happen and a clean result would mean
# nothing.
#
# This script runs on the HOST, so it can start two containers in parallel.
# The host has no psql and no boto3, so every cluster query has to go through
# the container. scripts/race-report.sh does that and reports whether the
# query itself failed, so a connection problem cannot masquerade as a count
# of zero.
report() { # -> sets query_failed, history_exists, applied, failed, invalid_indexes
  local out
  out=$( ( cd "$SAMPLE_ROOT" && $COMPOSE run --rm -T flyway \
             bash scripts/race-report.sh ) 2>/tmp/occ-report-stderr ) || true
  cat /tmp/occ-report-stderr >&2
  if ! grep -q '^query_failed=0' <<<"$out"; then
    return 1
  fi
  eval "$(grep -E '^(history_exists|applied|failed|invalid_indexes)=' <<<"$out")"
  return 0
}

if ! report; then
  echo "ERROR: could not read the schema state, so the race cannot be judged." >&2
  exit 2
fi
PENDING=$(find "$SAMPLE_ROOT/migrations" -maxdepth 1 -name 'V*__*.sql' | wc -l | tr -d ' ')
echo "==> Pending migrations: $PENDING (already applied: $applied)"
if (( applied > 0 )); then
  echo "ERROR: schema is not empty after reset, so the race would be a no-op." >&2
  exit 2
fi

(
  cd "$SAMPLE_ROOT"
  make migrate
) >"$A_LOG" 2>&1 &
PID_A=$!

(
  cd "$SAMPLE_ROOT"
  make migrate
) >"$B_LOG" 2>&1 &
PID_B=$!

echo "==> Both runs started (A: $PID_A, B: $PID_B). Waiting..."
# `|| RC=$?` is required: under `set -e` a non-zero `wait` would exit the
# script here, before the OCC outcome below is ever reported. A non-zero exit
# from one of the runs is the interesting case, not a reason to abort.
RC_A=0
wait "$PID_A" || RC_A=$?
RC_B=0
wait "$PID_B" || RC_B=$?

echo
echo "==> Run A exit code: $RC_A"
echo "==> Run B exit code: $RC_B"
echo
echo "    Tail of A log (last 20 lines):"
tail -n 20 "$A_LOG" | sed 's/^/      /'
echo
echo "    Tail of B log (last 20 lines):"
tail -n 20 "$B_LOG" | sed 's/^/      /'

# Report what the schema actually looks like afterwards. Exit codes alone do
# not distinguish "the migrations are all applied and consistent" from "one run
# bailed out and left a failed row behind", and the second is the case worth
# seeing.
echo "    State after the race:"
if ! report; then
  echo "ERROR: could not read the schema state after the race." >&2
  exit 2
fi

echo
echo "    Applied successfully : $applied of $PENDING"
echo "    Failed history rows  : $failed"
echo "    INVALID indexes      : $invalid_indexes"

# The interesting assertion is about the schema, not the exit codes. Two runs
# can both exit 0 and still leave the schema short of the full migration set.
if (( RC_A == 0 && RC_B == 0 && applied == PENDING && failed == 0 && invalid_indexes == 0 )); then
  echo
  echo "==> Both runs exited 0 and the schema is complete and consistent."
  echo "    This is the benign interleaving: one run applied the migrations"
  echo "    and the other found them already recorded. It is NOT evidence"
  echo "    that the retry makes concurrent runs safe. Run it again and you"
  echo "    may well get the failure instead."
  exit 0
fi

echo
echo "==> The race left work undone. This is the documented failure mode."
if (( failed != 0 )); then
  echo "    There is a failed row in flyway_schema_history, so the next"
  echo "    migrate will refuse to run until you \`make repair\`."
fi
if (( invalid_indexes != 0 )); then
  echo "    An index is INVALID. repair + migrate alone will NOT fix this:"
  echo "    the re-run hits CREATE INDEX ASYNC IF NOT EXISTS, Aurora DSQL"
  echo "    skips the build because the invalid index already exists, no"
  echo "    job_id comes back, and awaitAsyncIndexes fails the migration"
  echo "    again. Drop the index explicitly first. See limitation 3."
fi
echo "    Serialize migration runs in your pipeline. See limitation 2 in"
echo "    KNOWN_LIMITATIONS.md."
exit 1
