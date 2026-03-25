#!/bin/bash
HOOK="$(dirname "$0")/../../core/hooks/block-secrets.sh"
PASS=0; FAIL=0

assert_blocked() {
  local desc="$1"; local input="$2"
  echo "$input" | bash "$HOOK" > /dev/null 2>&1
  if [ $? -eq 2 ]; then ((PASS++)); echo "  ✓ $desc"
  else ((FAIL++)); echo "  ✗ $desc (expected exit 2)"; fi
}

assert_allowed() {
  local desc="$1"; local input="$2"
  echo "$input" | bash "$HOOK" > /dev/null 2>&1
  if [ $? -eq 0 ]; then ((PASS++)); echo "  ✓ $desc"
  else ((FAIL++)); echo "  ✗ $desc (expected exit 0)"; fi
}

echo "block-secrets:"
assert_blocked "blocks .env" '{"tool_input":{"file_path":"/app/.env"}}'
assert_blocked "blocks .env.local" '{"tool_input":{"file_path":"/app/.env.local"}}'
assert_blocked "blocks credentials.json" '{"tool_input":{"file_path":"/app/credentials.json"}}'
assert_blocked "blocks private.pem" '{"tool_input":{"file_path":"/app/private.pem"}}'
assert_blocked "blocks server.key" '{"tool_input":{"file_path":"/app/server.key"}}'
assert_blocked "blocks nested .env" '{"tool_input":{"file_path":"/app/config/.env.production"}}'
assert_allowed "allows normal file" '{"tool_input":{"file_path":"/app/src/index.ts"}}'
assert_allowed "allows .envrc" '{"tool_input":{"file_path":"/app/.envrc"}}'

echo ""; echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] || exit 1
