#!/bin/bash
HOOK="$(dirname "$0")/../../core/hooks/branch-protection.sh"
PASS=0; FAIL=0

assert_blocked() {
  local desc="$1"; local input="$2"; shift 2
  echo "$input" | env "$@" bash "$HOOK" > /dev/null 2>&1
  if [ $? -eq 2 ]; then ((PASS++)); echo "  ✓ $desc"
  else ((FAIL++)); echo "  ✗ $desc (expected exit 2)"; fi
}

assert_allowed() {
  local desc="$1"; local input="$2"; shift 2
  echo "$input" | env "$@" bash "$HOOK" > /dev/null 2>&1
  if [ $? -eq 0 ]; then ((PASS++)); echo "  ✓ $desc"
  else ((FAIL++)); echo "  ✗ $desc (expected exit 0)"; fi
}

echo "branch-protection:"
assert_blocked "blocks push to main"             '{"tool_input":{"command":"git push origin main"}}'
assert_blocked "blocks push to master"           '{"tool_input":{"command":"git push origin master"}}'
assert_blocked "blocks commit on main"           '{"tool_input":{"command":"git commit -m \"fix\""}}' "AEGIS_CURRENT_BRANCH=main"
assert_blocked "blocks commit on master"         '{"tool_input":{"command":"git commit -m \"fix\""}}' "AEGIS_CURRENT_BRANCH=master"
assert_allowed "allows commit on feat/login"     '{"tool_input":{"command":"git commit -m \"feat\""}}' "AEGIS_CURRENT_BRANCH=feat/login"
assert_allowed "allows push to feature branch"   '{"tool_input":{"command":"git push origin feat/my-feature"}}'
assert_allowed "allows non-git commands"         '{"tool_input":{"command":"npm run build"}}'
assert_allowed "allows no command"               '{"tool_input":{}}'

echo ""; echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] || exit 1
