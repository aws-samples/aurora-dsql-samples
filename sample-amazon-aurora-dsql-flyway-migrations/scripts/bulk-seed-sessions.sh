#!/usr/bin/env bash
#
# bulk-seed-sessions.sh
#
# Insert N rows into sessions in batches, so later migrations (CREATE INDEX
# ASYNC in particular) have real data to work against.
#
# Aurora DSQL caps a single transaction at 3,000 modified rows, 10 MiB of
# modified data, and 5 minutes of wall clock. We insert 1000 rows per batch,
# which leaves headroom on the row count and keeps each batch well inside the
# time and size limits too.
#
# Required env:
#   AWS_REGION
#   DSQL_ENDPOINT
# Optional env:
#   TOTAL_ROWS   - rows to add (default 10000)
#   BATCH_SIZE   - rows per transaction (default 1000; must stay under 3000)
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
: "${DSQL_ENDPOINT:?DSQL_ENDPOINT must be set}"
DSQL_SCHEMA="${DSQL_SCHEMA:-flyway_sample}"
TOTAL_ROWS="${TOTAL_ROWS:-10000}"
BATCH_SIZE="${BATCH_SIZE:-1000}"

if (( BATCH_SIZE >= 3000 )); then
  echo "ERROR: BATCH_SIZE=$BATCH_SIZE is at or above the Aurora DSQL 3,000 row per-transaction cap" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Assign first, then export. `export PGPASSWORD="$(cmd)"` reports export's
# exit status rather than the command's, so a failed token mint would be
# swallowed and show up later as an authentication error instead.
PGPASSWORD="$(bash "$SCRIPT_DIR/mint-token.sh")"
export PGPASSWORD
PSQL_CONNINFO="host=$DSQL_ENDPOINT port=5432 dbname=postgres user=admin sslmode=verify-full sslrootcert=system options=-csearch_path=$DSQL_SCHEMA"

# Every batch derives its rows from the users table, so with no users this
# inserts nothing and would otherwise report success.
USERS=$(psql "$PSQL_CONNINFO" -tAc "SELECT COUNT(*) FROM users")
if (( USERS == 0 )); then
  echo "ERROR: no users in $DSQL_SCHEMA; run scripts/seed-data.sh first" >&2
  exit 1
fi

echo "==> Bulk-seeding $TOTAL_ROWS session rows ($BATCH_SIZE per batch)"

NUM_BATCHES=$(( TOTAL_ROWS / BATCH_SIZE ))
START=$(date +%s)

PER_USER=$(( BATCH_SIZE / 50 ))

for ((batch = 1; batch <= NUM_BATCHES; batch++)); do
  attempt=1
  ok=0
  LAST_ERR=""
  while (( attempt <= 5 )); do
    # The assignment has to be the `if` condition. A bare
    # `LAST_ERR=$(psql ...)` takes psql's exit status, which under `set -e`
    # ends the script on the first failure, before the retry can run.
    if LAST_ERR=$(psql "$PSQL_CONNINFO" -v ON_ERROR_STOP=1 -q <<SQL 2>&1
INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
SELECT
  gen_random_uuid(),
  u.id,
  md5(random()::text || clock_timestamp()::text || n::text),
  NOW() + INTERVAL '7 days',
  NOW() - (random() * INTERVAL '60 days')
FROM users u
CROSS JOIN generate_series(1, $PER_USER) AS t(n);
SQL
    ); then
      ok=1
      break
    fi
    (( attempt++ ))
    sleep $attempt
  done
  if (( ok == 0 )); then
    echo "ERROR: batch $batch failed after 5 attempts" >&2
    echo "Last error: $LAST_ERR" >&2
    exit 1
  fi
  echo "  batch $batch/$NUM_BATCHES done ($(( batch * BATCH_SIZE )) rows)"
done

END=$(date +%s)
echo "==> Insert loop done in $(( END - START ))s"
echo
echo "==> Final sessions row count:"
attempt=1
while (( attempt <= 5 )); do
  if psql "$PSQL_CONNINFO" -c "SELECT COUNT(*) AS sessions_count FROM sessions;" 2>&1; then
    exit 0
  fi
  (( attempt++ ))
  sleep 1
done
exit 1
