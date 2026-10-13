#!/usr/bin/env bash
#
# seed-data.sh
#
# Populate users and sessions with representative data so later migrations
# can be tested against a non-empty schema. Idempotent -- re-running is safe.
#
# Required env:
#   AWS_REGION
#   DSQL_ENDPOINT
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
: "${DSQL_ENDPOINT:?DSQL_ENDPOINT must be set}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export PGPASSWORD="$(bash "$SCRIPT_DIR/mint-token.sh")"
PSQL_CONNINFO="host=$DSQL_ENDPOINT port=5432 dbname=postgres user=admin sslmode=verify-full sslrootcert=system"

echo "==> Seeding data (50 users, ~200 sessions)"

# Retry on the known DSQL frontend transient (SSL SYSCALL error: EOF detected).
attempt=1
max_attempts=5
until psql "$PSQL_CONNINFO" -v ON_ERROR_STOP=1 <<'SQL'
-- Insert 50 users (idempotent via ON CONFLICT on email)
INSERT INTO users (id, email, name)
SELECT
  gen_random_uuid(),
  'user' || n || '@example.com',
  'Test User ' || n
FROM generate_series(1, 50) AS t(n)
ON CONFLICT (email) DO NOTHING;

-- Insert ~4 sessions per user with varied created_at timestamps.
-- DSQL doesn't have `gen_random_bytes`; use md5(random()::text) which
-- gives a 32-char hex string that fits sessions.token_hash VARCHAR(64).
INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
SELECT
  gen_random_uuid(),
  u.id,
  md5(random()::text || clock_timestamp()::text),
  NOW() + INTERVAL '7 days',
  NOW() - (random() * INTERVAL '30 days')
FROM users u
CROSS JOIN generate_series(1, 4) AS s(n);

SELECT COUNT(*) AS users_count FROM users;
SELECT COUNT(*) AS sessions_count FROM sessions;
SQL
do
  if (( attempt >= max_attempts )); then
    echo "ERROR: psql failed after $max_attempts attempts" >&2
    exit 1
  fi
  echo "  psql failed (attempt $attempt/$max_attempts); retrying..." >&2
  (( attempt++ ))
  sleep $(( attempt * 2 ))
done

echo
echo "==> Seed complete"
