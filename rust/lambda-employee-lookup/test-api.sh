#!/bin/bash
# =============================================================================
# DSQL Employee Lookup - API Test Script
# =============================================================================
# Run this after setup.sh completes and database is seeded.
#
# Usage:
#   chmod +x test-api.sh
#   ./test-api.sh
# =============================================================================

set -euo pipefail

# Load environment
if [ -f env.sh ]; then
  source env.sh
else
  echo "ERROR: env.sh not found. Run setup.sh first."
  exit 1
fi

API_URL="${API_ENDPOINT}/lookup"

echo "============================================"
echo "DSQL Employee Lookup - API Tests"
echo "============================================"
echo "API URL: $API_URL"
echo ""

# Test 1: List all employees (empty body)
echo ">>> Test 1: List all employees"
echo "    POST $API_URL (empty body)"
curl -s -X POST $API_URL \
  -H 'Content-Type: application/json' \
  -d '{}' | jq .
echo ""

# Test 2: Search by name
echo ">>> Test 2: Search for 'John'"
curl -s -X POST $API_URL \
  -H 'Content-Type: application/json' \
  -d '{"name": "John"}' | jq .
echo ""

# Test 3: Search for partial name
echo ">>> Test 3: Search for 'doe' (case-insensitive)"
curl -s -X POST $API_URL \
  -H 'Content-Type: application/json' \
  -d '{"name": "doe"}' | jq .
echo ""

# Test 4: Search with no results
echo ">>> Test 4: Search for 'zzz' (no results expected)"
curl -s -X POST $API_URL \
  -H 'Content-Type: application/json' \
  -d '{"name": "zzz"}' | jq .
echo ""

# Test 5: Invalid JSON (should return 400)
echo ">>> Test 5: Invalid JSON body (expect 400)"
HTTP_STATUS=$(curl -s -o /tmp/response.json -w "%{http_code}" -X POST $API_URL \
  -H 'Content-Type: application/json' \
  -d 'not valid json')
echo "    HTTP Status: $HTTP_STATUS"
if [ "$HTTP_STATUS" == "400" ]; then
  echo "    ✅ Correctly returned 400"
else
  echo "    ❌ Expected 400, got $HTTP_STATUS"
fi
cat /tmp/response.json | jq .
echo ""

echo "============================================"
echo "Tests complete!"
echo "============================================"
