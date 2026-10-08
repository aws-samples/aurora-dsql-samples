#!/usr/bin/env bash
#
# reproduce-occ-conflict.sh
#
# Force an Aurora DSQL OCC conflict by running two `make migrate`
# processes in parallel against the same cluster. Captures the output
# of each run so the blog's OCC-handling section has real log output
# to show.
#
# Expectation:
#   - Both runs complete cleanly.
#   - One of them picks up the migrations first; the other sees an
#     OCC conflict on the dsql_migration_history insert (SQLSTATE 40001)
#     and the shell retry loop recovers it.
#
# Required env:
#   AWS_REGION
#   DSQL_ENDPOINT

set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
: "${DSQL_ENDPOINT:?DSQL_ENDPOINT must be set}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POC_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$POC_ROOT/tmp/occ"
mkdir -p "$LOG_DIR"

A_LOG="$LOG_DIR/race-A-$(date +%s).log"
B_LOG="$LOG_DIR/race-B-$(date +%s).log"

echo "==> Starting two parallel \`make migrate\` runs against $DSQL_ENDPOINT"
echo "    Logs:"
echo "      A: $A_LOG"
echo "      B: $B_LOG"
echo

echo "==> Resetting schema so both runs have real work to do"
( cd "$POC_ROOT" && make reset ) >/dev/null 2>&1 || true

(
  cd "$POC_ROOT"
  make migrate
) >"$A_LOG" 2>&1 &
PID_A=$!

(
  cd "$POC_ROOT"
  make migrate
) >"$B_LOG" 2>&1 &
PID_B=$!

echo "==> Both runs started (A: $PID_A, B: $PID_B). Waiting..."
wait "$PID_A"
RC_A=$?
wait "$PID_B"
RC_B=$?

echo
echo "==> Run A exit code: $RC_A"
echo "==> Run B exit code: $RC_B"
echo
echo "    Tail of A log (last 20 lines):"
tail -n 20 "$A_LOG" | sed 's/^/      /'
echo
echo "    Tail of B log (last 20 lines):"
tail -n 20 "$B_LOG" | sed 's/^/      /'

if (( RC_A == 0 && RC_B == 0 )); then
  echo
  echo "==> SUCCESS: both runs exited cleanly. OCC retry handled the race."
  exit 0
elif (( RC_A == 0 || RC_B == 0 )); then
  echo
  echo "==> PARTIAL: one run failed after the retry budget was exhausted."
  echo "    Increase OCC_RETRY and rerun."
  exit 1
else
  echo
  echo "==> FAILURE: both runs failed. Inspect the logs."
  exit 1
fi
