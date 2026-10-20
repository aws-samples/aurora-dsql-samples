#!/usr/bin/env bash
#
# test-occ-handling.sh
#
# Demonstrate what happens when two `flyway migrate` runs race against one
# Aurora DSQL cluster. Delegates to scripts/reproduce-occ-conflict.sh.
#
# This is a demonstration, not a pass/fail test, and it is deliberately not
# part of `make test`. The outcome is not deterministic: sometimes one run
# applies the migrations and the other recovers, sometimes both fail and the
# schema needs `flyway repair`. Either outcome is the lesson, which is that
# concurrent migration runs are unsafe here and no retry setting makes them
# safe. Serialize them in your pipeline.
#
# What it does NOT prove: that a retry recovers the race. It does not. See
# limitation 2 in KNOWN_LIMITATIONS.md.
#
# Required env:
#   AWS_REGION
#   DSQL_ENDPOINT
# Optional env:
#   DSQL_SCHEMA   default flyway_sample
#
# Exit code: 0 if the race was reproduced and the schema state was reported,
# 1 if the reproduction itself could not be set up.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SAMPLE_ROOT="$(dirname "$SCRIPT_DIR")"

echo "==> [test-occ] Racing two parallel \`flyway migrate\` runs"
echo "    Non-deterministic by design. Read the summary below, not the exit code."
echo

# `|| rc=$?` is required. Under `set -e` a non-zero exit from the script below
# would terminate this one immediately, so the reporting after it never ran and
# the branch that handles failure was dead code.
rc=0
bash "$SAMPLE_ROOT/scripts/reproduce-occ-conflict.sh" || rc=$?

echo
case "$rc" in
  0)
    echo "==> [test-occ] Both runs exited 0."
    echo "    One of them did the work; the other found the migrations already"
    echo "    applied. This is the lucky interleaving, not proof of safety."
    ;;
  1)
    echo "==> [test-occ] At least one run failed. This is the documented"
    echo "    failure mode, and the point of the exercise."
    echo "    Recover with: make repair && make migrate"
    echo "    If a failed CREATE INDEX ASYNC is involved, drop the index first;"
    echo "    see limitation 3 in KNOWN_LIMITATIONS.md."
    ;;
  2)
    echo "==> [test-occ] SETUP FAILED: the reproduction could not be prepared," >&2
    echo "    so nothing was raced and nothing was demonstrated." >&2
    exit 1
    ;;
  *)
    echo "==> [test-occ] Unexpected exit $rc from the reproduction script." >&2
    exit 1
    ;;
esac

echo "    Logs: tmp/occ/*.log"
exit 0
