#!/usr/bin/env bash
#
# test-happy-path.sh
#
# End-to-end test: apply all migrations with Flyway + the Aurora DSQL module,
# then verify every expected object is in place.
#
# Expected post-conditions (V1..V16), all inside $DSQL_SCHEMA:
#   - Tables users, sessions, audit_log, products, flyway_schema_history
#   - users columns: id, email, name, created_at, role, last_login_at
#   - sessions columns: id, user_id, token_hash, expires_at, created_at
#       (revoked_at dropped in V13)
#   - Indexes idx_sessions_user_id, idx_sessions_created_at,
#     idx_sessions_expires_at, each with indisvalid AND indisready true
#   - audit_log has FK on user_id -> users(id)
#   - products has CHECK constraints on price_cents and category
#   - one success=TRUE row per migration file in flyway_schema_history
#
# The migration count is derived from the migrations directory rather than
# written here, so adding a migration cannot leave this comment lying.
#
# Required env:
#   AWS_REGION
#   DSQL_ENDPOINT
# Optional env:
#   DSQL_SCHEMA   default flyway_sample
#
# Exit code: 0 on success, 1 on any assertion failure.
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
: "${DSQL_ENDPOINT:?DSQL_ENDPOINT must be set}"
DSQL_SCHEMA="${DSQL_SCHEMA:-flyway_sample}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SAMPLE_ROOT="$(dirname "$SCRIPT_DIR")"

echo "==> [test-happy] Resetting schema '$DSQL_SCHEMA' on $DSQL_ENDPOINT"
# The reset output is shown, not sent to /dev/null. It names the endpoint and
# the schema it is about to drop, which is the one thing worth reading if this
# test is ever pointed at the wrong cluster. Only the interactive prompt is
# skipped, because a test run is non-interactive by definition.
#
# The blast radius is one DROP SCHEMA CASCADE against this sample's own schema.
RESET_DB_ASSUME_YES=true bash "$SAMPLE_ROOT/scripts/reset-db.sh"

echo "==> [test-happy] Creating schema"
bash "$SAMPLE_ROOT/scripts/create-schema.sh"

echo "==> [test-happy] Running flyway migrate"
bash "$SAMPLE_ROOT/scripts/run-flyway.sh" migrate

echo "==> [test-happy] Verifying schema"
# Assign first, then export: `export PGPASSWORD="$(cmd)"` reports export's
# exit status, not the command's, so a failed token mint would be invisible
# here and surface as a confusing authentication error further down.
PGPASSWORD="$(bash "$SAMPLE_ROOT/scripts/mint-token.sh")"
export PGPASSWORD
PSQL_CONNINFO="host=$DSQL_ENDPOINT port=5432 dbname=postgres user=admin sslmode=verify-full sslrootcert=system options=-csearch_path=$DSQL_SCHEMA"

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
  if ! n=$(psql_retry "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DSQL_SCHEMA' AND table_name='$tbl';"); then
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
  if ! n=$(psql_retry "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='$DSQL_SCHEMA' AND table_name='$tbl' AND column_name='$col';"); then
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
  if ! n=$(psql_retry "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='$DSQL_SCHEMA' AND table_name='$tbl' AND column_name='$col';"); then
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

# Assert an index exists AND is usable.
#
# pg_indexes alone is not enough. Aurora DSQL builds secondary indexes
# asynchronously: the index row appears as soon as CREATE INDEX ASYNC is
# accepted, and a build that later fails leaves it in place with
# indisvalid = false. A presence check therefore passes whether the build
# succeeded or not. Checking indisvalid catches a FAILED BUILD.
#
# What this does NOT prove is that flyway.dsql.awaitAsyncIndexes did the
# waiting. V16 runs SELECT pg_sleep(60) after the last index migration, so by
# the time these assertions run the builds have had a minute to finish
# regardless of whether anything waited for them. Proving the await means
# observing the index state immediately after the migration that creates it,
# which is a different test than this one.
assert_index_valid() {
  local idx="$1"
  local row
  # The two flags are emitted as explicit words rather than relying on how
  # psql renders a boolean. Concatenating a boolean to text yields
  # 'true'/'false', while a bare boolean column prints 't'/'f'.
  if ! row=$(psql_retry "
    SELECT CASE WHEN x.indisvalid THEN 'VALID' ELSE 'INVALID' END || '/' ||
           CASE WHEN x.indisready THEN 'READY' ELSE 'NOTREADY' END
      FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
      JOIN pg_namespace n ON n.oid = i.relnamespace
     WHERE n.nspname = '$DSQL_SCHEMA' AND i.relname = '$idx';"); then
    echo "    FAIL index $idx -- psql retries exhausted"
    fail=1
    return 0
  fi
  case "$row" in
    "VALID/READY")
      echo "    OK  index $idx exists, indisvalid and indisready"
      ;;
    "")
      echo "    FAIL index $idx missing from $DSQL_SCHEMA"
      fail=1
      ;;
    *)
      echo "    FAIL index $idx present but not usable ($row)"
      echo "         An async build that failed leaves the index INVALID."
      echo "         Drop it before re-running; see limitation 3 in"
      echo "         KNOWN_LIMITATIONS.md."
      fail=1
      ;;
  esac
}

assert_constraint_count() {
  local tbl="$1" ctype="$2" expected="$3" label="$4"
  local n
  if ! n=$(psql_retry "SELECT COUNT(*) FROM pg_constraint WHERE conrelid = '$DSQL_SCHEMA.$tbl'::regclass AND contype = '$ctype';"); then
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

# Indexes. Each is built by CREATE INDEX ASYNC, so validity is the assertion
# that matters, not presence.
assert_index_valid idx_sessions_user_id
assert_index_valid idx_sessions_created_at
assert_index_valid idx_sessions_expires_at

# Constraints
assert_constraint_count audit_log f 1 FOREIGN_KEY
assert_constraint_count products c 2 CHECK

# Migration history: one successful row per migration file. Derived from the
# migrations directory rather than hard-coded, so adding a migration does not
# silently break this assertion.
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/flyway/migrations}"
expected=$(find "$MIGRATIONS_DIR" -maxdepth 1 -name 'V*__*.sql' | wc -l | tr -d ' ')
n=$(psql_retry "SELECT COUNT(*) FROM $DSQL_SCHEMA.flyway_schema_history WHERE success=TRUE;") || n="RETRY_FAILED"
if [[ "$n" == "$expected" ]]; then
  echo "    OK  $n successful migrations recorded in flyway_schema_history"
else
  echo "    FAIL expected $expected successful migrations, got '$n'"
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
