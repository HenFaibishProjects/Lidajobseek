#!/bin/bash

# Configuration
BASE_URL=${BASE_URL:-http://127.0.0.1:3000}
EXIT_CODE=0

# Helper functions
fail() {
  echo "❌ FAILED: $1"
  EXIT_CODE=1
}

success() {
  echo "✅ PASSED: $1"
}

expect_status() {
  local method=$1
  local path=$2
  local expected=$3
  local description="$method $path (expected $expected)"

  echo "Testing $description..."
  
  local status=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$BASE_URL$path")
  
  if [ "$status" -eq "$expected" ]; then
    success "$description (got $status)"
  else
    fail "$description (got $status)"
    # Verbose output on failure
    curl -v -X "$method" "$BASE_URL$path" 2>&1 | grep -E "^< (HTTP|Content-Type)"
  fi
}

expect_success() {
  expect_status "$1" "$2" 200
}

post_json() {
  local path=$1
  local data=$2
  echo "POST $path with data: $data"
  curl -s -X POST "$BASE_URL$path" \
    -H "Content-Type: application/json" \
    -d "$data"
}

# --- Initial Tests ---

echo "--- Starting Docker Smoke & Security Tests ---"
echo "Target: $BASE_URL"

# 1. Health check (should be public)
expect_success "GET" "/api/health"

# 2. Frontend root (should be public)
expect_success "GET" "/"

# 3. Secure endpoints (should return 401 Unauthorized without token)
expect_status "GET" "/api/profiles/me" 401
expect_status "GET" "/api/processes" 401
expect_status "GET" "/api/resources" 401

# --- Authentication Flow ---

echo "--- Testing Authentication Flow ---"

TIMESTAMP=$(date +%s)
EMAIL="test-$TIMESTAMP@example.com"
PASSWORD="Password123!"

# 4. Register
echo "Registering user $EMAIL..."
# Use the REGISTER secret/env if passed to the script, otherwise fallback to default 'LIDA2026'
INVITATION_CODE=${REGISTER:-LIDA2026}
REGISTER_RESPONSE=$(post_json "/api/auth/register" "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Test User\",\"code\":\"$INVITATION_CODE\"}")
if [[ "$REGISTER_RESPONSE" == *"\"id\":"* ]]; then
  success "User registration"
else
  fail "User registration failed: $REGISTER_RESPONSE"
  exit 1
fi

# 5. Login
echo "Logging in..."
LOGIN_RESPONSE=$(post_json "/api/auth/login" "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

# Validate JSON and extract token
if echo "$LOGIN_RESPONSE" | jq -e . >/dev/null 2>&1; then
  TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.access_token // empty')
  
  if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
    success "User login (token received)"
  else
    fail "User login failed: Token not found in response. Raw response: $LOGIN_RESPONSE"
    exit 1
  fi
else
  fail "User login failed: Invalid JSON response. Raw response: $LOGIN_RESPONSE"
  exit 1
fi

# 6. Authenticated request
echo "Testing authenticated request to /api/profiles/me..."
AUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$BASE_URL/api/profiles/me" -H "Authorization: Bearer $TOKEN")

if [ "$AUTH_STATUS" -eq 200 ]; then
  success "Authenticated request to /api/profiles/me (got 200)"
else
  fail "Authenticated request to /api/profiles/me (got $AUTH_STATUS)"
  EXIT_CODE=1
fi

echo "--- Finished Tests ---"

if [ $EXIT_CODE -ne 0 ]; then
  echo "Some tests failed!"
else
  echo "All tests passed!"
fi

exit $EXIT_CODE
