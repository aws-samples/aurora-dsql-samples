#!/usr/bin/env bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
#
# test-api.sh - Smoke test all Booking API endpoints.
#
# Usage:
#   ./test-api.sh [api-endpoint]
#
# Example:
#   ./test-api.sh http://localhost:8000
#   ./test-api.sh https://my-deploy.deno.dev
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
API="${1:-http://localhost:8000}"
API="${API%/}" # strip trailing slash

PASS=0
FAIL=0
BOOKING_ID=""

green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
bold()  { printf "\033[1m%s\033[0m\n" "$*"; }

# assert_status <test-name> <expected-status> <actual-status> <body>
assert_status() {
  local name="$1" expected="$2" actual="$3" body="$4"
  if [[ "$actual" == "$expected" ]]; then
    green "  PASS: $name (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    red "  FAIL: $name — expected HTTP $expected, got HTTP $actual"
    red "        $body"
    FAIL=$((FAIL + 1))
  fi
}

# call <method> <path> [json-body]
# Sets RESP_STATUS and RESP_BODY
call() {
  local method="$1" path="$2" body="${3:-}"
  local url="${API}${path}"
  local args=(-s -w "\n%{http_code}" -X "$method")
  if [[ -n "$body" ]]; then
    args+=(-H "Content-Type: application/json" -d "$body")
  fi
  local raw
  raw=$(curl "${args[@]}" "$url")
  RESP_STATUS=$(echo "$raw" | tail -1)
  RESP_BODY=$(echo "$raw" | sed '$d')
}

# extract a field from JSON (requires python3)
json_field() {
  echo "$1" | python3 -c "import sys,json; print(json.load(sys.stdin)$2)"
}

bold "============================================="
bold "  Booking API — Smoke Tests"
bold "  Endpoint: $API"
bold "============================================="
echo

# ---------------------------------------------------------------------------
# 0. Health check
# ---------------------------------------------------------------------------
bold "0. Health Check"
call GET /health
assert_status "GET /health" 200 "$RESP_STATUS" "$RESP_BODY"
echo

# ---------------------------------------------------------------------------
# 1. Create a booking
# ---------------------------------------------------------------------------
bold "1. Create a Booking"
call POST /bookings '{"resource_name":"Conference Room A","start_time":"2025-06-15T09:00:00Z","end_time":"2025-06-15T10:00:00Z","booked_by":"alice"}'
assert_status "POST /bookings (create)" 201 "$RESP_STATUS" "$RESP_BODY"
BOOKING_ID=$(json_field "$RESP_BODY" "['id']")
echo "  Booking ID: $BOOKING_ID"
echo

# ---------------------------------------------------------------------------
# 2. List bookings
# ---------------------------------------------------------------------------
bold "2. List Bookings"
call GET /bookings
assert_status "GET /bookings (list)" 200 "$RESP_STATUS" "$RESP_BODY"
COUNT=$(echo "$RESP_BODY" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
echo "  Booking count: $COUNT"
echo

# ---------------------------------------------------------------------------
# 3. Get booking by ID
# ---------------------------------------------------------------------------
bold "3. Get Booking by ID"
call GET "/bookings/$BOOKING_ID"
assert_status "GET /bookings/:id (get)" 200 "$RESP_STATUS" "$RESP_BODY"
RESOURCE=$(json_field "$RESP_BODY" "['resource_name']")
echo "  Resource: $RESOURCE"
echo

# ---------------------------------------------------------------------------
# 4. Update the booking
# ---------------------------------------------------------------------------
bold "4. Update Booking"
call PUT "/bookings/$BOOKING_ID" '{"end_time":"2025-06-15T11:00:00Z","booked_by":"bob"}'
assert_status "PUT /bookings/:id (update)" 200 "$RESP_STATUS" "$RESP_BODY"
UPDATED_BY=$(json_field "$RESP_BODY" "['booked_by']")
echo "  Updated booked_by: $UPDATED_BY"
echo

# ---------------------------------------------------------------------------
# 5. Overlap conflict
# ---------------------------------------------------------------------------
bold "5. Overlap Conflict"
call POST /bookings '{"resource_name":"Conference Room A","start_time":"2025-06-15T10:00:00Z","end_time":"2025-06-15T11:30:00Z","booked_by":"charlie"}'
assert_status "POST /bookings (overlap conflict)" 409 "$RESP_STATUS" "$RESP_BODY"
echo

# ---------------------------------------------------------------------------
# 6. Concurrent OCC (Optimistic Concurrency Control) test
# ---------------------------------------------------------------------------
bold "6. Concurrent OCC Test"
echo "  Creating a booking for OCC Test Room (14:00-15:00)..."
call POST /bookings '{"resource_name":"OCC Test Room","start_time":"2025-06-20T14:00:00Z","end_time":"2025-06-20T15:00:00Z","booked_by":"occ-tester"}'
assert_status "POST /bookings (OCC setup)" 201 "$RESP_STATUS" "$RESP_BODY"
OCC_BOOKING_ID=$(json_field "$RESP_BODY" "['id']")
echo "  OCC Booking ID: $OCC_BOOKING_ID"

echo "  Firing two concurrent PUT requests to trigger OCC conflict..."
# Both requests try to extend the booking to different end times simultaneously.
# Aurora DSQL's OCC may abort one transaction with SQLSTATE OC000.
TMPDIR_OCC=$(mktemp -d)
curl -s -w "\n%{http_code}" -X PUT "${API}/bookings/${OCC_BOOKING_ID}" \
  -H "Content-Type: application/json" \
  -d "{\"end_time\":\"2025-06-20T16:00:00Z\"}" > "${TMPDIR_OCC}/resp1" &
PID1=$!

curl -s -w "\n%{http_code}" -X PUT "${API}/bookings/${OCC_BOOKING_ID}" \
  -H "Content-Type: application/json" \
  -d "{\"end_time\":\"2025-06-20T17:00:00Z\"}" > "${TMPDIR_OCC}/resp2" &
PID2=$!

wait $PID1
wait $PID2

STATUS1=$(tail -1 "${TMPDIR_OCC}/resp1")
STATUS2=$(tail -1 "${TMPDIR_OCC}/resp2")
echo "  Concurrent PUT #1 returned HTTP $STATUS1"
echo "  Concurrent PUT #2 returned HTTP $STATUS2"

# At least one should succeed (200). The other may also succeed (OCC retry
# worked) or return 503 (retries exhausted). Both failing would be unexpected.
if [[ "$STATUS1" == "200" || "$STATUS2" == "200" ]]; then
  green "  PASS: At least one concurrent update succeeded"
  PASS=$((PASS + 1))
else
  red "  FAIL: Neither concurrent update succeeded (got $STATUS1 and $STATUS2)"
  FAIL=$((FAIL + 1))
fi

rm -rf "${TMPDIR_OCC}"

echo "  Cleaning up OCC test booking..."
call DELETE "/bookings/$OCC_BOOKING_ID"
assert_status "DELETE /bookings/:id (OCC cleanup)" 200 "$RESP_STATUS" "$RESP_BODY"
echo
echo "  NOTE: This test demonstrates Aurora DSQL's optimistic concurrency control"
echo "  (OCC) in action. When two transactions modify the same row simultaneously,"
echo "  DSQL aborts one with SQLSTATE OC000. The withOccRetry handler automatically"
echo "  retries the failed transaction with exponential backoff."
echo

# ---------------------------------------------------------------------------
# 7. Validation errors
# ---------------------------------------------------------------------------
bold "7. Validation & Error Handling"

call POST /bookings '{}'
assert_status "POST /bookings (missing fields)" 400 "$RESP_STATUS" "$RESP_BODY"

call POST /bookings '{"resource_name":"Room B","start_time":"2025-06-15T12:00:00Z","end_time":"2025-06-15T11:00:00Z","booked_by":"dave"}'
assert_status "POST /bookings (end before start)" 400 "$RESP_STATUS" "$RESP_BODY"

call GET /bookings/nonexistent-id
assert_status "GET /bookings/:id (not found)" 404 "$RESP_STATUS" "$RESP_BODY"

call DELETE /bookings/nonexistent-id
assert_status "DELETE /bookings/:id (not found)" 404 "$RESP_STATUS" "$RESP_BODY"
echo

# ---------------------------------------------------------------------------
# 8. Delete the booking
# ---------------------------------------------------------------------------
bold "8. Delete Booking"
call DELETE "/bookings/$BOOKING_ID"
assert_status "DELETE /bookings/:id (delete)" 200 "$RESP_STATUS" "$RESP_BODY"
echo

# ---------------------------------------------------------------------------
# 9. Verify deleted
# ---------------------------------------------------------------------------
bold "9. Verify Deleted"
call GET "/bookings/$BOOKING_ID"
assert_status "GET /bookings/:id (verify deleted)" 404 "$RESP_STATUS" "$RESP_BODY"
echo

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
bold "============================================="
bold "  Results: $PASS passed, $FAIL failed"
bold "============================================="

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
