#!/bin/bash
HOOK="$(dirname "$0")/../../core/hooks/block-network.sh"
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

echo "block-network:"
assert_blocked "blocks curl"           '{"tool_input":{"command":"curl https://example.com"}}'
assert_blocked "blocks wget"           '{"tool_input":{"command":"wget https://example.com/file.zip"}}'
assert_blocked "blocks curl in pipe"   '{"tool_input":{"command":"curl -s https://api.example.com | jq ."}}'
assert_allowed "allows npm install"    '{"tool_input":{"command":"npm install"}}'
assert_allowed "allows git fetch"      '{"tool_input":{"command":"git fetch origin"}}'
assert_allowed "allows ls"             '{"tool_input":{"command":"ls -la"}}'
assert_allowed "allows no command"     '{"tool_input":{}}'

echo ""; echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] || exit 1
