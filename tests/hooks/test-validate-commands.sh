#!/bin/bash
HOOK="$(dirname "$0")/../../core/hooks/validate-commands.sh"
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

echo "validate-commands:"

# rm -rf dangerous targets
assert_blocked "blocks rm -rf /"        '{"tool_input":{"command":"rm -rf /"}}'
assert_blocked "blocks rm -rf ~"        '{"tool_input":{"command":"rm -rf ~"}}'
assert_blocked "blocks rm -rf ."        '{"tool_input":{"command":"rm -rf ."}}'
assert_blocked "blocks rm -rf with leading space" '{"tool_input":{"command":"  rm -rf /"}}'

# rm of specific files is allowed
assert_allowed "allows rm of specific file"   '{"tool_input":{"command":"rm /tmp/foo.txt"}}'
assert_allowed "allows rm -f of specific file" '{"tool_input":{"command":"rm -f /tmp/foo.txt"}}'

# git push --force / -f
assert_blocked "blocks git push --force"  '{"tool_input":{"command":"git push --force"}}'
assert_blocked "blocks git push -f"       '{"tool_input":{"command":"git push -f"}}'
assert_blocked "blocks git push origin main --force" '{"tool_input":{"command":"git push origin main --force"}}'

# normal git push is allowed
assert_allowed "allows git push"          '{"tool_input":{"command":"git push"}}'
assert_allowed "allows git push origin main" '{"tool_input":{"command":"git push origin main"}}'

# git reset --hard
assert_blocked "blocks git reset --hard"        '{"tool_input":{"command":"git reset --hard"}}'
assert_blocked "blocks git reset --hard HEAD~1" '{"tool_input":{"command":"git reset --hard HEAD~1"}}'

# git reset --soft is allowed
assert_allowed "allows git reset --soft"  '{"tool_input":{"command":"git reset --soft HEAD~1"}}'
assert_allowed "allows git reset HEAD"    '{"tool_input":{"command":"git reset HEAD"}}'

# SQL destructive statements (case insensitive)
assert_blocked "blocks DROP TABLE"        '{"tool_input":{"command":"mysql -e \"DROP TABLE users\""}}'
assert_blocked "blocks drop table lower"  '{"tool_input":{"command":"psql -c \"drop table orders\""}}'
assert_blocked "blocks DROP DATABASE"     '{"tool_input":{"command":"mysql -e \"DROP DATABASE mydb\""}}'
assert_blocked "blocks TRUNCATE"          '{"tool_input":{"command":"psql -c \"TRUNCATE events\""}}'
assert_blocked "blocks truncate lower"    '{"tool_input":{"command":"psql -c \"truncate logs\""}}'

# chmod 777
assert_blocked "blocks chmod 777"         '{"tool_input":{"command":"chmod 777 /etc/passwd"}}'
assert_blocked "blocks chmod 777 on dir"  '{"tool_input":{"command":"chmod 777 /app"}}'

# safe chmod values allowed
assert_allowed "allows chmod 755"         '{"tool_input":{"command":"chmod 755 script.sh"}}'
assert_allowed "allows chmod +x"          '{"tool_input":{"command":"chmod +x deploy.sh"}}'

# no command field — allow
assert_allowed "allows missing command"   '{}'
assert_allowed "allows empty command"     '{"tool_input":{"command":""}}'

echo ""; echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] || exit 1
