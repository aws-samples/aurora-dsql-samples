#!/usr/bin/env bash
#
# test-happy-path.sh
#
# End-to-end test: apply all migrations with Flyway + the DSQL extension,
# then verify every expected object is in place.
#
# Expected post-conditions (V1..V15):
#   - Tables users, sessions, audit_log, products, flyway_schema_history
#   - users columns: id, email, name, created_at, role, last_login_at
#   - sessions columns: id, user_id, token_hash, expires_at, created_at
#       (revoked_at dropped in V13)
#   - Indexes: idx_sessions_user_id, idx_sessions_created_at, idx_sessions_expires_at
#   - audit_log has FK on user_id -> users(id)
#   - products has CHECK constraints on price_cents and category
#   - flyway_schema_history has 15 success=TRUE rows
#
# Required env:
#   AWS_REGION
#   DSQL_ENDPOINT
#
# Exit code: 0 on success, 1 on any assertion failure.
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
: "${DSQL_ENDPOINT:?DSQL_ENDPOINT must be set}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POC_ROOT="$(dirname "$SCRIPT_DIR")"

echo "==> [test-happy] Resetting schema"
bash "$POC_ROOT/scripts/reset-db.sh" >/dev/null

echo "==> [test-happy] Running flyway migrate (via extension)"
bash "$POC_ROOT/scripts/run-flyway.sh" migrate

echo "==> [test-happy] Verifying schema"
export PGPASSWORD="$(bash "$POC_ROOT/scripts/mint-token.sh")"
PSQL_CONNINFO="host=$DSQL_ENDPOINT port=5432 dbname=postgres user=admin sslmode=verify-full sslrootcert=system"

# psql against DSQL frontend occasionally returns "SSL SYSCALL error: EOF
# detected" on connection establishment -- transient, resolves on retry.
# Every verify query goes through this helper so one flaky connection
# doesn't fail the whole test.
psql_retry() {
  local sql="$1"
  local attempt=0
  local out rc
  while (( attempt < 10 )); do
    out=$(psql "$PSQL_CONNINFO" -tAc "$sql" 2>&1)
    rc=$?
    if (( rc == 0 )); then
      echo "$out"
      return 0
    fi
    (( attempt++ ))
    sleep $(( attempt < 3 ? 1 : 3 ))
  done
  echo "RETRIES_EXHAUSTED: $out" >&2
  return 1
}

fail=0

assert_table() {
  local tbl="$1"
  local n
  if ! n=$(psql_retry "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='$tbl';"); then
    echo "    FAIL table $tbl -- psql retries exhausted"
    fail=1
    return 0
  fi
  if [[ "$n" == "1" ]]; then
    echo "    OK  table $tbl exists"
  else
    echo "    FAIL table $tbl missing (got '$n')"
    fail=1
  fi
}

assert_column() {
  local tbl="$1" col="$2"
  local n
  if ! n=$(psql_retry "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='$tbl' AND column_name='$col';"); then
    echo "    FAIL $tbl.$col -- psql retries exhausted"
    fail=1
    return 0
  fi
  if [[ "$n" == "1" ]]; then
    echo "    OK  $tbl.$col exists"
  else
    echo "    FAIL $tbl.$col missing (got '$n')"
    fail=1
  fi
}

assert_no_column() {
  local tbl="$1" col="$2"
  local n
  if ! n=$(psql_retry "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='$tbl' AND column_name='$col';"); then
    echo "    FAIL $tbl.$col -- psql retries exhausted"
    fail=1
    return 0
  fi
  if [[ "$n" == "0" ]]; then
    echo "    OK  $tbl.$col removed"
  else
    echo "    FAIL $tbl.$col still exists (got '$n')"
    fail=1
  fi
}

assert_index() {
  local idx="$1"
  local n
  if ! n=$(psql_retry "SELECT COUNT(*) FROM pg_indexes WHERE indexname='$idx';"); then
    echo "    FAIL index $idx -- psql retries exhausted"
    fail=1
    return 0
  fi
  if [[ "$n" == "1" ]]; then
    echo "    OK  index $idx exists"
  else
    echo "    FAIL index $idx missing (got '$n')"
    fail=1
  fi
}

assert_constraint_count() {
  local tbl="$1" ctype="$2" expected="$3" label="$4"
  local n
  if ! n=$(psql_retry "SELECT COUNT(*) FROM pg_constraint WHERE conrelid = '$tbl'::regclass AND contype = '$ctype';"); then
    echo "    FAIL $tbl $label -- psql retries exhausted"
    fail=1
    return 0
  fi
  if [[ "$n" == "$expected" ]]; then
    echo "    OK  $tbl has $expected $label constraint(s)"
  else
    echo "    FAIL $tbl expected $expected $label constraint(s), got '$n'"
    fail=1
  fi
}

# Tables
assert_table users
assert_table sessions
assert_table audit_log
assert_table products
assert_table flyway_schema_history

# users columns (last_login_at added in V8)
assert_column users id
assert_column users email
assert_column users name
assert_column users created_at
assert_column users role
assert_column users last_login_at

# sessions columns (revoked_at dropped in V13)
assert_column sessions id
assert_column sessions user_id
assert_column sessions token_hash
assert_column sessions expires_at
assert_column sessions created_at
assert_no_column sessions revoked_at

# products: name was renamed to product_name in V14
assert_column products product_name
assert_no_column products name

# Indexes
assert_index idx_sessions_user_id
assert_index idx_sessions_created_at
assert_index idx_sessions_expires_at

# Constraints
assert_constraint_count audit_log f 1 FOREIGN_KEY
assert_constraint_count products c 2 CHECK

# Migration history: expect 15 rows all success
n=$(psql_retry "SELECT COUNT(*) FROM flyway_schema_history WHERE success=TRUE;") || n="RETRY_FAILED"
if [[ "$n" == "15" ]]; then
  echo "    OK  15 successful migrations recorded in flyway_schema_history"
else
  echo "    FAIL expected 15 successful migrations, got '$n'"
  fail=1
fi

if (( fail == 0 )); then
  echo
  echo "==> [test-happy] PASS"
  exit 0
else
  echo
  echo "==> [test-happy] FAIL"
  exit 1
fi
