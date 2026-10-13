#!/bin/bash
# =============================================================================
# DSQL Employee Lookup - API Test Script
# =============================================================================
# Run this after setup.sh completes and database is seeded.
#
# Usage:
#   chmod +x test-api.sh
#   ./test-api.sh
#
# Exit codes:
#   0 - All tests passed
#   1 - One or more tests failed
# =============================================================================

set -euo pipefail

FAILURES=0

# Prefer explicit API_URL, then legacy API_ENDPOINT; env.sh is only a fallback.
SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
if [ -z "${API_URL:-${API_ENDPOINT:-}}" ] && [ -f "$SCRIPT_DIR/env.sh" ]; then
  source "$SCRIPT_DIR/env.sh"
fi
API_URL="${API_URL:-${API_ENDPOINT:-}}"
if [ -z "$API_URL" ]; then
  echo "ERROR: Set API_URL (full /lookup URL) or API_ENDPOINT, or run setup-docker.sh/setup-finch.sh first."
  exit 1
fi

# Accept a base endpoint or /lookup URL, with an optional trailing slash.
API_URL="${API_URL%/}"
API_URL="${API_URL%/lookup}/lookup"

RESPONSE_FILE=$(mktemp "${TMPDIR:-/tmp}/dsql-employee-lookup-response.XXXXXX")
trap 'rm -f "$RESPONSE_FILE"' EXIT

echo "============================================"
echo "DSQL Employee Lookup - API Tests"
echo "============================================"
echo "API URL: $API_URL"
echo ""

assert_status() {
  local test_name="$1"
  local expected_status="$2"
  local actual_status="$3"
  local response_body="$4"

  if [ "$actual_status" == "$expected_status" ]; then
    echo "    ✅ $test_name: HTTP $actual_status (expected $expected_status)"
  else
    echo "    ❌ $test_name: HTTP $actual_status (expected $expected_status)"
    FAILURES=$((FAILURES + 1))
  fi
  echo "$response_body" | jq . 2>/dev/null || echo "$response_body"
  echo ""
}

assert_json_field() {
  local test_name="$1"
  local response_body="$2"
  local field="$3"
  local expected="$4"
  local actual
  actual=$(echo "$response_body" | jq -r "$field" 2>/dev/null || echo "PARSE_ERROR")

  if [ "$actual" == "$expected" ]; then
    echo "    ✅ $test_name: $field = $actual"
  else
    echo "    ❌ $test_name: $field = $actual (expected $expected)"
    FAILURES=$((FAILURES + 1))
  fi
}

# Test 1: List all employees (empty body) — expect 200 with count > 0
echo ">>> Test 1: List all employees"
HTTP_STATUS=$(curl -sS -o "$RESPONSE_FILE" -w "%{http_code}" -X POST "$API_URL" \
  -H 'Content-Type: application/json' \
  -d '{}') || { HTTP_STATUS="000"; : > "$RESPONSE_FILE"; }
BODY=$(cat "$RESPONSE_FILE")
assert_status "List all" "200" "$HTTP_STATUS" "$BODY"
COUNT=$(echo "$BODY" | jq -r '.count' 2>/dev/null || echo "PARSE_ERROR")
if [ "$COUNT" -gt 0 ] 2>/dev/null; then
  echo "    ✅ Returned $COUNT employees"
else
  echo "    ❌ Expected count > 0, got: $COUNT"
  FAILURES=$((FAILURES + 1))
fi
echo ""

# Test 2: Search by name prefix — expect 200 with matching results
echo ">>> Test 2: Search for 'John'"
HTTP_STATUS=$(curl -sS -o "$RESPONSE_FILE" -w "%{http_code}" -X POST "$API_URL" \
  -H 'Content-Type: application/json' \
  -d '{"name": "John"}') || { HTTP_STATUS="000"; : > "$RESPONSE_FILE"; }
BODY=$(cat "$RESPONSE_FILE")
assert_status "Search John" "200" "$HTTP_STATUS" "$BODY"
assert_json_field "Search John" "$BODY" '.count' "1"
assert_json_field "Search John" "$BODY" '.employees[0].name' "John Doe"

# Test 3: Case-insensitive prefix search
echo ">>> Test 3: Search for 'alice' (case-insensitive)"
HTTP_STATUS=$(curl -sS -o "$RESPONSE_FILE" -w "%{http_code}" -X POST "$API_URL" \
  -H 'Content-Type: application/json' \
  -d '{"name": "alice"}') || { HTTP_STATUS="000"; : > "$RESPONSE_FILE"; }
BODY=$(cat "$RESPONSE_FILE")
assert_status "Search alice" "200" "$HTTP_STATUS" "$BODY"
assert_json_field "Search alice" "$BODY" '.count' "1"
assert_json_field "Search alice" "$BODY" '.employees[0].name' "Alice Johnson"

# Test 4: Search with no results — expect 200 with count 0
echo ">>> Test 4: Search for 'zzz' (no results expected)"
HTTP_STATUS=$(curl -sS -o "$RESPONSE_FILE" -w "%{http_code}" -X POST "$API_URL" \
  -H 'Content-Type: application/json' \
  -d '{"name": "zzz"}') || { HTTP_STATUS="000"; : > "$RESPONSE_FILE"; }
BODY=$(cat "$RESPONSE_FILE")
assert_status "No results" "200" "$HTTP_STATUS" "$BODY"
assert_json_field "No results" "$BODY" '.count' "0"

# Test 5: Empty body — expect 200 (treated as list all)
echo ">>> Test 5: Empty body"
HTTP_STATUS=$(curl -sS -o "$RESPONSE_FILE" -w "%{http_code}" -X POST "$API_URL" \
  -H 'Content-Type: application/json') || { HTTP_STATUS="000"; : > "$RESPONSE_FILE"; }
BODY=$(cat "$RESPONSE_FILE")
assert_status "Empty body" "200" "$HTTP_STATUS" "$BODY"

# Test 6: Invalid JSON — expect 400
echo ">>> Test 6: Invalid JSON body (expect 400)"
HTTP_STATUS=$(curl -sS -o "$RESPONSE_FILE" -w "%{http_code}" -X POST "$API_URL" \
  -H 'Content-Type: application/json' \
  -d 'not valid json') || { HTTP_STATUS="000"; : > "$RESPONSE_FILE"; }
BODY=$(cat "$RESPONSE_FILE")
assert_status "Invalid JSON" "400" "$HTTP_STATUS" "$BODY"
assert_json_field "Invalid JSON" "$BODY" '.error' "Invalid request body"

# Results
echo "============================================"
if [ "$FAILURES" -eq 0 ]; then
  echo "All tests passed! ✅"
  exit 0
else
  echo "$FAILURES test(s) failed ❌"
  exit 1
fi
