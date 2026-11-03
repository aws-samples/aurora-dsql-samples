#!/bin/bash

# Fails when a workflow uses an action by a tag or branch instead of a
# full-length commit SHA, or a docker:// image without a digest. Tags and
# branches can be moved to different code after review. Local ./ actions and
# this repository's reusable workflows on main are reviewed here, so they are
# exempt.

set -euo pipefail

cd "$(dirname "$0")/../.."

# Also find quoted and flow-style uses keys, and accept only the plain
# `uses: <ref>` form, so those styles can't skip the check.
USES_KEY="(^[[:space:]]*(-[[:space:]]*)?|[{,[][[:space:]]*)[\"']?uses[\"']?[[:space:]]*:"
ALLOWED="^[^:]+:[0-9]+:[[:space:]]*(-[[:space:]]*)?uses:[[:space:]]*[\"']?("
ALLOWED+="\./[^[:space:]\"']*"
ALLOWED+="|aws-samples/aurora-dsql-samples/\.github/workflows/[^/@[:space:]\"']+\.ya?ml@main"
ALLOWED+="|docker://[^@[:space:]\"']+@sha256:[0-9a-f]{64}"
ALLOWED+="|[A-Za-z0-9_.-]+/[^@[:space:]\"']+@[0-9a-f]{40}"
ALLOWED+=")[\"']?([[:space:]]|$)"

# grep exits 1 when nothing matches; any other failure must fail the check.
USES=$(grep -rnE --include='*.yml' --include='*.yaml' "$USES_KEY" .github) || [ $? -eq 1 ]
UNPINNED=$(grep -vE "$ALLOWED" <<<"$USES") || [ $? -eq 1 ]

if [ -n "$UNPINNED" ]; then
  echo "Pin each of these to a full-length commit SHA, written as \`uses: <ref> # <version>\`:"
  echo "$UNPINNED"
  exit 1
fi

echo "All actions are pinned to full-length commit SHAs."
