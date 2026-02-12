#!/bin/bash
#
# Auth Refactor Integration Tests
# Run from the limbo-health repo root.
# Requires: SECRET and TOKEN env vars set in your shell.
#
# Usage:
#   export SECRET="your-internal-api-secret"
#   export TOKEN="your-jwt-token"
#   ./scripts/auth-refactor-tests.sh
#

set -e

BASE_URL="http://localhost:3003"
TEST_PUBKEY="2cbf7f956e24bb2e8d8396737f53b427c53432ab91c857212982384f88b9bfa2"

PASS=0
FAIL=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

assert_contains() {
  local test_name="$1"
  local expected="$2"
  local actual="$3"

  if echo "$actual" | grep -q "$expected"; then
    echo -e "  ${GREEN}✅ $test_name${NC}"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}❌ $test_name${NC}"
    echo "     Expected to contain: $expected"
    echo "     Got: $actual"
    FAIL=$((FAIL + 1))
  fi
}

# --- Preflight checks ---
echo ""
echo "🔍 Preflight checks..."

if [ -z "$SECRET" ]; then
  echo -e "${RED}ERROR: SECRET env var not set. Export your INTERNAL_API_SECRET.${NC}"
  exit 1
fi

if [ -z "$TOKEN" ]; then
  echo -e "${RED}ERROR: TOKEN env var not set. Export a valid JWT.${NC}"
  exit 1
fi

echo "  SECRET is set"
echo "  TOKEN is set"

# ============================================================
# auth-api endpoint tests
# ============================================================
echo ""
echo "📦 auth-api: register-repo"

RESULT=$(curl -s -X POST "$BASE_URL/api/auth/register-repo" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: $SECRET" \
  -d "{\"repoId\":\"test-refactor\",\"ownerPubkey\":\"$TEST_PUBKEY\",\"description\":\"Refactor test\"}")

assert_contains "register-repo returns success" '"success":true' "$RESULT"

# ---
echo ""
echo "🔐 auth-api: check-access"

RESULT=$(curl -s -X POST "$BASE_URL/api/auth/check-access" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: $SECRET" \
  -d "{\"pubkey\":\"$TEST_PUBKEY\",\"repoId\":\"test-refactor\",\"operation\":\"write\"}")

assert_contains "owner write access allowed" '"allowed":true' "$RESULT"
assert_contains "owner has admin access" '"access":"admin"' "$RESULT"

RESULT=$(curl -s -X POST "$BASE_URL/api/auth/check-access" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: $SECRET" \
  -d "{\"pubkey\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\",\"repoId\":\"test-refactor\",\"operation\":\"read\"}")

assert_contains "wrong pubkey denied" '"allowed":false' "$RESULT"

RESULT=$(curl -s -X POST "$BASE_URL/api/auth/check-access" \
  -H "Content-Type: application/json" \
  -d "{\"pubkey\":\"$TEST_PUBKEY\",\"repoId\":\"test-refactor\",\"operation\":\"read\"}")

assert_contains "no secret returns forbidden" '"error":"Forbidden"' "$RESULT"

# ---
echo ""
echo "📋 auth-api: user/repositories"

RESULT=$(curl -s "$BASE_URL/api/auth/user/repositories?pubkey=$TEST_PUBKEY" \
  -H "X-Internal-Secret: $SECRET")

assert_contains "list includes test-refactor" '"repoId":"test-refactor"' "$RESULT"

# ============================================================
# mgit-api endpoint tests
# ============================================================
echo ""
echo "📋 mgit-api: user/repositories (JWT)"

RESULT=$(curl -s "$BASE_URL/api/mgit/user/repositories" \
  -H "Authorization: Bearer $TOKEN")

assert_contains "mgit listing includes test-refactor" '"id":"test-refactor"' "$RESULT"

# ---
echo ""
echo "📥 mgit-api: git clone"

CLONE_DIR=$(mktemp -d)
CLONE_RESULT=$(git clone -c http.extraHeader="Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/mgit/repos/jfz-health-records" "$CLONE_DIR/jfz-health-records" 2>&1)

if [ -d "$CLONE_DIR/jfz-health-records/.git" ]; then
  echo -e "  ${GREEN}✅ clone succeeded${NC}"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}❌ clone failed${NC}"
  echo "     $CLONE_RESULT"
  FAIL=$((FAIL + 1))
fi
rm -rf "$CLONE_DIR"

# ---
echo ""
echo "📤 mgit-api: push-to-create"

PUSH_DIR=$(mktemp -d)
cd "$PUSH_DIR"
git init -q && git checkout -q -b main
echo "push-to-create test" > test.txt
git add . && git commit -q -m "push-to-create test"
git remote add origin "$BASE_URL/api/mgit/repos/push-to-create-test"
PUSH_RESULT=$(git -c http.extraHeader="Authorization: Bearer $TOKEN" push -u origin main 2>&1)

if echo "$PUSH_RESULT" | grep -q "main -> main"; then
  echo -e "  ${GREEN}✅ push-to-create succeeded${NC}"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}❌ push-to-create failed${NC}"
  echo "     $PUSH_RESULT"
  FAIL=$((FAIL + 1))
fi

cd - > /dev/null
rm -rf "$PUSH_DIR"

RESULT=$(curl -s "$BASE_URL/api/auth/user/repositories?pubkey=$TEST_PUBKEY" \
  -H "X-Internal-Secret: $SECRET")

assert_contains "push-to-create registered in auth-api" '"repoId":"push-to-create-test"' "$RESULT"

# ============================================================
# scan session tests
# ============================================================
echo ""
echo "🔍 auth-api: scan sessions"

RESULT=$(curl -s -X POST "$BASE_URL/api/auth/scan/session" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"stagingRepoId":"scan-test-refactor"}')

assert_contains "scan session created" '"sessionToken":"sctk_' "$RESULT"

# Extract token
SCAN_TOKEN=$(echo "$RESULT" | grep -o '"sessionToken":"[^"]*"' | cut -d'"' -f4)

RESULT=$(curl -s -X POST "$BASE_URL/api/auth/check-access" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: $SECRET" \
  -d "{\"scanToken\":\"$SCAN_TOKEN\",\"repoId\":\"scan-test-refactor\",\"operation\":\"read\"}")

assert_contains "scan token grants access" '"allowed":true' "$RESULT"

RESULT=$(curl -s -X POST "$BASE_URL/api/auth/check-access" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: $SECRET" \
  -d "{\"scanToken\":\"$SCAN_TOKEN\",\"repoId\":\"wrong-repo\",\"operation\":\"read\"}")

assert_contains "scan token wrong repo denied" '"allowed":false' "$RESULT"

RESULT=$(curl -s -X POST "$BASE_URL/api/auth/scan/revoke" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"sessionToken\":\"$SCAN_TOKEN\"}")

assert_contains "scan session revoked" '"success":true' "$RESULT"

RESULT=$(curl -s -X POST "$BASE_URL/api/auth/check-access" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: $SECRET" \
  -d "{\"scanToken\":\"$SCAN_TOKEN\",\"repoId\":\"scan-test-refactor\",\"operation\":\"read\"}")

assert_contains "revoked token denied" '"allowed":false' "$RESULT"

# ============================================================
# Cleanup
# ============================================================
echo ""
echo "🧹 Cleaning up test data..."

curl -s -X DELETE "$BASE_URL/api/auth/repos/test-refactor" -H "X-Internal-Secret: $SECRET" > /dev/null
curl -s -X DELETE "$BASE_URL/api/auth/repos/push-to-create-test" -H "X-Internal-Secret: $SECRET" > /dev/null

# Delete push-to-create-test directory on disk (only works if you have local access to private_repos)
if [ -d "./private_repos/push-to-create-test" ]; then
  rm -rf "./private_repos/push-to-create-test"
  echo "  Deleted push-to-create-test from disk"
fi

echo "  Done"

# ============================================================
# Results
# ============================================================
echo ""
echo "================================"
echo -e "  ${GREEN}Passed: $PASS${NC}"
if [ $FAIL -gt 0 ]; then
  echo -e "  ${RED}Failed: $FAIL${NC}"
else
  echo -e "  Failed: 0"
fi
echo "================================"
echo ""

if [ $FAIL -gt 0 ]; then
  exit 1
fi