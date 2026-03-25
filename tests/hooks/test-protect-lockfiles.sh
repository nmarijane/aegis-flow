#!/bin/bash
HOOK="$(dirname "$0")/../../core/hooks/protect-lockfiles.sh"
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

echo "protect-lockfiles:"
assert_blocked "blocks package-lock.json" '{"tool_input":{"file_path":"/app/package-lock.json"}}'
assert_blocked "blocks pnpm-lock.yaml" '{"tool_input":{"file_path":"/app/pnpm-lock.yaml"}}'
assert_blocked "blocks yarn.lock" '{"tool_input":{"file_path":"/app/yarn.lock"}}'
assert_blocked "blocks Gemfile.lock" '{"tool_input":{"file_path":"/app/Gemfile.lock"}}'
assert_blocked "blocks poetry.lock" '{"tool_input":{"file_path":"/app/poetry.lock"}}'
assert_blocked "blocks bun.lockb" '{"tool_input":{"file_path":"/app/bun.lockb"}}'
assert_blocked "blocks Cargo.lock" '{"tool_input":{"file_path":"/app/Cargo.lock"}}'
assert_blocked "blocks composer.lock" '{"tool_input":{"file_path":"/app/composer.lock"}}'
assert_allowed "allows package.json" '{"tool_input":{"file_path":"/app/package.json"}}'
assert_allowed "allows normal file" '{"tool_input":{"file_path":"/app/src/index.ts"}}'
assert_allowed "allows nested lockfile-named dir" '{"tool_input":{"file_path":"/app/yarn.lock/README.md"}}'

echo ""; echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] || exit 1
