#!/usr/bin/env bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
#
# test-api.sh - Smoke test all Recipe Sharing API endpoints.
#
# Usage:
#   ./test-api.sh <api-endpoint>
#
# Example:
#   ./test-api.sh https://abc123.execute-api.us-east-2.amazonaws.com/prod
#   ./test-api.sh http://localhost:8080
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
API="${1:?Usage: $0 <api-endpoint>}"
API="${API%/}" # strip trailing slash

PASS=0
FAIL=0
CHEF1_ID=""
CHEF2_ID=""
RECIPE1_ID=""
RECIPE2_ID=""

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
bold "  Recipe Sharing API — Smoke Tests"
bold "  Endpoint: $API"
bold "============================================="
echo

# ---------------------------------------------------------------------------
# 1. Health check
# ---------------------------------------------------------------------------
bold "1. Health Check"
call GET /health
assert_status "GET /health" 200 "$RESP_STATUS" "$RESP_BODY"
echo

# ---------------------------------------------------------------------------
# 2. Chefs — CRUD
# ---------------------------------------------------------------------------
bold "2. Chef Operations"

call GET /api/v1/chefs
assert_status "GET /api/v1/chefs (empty or existing)" 200 "$RESP_STATUS" "$RESP_BODY"

call POST /api/v1/chefs '{"name":"Julia Child","email":"julia@example.com","specialty":"French","bio":"Pioneer of French cuisine"}'
assert_status "POST /api/v1/chefs (create chef 1)" 201 "$RESP_STATUS" "$RESP_BODY"
CHEF1_ID=$(json_field "$RESP_BODY" "['data']['id']")
echo "  Chef 1 ID: $CHEF1_ID"

call POST /api/v1/chefs '{"name":"Jiro Ono","email":"jiro@example.com","specialty":"Japanese","bio":"Sushi master"}'
assert_status "POST /api/v1/chefs (create chef 2)" 201 "$RESP_STATUS" "$RESP_BODY"
CHEF2_ID=$(json_field "$RESP_BODY" "['data']['id']")
echo "  Chef 2 ID: $CHEF2_ID"

call GET /api/v1/chefs
assert_status "GET /api/v1/chefs (list)" 200 "$RESP_STATUS" "$RESP_BODY"
COUNT=$(json_field "$RESP_BODY" "['count']")
echo "  Chef count: $COUNT"

call GET "/api/v1/chefs/$CHEF1_ID"
assert_status "GET /api/v1/chefs/:id (get with recipes)" 200 "$RESP_STATUS" "$RESP_BODY"

call PUT "/api/v1/chefs/$CHEF1_ID" '{"specialty":"French & American"}'
assert_status "PUT /api/v1/chefs/:id (update)" 200 "$RESP_STATUS" "$RESP_BODY"
UPDATED=$(json_field "$RESP_BODY" "['data']['specialty']")
echo "  Updated specialty: $UPDATED"
echo

# ---------------------------------------------------------------------------
# 3. Recipes — CRUD + filtering
# ---------------------------------------------------------------------------
bold "3. Recipe Operations"

call POST /api/v1/recipes "{\"chef_id\":\"$CHEF1_ID\",\"title\":\"Beef Bourguignon\",\"ingredients\":\"beef, red wine, carrots\",\"instructions\":\"Brown beef, simmer 3 hours\",\"cuisine\":\"French\",\"difficulty\":\"hard\",\"prep_time\":30,\"cook_time\":180,\"servings\":6}"
assert_status "POST /api/v1/recipes (create recipe 1 — French, hard, draft)" 201 "$RESP_STATUS" "$RESP_BODY"
RECIPE1_ID=$(json_field "$RESP_BODY" "['data']['id']")
echo "  Recipe 1 ID: $RECIPE1_ID"

call POST /api/v1/recipes "{\"chef_id\":\"$CHEF2_ID\",\"title\":\"Omakase Sushi\",\"ingredients\":\"rice, fish, nori\",\"instructions\":\"Slice fish, assemble nigiri\",\"cuisine\":\"Japanese\",\"difficulty\":\"hard\",\"status\":\"published\"}"
assert_status "POST /api/v1/recipes (create recipe 2 — Japanese, published)" 201 "$RESP_STATUS" "$RESP_BODY"
RECIPE2_ID=$(json_field "$RESP_BODY" "['data']['id']")
echo "  Recipe 2 ID: $RECIPE2_ID"

call POST /api/v1/recipes "{\"chef_id\":\"$CHEF1_ID\",\"title\":\"French Omelette\",\"ingredients\":\"eggs, butter\",\"instructions\":\"Beat eggs, cook in butter\",\"cuisine\":\"French\",\"difficulty\":\"easy\",\"status\":\"published\"}"
assert_status "POST /api/v1/recipes (create recipe 3 — French, easy, published)" 201 "$RESP_STATUS" "$RESP_BODY"

call GET /api/v1/recipes
assert_status "GET /api/v1/recipes (list all)" 200 "$RESP_STATUS" "$RESP_BODY"

call GET "/api/v1/recipes?cuisine=French"
assert_status "GET /api/v1/recipes?cuisine=French (filter)" 200 "$RESP_STATUS" "$RESP_BODY"
COUNT=$(json_field "$RESP_BODY" "['count']")
echo "  French recipes: $COUNT"

call GET "/api/v1/recipes?difficulty=easy"
assert_status "GET /api/v1/recipes?difficulty=easy (filter)" 200 "$RESP_STATUS" "$RESP_BODY"

call GET "/api/v1/recipes?status=published"
assert_status "GET /api/v1/recipes?status=published (filter)" 200 "$RESP_STATUS" "$RESP_BODY"

call GET "/api/v1/recipes/$RECIPE1_ID"
assert_status "GET /api/v1/recipes/:id (get with ratings)" 200 "$RESP_STATUS" "$RESP_BODY"

call PUT "/api/v1/recipes/$RECIPE1_ID" '{"status":"published"}'
assert_status "PUT /api/v1/recipes/:id (update status)" 200 "$RESP_STATUS" "$RESP_BODY"
echo

# ---------------------------------------------------------------------------
# 4. Ratings — create + list
# ---------------------------------------------------------------------------
bold "4. Rating Operations"

call POST "/api/v1/recipes/$RECIPE1_ID/ratings" "{\"chef_id\":\"$CHEF2_ID\",\"score\":5,\"comment\":\"Magnifique!\"}"
assert_status "POST /api/v1/recipes/:id/ratings (score 5)" 201 "$RESP_STATUS" "$RESP_BODY"

call POST "/api/v1/recipes/$RECIPE1_ID/ratings" "{\"chef_id\":\"$CHEF1_ID\",\"score\":4,\"comment\":\"Pretty good\"}"
assert_status "POST /api/v1/recipes/:id/ratings (score 4)" 201 "$RESP_STATUS" "$RESP_BODY"

call GET "/api/v1/recipes/$RECIPE1_ID/ratings"
assert_status "GET /api/v1/recipes/:id/ratings (list)" 200 "$RESP_STATUS" "$RESP_BODY"
COUNT=$(json_field "$RESP_BODY" "['count']")
echo "  Rating count: $COUNT"

call GET "/api/v1/recipes/$RECIPE1_ID"
assert_status "GET /api/v1/recipes/:id (verify average score)" 200 "$RESP_STATUS" "$RESP_BODY"
AVG=$(json_field "$RESP_BODY" "['data']['average_score']")
echo "  Average score: $AVG"
echo

# ---------------------------------------------------------------------------
# 5. Validation errors
# ---------------------------------------------------------------------------
bold "5. Validation & Error Handling"

call POST /api/v1/chefs '{}'
assert_status "POST /api/v1/chefs (missing required fields)" 400 "$RESP_STATUS" "$RESP_BODY"

call POST /api/v1/recipes '{"chef_id":"nonexistent","title":"X","ingredients":"x","instructions":"y"}'
assert_status "POST /api/v1/recipes (non-existent chef)" 400 "$RESP_STATUS" "$RESP_BODY"

call GET "/api/v1/recipes?difficulty=extreme"
assert_status "GET /api/v1/recipes?difficulty=extreme (invalid filter)" 400 "$RESP_STATUS" "$RESP_BODY"

call GET "/api/v1/recipes?status=bogus"
assert_status "GET /api/v1/recipes?status=bogus (invalid filter)" 400 "$RESP_STATUS" "$RESP_BODY"

call POST "/api/v1/recipes/$RECIPE1_ID/ratings" "{\"chef_id\":\"$CHEF2_ID\",\"score\":10}"
assert_status "POST ratings (score out of range)" 400 "$RESP_STATUS" "$RESP_BODY"

call POST "/api/v1/recipes/$RECIPE1_ID/ratings" "{\"chef_id\":\"nonexistent\",\"score\":3}"
assert_status "POST ratings (non-existent chef)" 400 "$RESP_STATUS" "$RESP_BODY"

call POST "/api/v1/recipes/nonexistent/ratings" "{\"chef_id\":\"$CHEF1_ID\",\"score\":3}"
assert_status "POST ratings (non-existent recipe)" 404 "$RESP_STATUS" "$RESP_BODY"

call GET /api/v1/chefs/nonexistent
assert_status "GET /api/v1/chefs/:id (not found)" 404 "$RESP_STATUS" "$RESP_BODY"

call GET /api/v1/recipes/nonexistent
assert_status "GET /api/v1/recipes/:id (not found)" 404 "$RESP_STATUS" "$RESP_BODY"

call DELETE /api/v1/chefs/nonexistent
assert_status "DELETE /api/v1/chefs/:id (not found)" 404 "$RESP_STATUS" "$RESP_BODY"
echo

# ---------------------------------------------------------------------------
# 6. Cleanup — delete test data
# ---------------------------------------------------------------------------
bold "6. Cleanup"

call DELETE "/api/v1/recipes/$RECIPE1_ID"
assert_status "DELETE /api/v1/recipes/:id (recipe 1)" 200 "$RESP_STATUS" "$RESP_BODY"

call DELETE "/api/v1/recipes/$RECIPE2_ID"
assert_status "DELETE /api/v1/recipes/:id (recipe 2)" 200 "$RESP_STATUS" "$RESP_BODY"

call DELETE "/api/v1/chefs/$CHEF1_ID"
assert_status "DELETE /api/v1/chefs/:id (chef 1)" 200 "$RESP_STATUS" "$RESP_BODY"

call DELETE "/api/v1/chefs/$CHEF2_ID"
assert_status "DELETE /api/v1/chefs/:id (chef 2)" 200 "$RESP_STATUS" "$RESP_BODY"
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
