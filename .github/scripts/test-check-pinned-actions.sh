#!/bin/bash

# Runs check-pinned-actions.sh against small workflow trees, so the references
# it must reject are tested as well as the ones in this repository.

set -euo pipefail

SHA=3d3c42e5aac5ba805825da76410c181273ba90b1
DIGEST=sha256:ffe35a0d42974c19da37b3fb5ca1ff1e781ae6dffaf80164568129a2714eca61
SELF=aws-samples/aurora-dsql-samples/.github/workflows
CHECK="$(cd "$(dirname "$0")" && pwd)/check-pinned-actions.sh"
FAILURES=0

# check <pass|fail> <file under .github> <file contents>
check() {
  local expected=$1 file=$2 contents=$3 tree actual
  tree=$(mktemp -d)
  mkdir -p "$tree/.github/scripts" "$tree/.github/workflows" "$(dirname "$tree/.github/$file")"
  cp "$CHECK" "$tree/.github/scripts/"
  printf '%s\n' "$contents" > "$tree/.github/$file"
  if "$tree/.github/scripts/check-pinned-actions.sh" > /dev/null 2>&1; then
    actual=pass
  else
    actual=fail
  fi
  rm -rf "$tree"
  if [ "$actual" != "$expected" ]; then
    echo "FAIL: expected $expected, got $actual: $file: $contents"
    FAILURES=$((FAILURES + 1))
  fi
}

check pass workflows/a.yml "      - uses: actions/checkout@$SHA # v7.0.1"
check pass workflows/a.yml "      - uses: 'actions/checkout@$SHA' # v7.0.1"
check pass workflows/a.yml "      - uses: \"actions/checkout@$SHA\""
check pass workflows/a.yml "    uses: other/repo/.github/workflows/ci.yml@$SHA # v1.0.0"
check pass workflows/a.yml "    uses: $SELF/ci-gate.yml@main"
check pass workflows/a.yml "    uses: ./.github/workflows/gitleaks-scan.yml"
check pass workflows/a.yml "      - uses: ./"
check pass workflows/a.yml "      uses: docker://zricethezav/gitleaks@$DIGEST # v7.4.0"
check pass workflows/a.yml "      # - uses: actions/checkout@v7"
check pass workflows/a.yml "      - run: echo ok # this step uses: actions/checkout@v7"
check pass dependabot.yml "version: 2"
check pass workflows/a.yml "    uses: $SELF/ci-gate.yaml@main"

check fail workflows/a.yml "      - uses: actions/checkout@v7"
check fail workflows/a.yml "      - uses: 'actions/checkout@v7.0.1'"
check fail workflows/a.yml "      - uses: actions/checkout@main"
check fail workflows/a.yml "      - uses: actions/checkout@${SHA:0:7}"
check fail workflows/a.yml "      - uses: actions/checkout@${SHA^^}"
check fail workflows/a.yml "      - uses: actions/checkout@${SHA}0"
check fail workflows/a.yml "      - uses: actions/checkout@$SHA#v7.0.1"
check fail workflows/a.yml "      - uses: actions/checkout"
check fail workflows/a.yml "      uses: docker://zricethezav/gitleaks:v7.4.0"
check fail workflows/a.yml "    uses: other/repo/.github/workflows/ci.yml@main"
check fail workflows/a.yml "    uses: $SELF/ci-gate.yml@feature"
check fail workflows/a.yml "    uses: $SELF/ci-gate.yml@main-old"
check fail workflows/a.yml "      - uses: $SELF/helper@main"
check fail workflows/a.yml "      - \"uses\": actions/checkout@v7"
check fail workflows/a.yml "      - {uses: actions/checkout@v7}"
check fail workflows/a.yml "      - {name: Checkout, uses: actions/checkout@v7}"
check fail workflows/a.yml "    steps: [uses: actions/checkout@v7]"
check fail workflows/a.yml "      - uses : actions/checkout@v7"
check fail actions/setup/action.yml "    - uses: actions/checkout@v7"
check fail actions/setup/action.yaml "    - uses: actions/checkout@v7"
check fail workflows/a.yml "    uses: other/aurora-dsql-samples/.github/workflows/ci-gate.yml@main"
check fail workflows/a.yml "    uses: aws-samples/other/.github/workflows/ci-gate.yml@main"
check fail workflows/a.yml "    uses: aws-samples/aurora-dsql-samples-fork/.github/workflows/ci-gate.yml@main"
check fail workflows/a.yml "    uses: aws-samples/aurora-dsql-samples/ci-gate.yml@main"
check fail workflows/a.yml "    uses: $SELF/sub/ci-gate.yml@main"
check fail workflows/a.yml "      - 'uses': actions/checkout@v7"
check fail workflows/a.yml "    steps: [{uses: actions/checkout@$SHA }, {uses: actions/checkout@v7}]"
check fail workflows/a.yml "      uses: docker://zricethezav/gitleaks@${DIGEST:0:19}"

# grep reports unreadable files, and the check must not treat that as a pass.
if [ "$(id -u)" -ne 0 ]; then
  tree=$(mktemp -d)
  mkdir -p "$tree/.github/scripts" "$tree/.github/workflows"
  cp "$CHECK" "$tree/.github/scripts/"
  echo "      - uses: actions/checkout@$SHA # v7.0.1" > "$tree/.github/workflows/a.yml"
  chmod 000 "$tree/.github/workflows/a.yml"
  if "$tree/.github/scripts/check-pinned-actions.sh" > /dev/null 2>&1; then
    echo "FAIL: expected fail, got pass: unreadable workflow"
    FAILURES=$((FAILURES + 1))
  fi
  rm -rf "$tree"
fi

if [ "$FAILURES" -gt 0 ]; then
  exit 1
fi

echo "check-pinned-actions.sh accepted and rejected every case as expected."
