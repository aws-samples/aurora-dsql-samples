#!/usr/bin/env bash
#
# bulk-seed-sessions.sh
#
# Insert N rows into sessions in batches, so later migrations (CREATE INDEX
# ASYNC in particular) have real data to work against.
#
# DSQL's per-transaction mutation cap: up to 10,000 row changes per
# transaction (and smaller for some operations). We insert in batches of
# 2000 to stay well under the cap and keep per-batch latency reasonable.
#
# Required env:
#   AWS_REGION
#   DSQL_ENDPOINT
# Optional env:
#   TOTAL_ROWS   - rows to add (default 10000)
#   BATCH_SIZE   - rows per transaction (default 2000)
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
: "${DSQL_ENDPOINT:?DSQL_ENDPOINT must be set}"
TOTAL_ROWS="${TOTAL_ROWS:-10000}"
BATCH_SIZE="${BATCH_SIZE:-2000}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export PGPASSWORD="$(bash "$SCRIPT_DIR/mint-token.sh")"
PSQL_CONNINFO="host=$DSQL_ENDPOINT port=5432 dbname=postgres user=admin sslmode=verify-full sslrootcert=system"

echo "==> Bulk-seeding $TOTAL_ROWS session rows ($BATCH_SIZE per batch)"

NUM_BATCHES=$(( TOTAL_ROWS / BATCH_SIZE ))
START=$(date +%s)

PER_USER=$(( BATCH_SIZE / 50 ))

for ((batch = 1; batch <= NUM_BATCHES; batch++)); do
  attempt=1
  LAST_ERR=""
  while (( attempt <= 5 )); do
    LAST_ERR=$(psql "$PSQL_CONNINFO" -v ON_ERROR_STOP=1 -q <<SQL 2>&1
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
)
    if [[ $? -eq 0 ]] && [[ -z "$LAST_ERR" ]]; then
      break
    fi
    (( attempt++ ))
    sleep $attempt
  done
  if (( attempt > 5 )); then
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
