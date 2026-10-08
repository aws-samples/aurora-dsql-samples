#!/usr/bin/env bash
#
# test-occ-handling.sh
#
# Proves the shell-level OCC retry loop in scripts/migrate.sh recovers
# from a concurrent migrate race. Delegates to scripts/reproduce-occ-conflict.sh.
#
# Required env:
#   AWS_REGION
#   DSQL_ENDPOINT
#
# Exit code: 0 on success, 1 on failure.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POC_ROOT="$(dirname "$SCRIPT_DIR")"

echo "==> [test-occ] Reproducing OCC conflict (two parallel migrate.sh runs)"
bash "$POC_ROOT/scripts/reproduce-occ-conflict.sh"
rc=$?

if (( rc == 0 )); then
  echo
  echo "==> [test-occ] PASS: both runs completed; retry loop recovered the race."
  exit 0
else
  echo
  echo "==> [test-occ] FAIL: at least one run exhausted its retry budget."
  echo "    Inspect tmp/occ/*.log for details."
  exit 1
fi
