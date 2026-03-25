#!/bin/bash
HOOK="$(dirname "$0")/../../core/hooks/audit-log.sh"
PASS=0; FAIL=0

assert_exit() {
  local desc="$1"; local expected="$2"; local input="$3"
  shift 3
  env "$@" bash "$HOOK" <<< "$input" > /dev/null 2>&1
  local actual=$?
  if [ "$actual" -eq "$expected" ]; then ((PASS++)); echo "  ✓ $desc"
  else ((FAIL++)); echo "  ✗ $desc (expected exit $expected, got $actual)"; fi
}

assert_log_field() {
  local desc="$1"; local log_file="$2"; local field="$3"; local expected="$4"
  local actual
  actual=$(tail -1 "$log_file" | jq -r ".$field" 2>/dev/null)
  if [ "$actual" = "$expected" ]; then ((PASS++)); echo "  ✓ $desc"
  else ((FAIL++)); echo "  ✗ $desc (expected '$expected', got '$actual')"; fi
}

assert_log_field_nonempty() {
  local desc="$1"; local log_file="$2"; local field="$3"
  local actual
  actual=$(tail -1 "$log_file" | jq -r ".$field" 2>/dev/null)
  if [ -n "$actual" ] && [ "$actual" != "null" ]; then ((PASS++)); echo "  ✓ $desc"
  else ((FAIL++)); echo "  ✗ $desc (expected non-empty, got '$actual')"; fi
}

TMPDIR_TEST=$(mktemp -d)
CONFIG_DIR="$TMPDIR_TEST/.claude"
mkdir -p "$CONFIG_DIR"
LOG_FILE="$CONFIG_DIR/aegis-flow-audit.log"

echo "audit-log:"

# Always exits 0 even with no input
assert_exit "exits 0 with empty input" 0 '{}' "AEGIS_CONFIG_DIR=$CONFIG_DIR"

# Logs an Edit tool use with file_path
INPUT='{"tool_name":"Edit","tool_input":{"file_path":"/app/src/index.ts","old_string":"foo","new_string":"bar"}}'
assert_exit "exits 0 for Edit tool" 0 "$INPUT" "AEGIS_CONFIG_DIR=$CONFIG_DIR"
assert_log_field "logs tool name as Edit" "$LOG_FILE" "tool" "Edit"
assert_log_field "logs file_path as target" "$LOG_FILE" "target" "/app/src/index.ts"
assert_log_field_nonempty "logs timestamp" "$LOG_FILE" "timestamp"

# Logs a Bash tool use with command
INPUT='{"tool_name":"Bash","tool_input":{"command":"npm test"}}'
assert_exit "exits 0 for Bash tool" 0 "$INPUT" "AEGIS_CONFIG_DIR=$CONFIG_DIR"
assert_log_field "logs tool name as Bash" "$LOG_FILE" "tool" "Bash"
assert_log_field "logs command as target" "$LOG_FILE" "target" "npm test"

# Logs a Write tool use
INPUT='{"tool_name":"Write","tool_input":{"file_path":"/app/package.json","content":"{}"}}'
assert_exit "exits 0 for Write tool" 0 "$INPUT" "AEGIS_CONFIG_DIR=$CONFIG_DIR"
assert_log_field "logs tool name as Write" "$LOG_FILE" "tool" "Write"
assert_log_field "logs file_path for Write" "$LOG_FILE" "target" "/app/package.json"

# Long command is truncated to 200 chars
LONG_CMD=$(python3 -c "print('x' * 300)" 2>/dev/null || printf '%0.s x' {1..300})
INPUT="{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"$LONG_CMD\"}}"
assert_exit "exits 0 for long command" 0 "$INPUT" "AEGIS_CONFIG_DIR=$CONFIG_DIR"
ACTUAL_TARGET=$(tail -1 "$LOG_FILE" | jq -r '.target' 2>/dev/null)
TARGET_LEN=${#ACTUAL_TARGET}
if [ "$TARGET_LEN" -le 200 ]; then ((PASS++)); echo "  ✓ truncates long command to 200 chars"
else ((FAIL++)); echo "  ✗ truncates long command to 200 chars (got $TARGET_LEN chars)"; fi

# Creates the log file if it doesn't exist
NEW_DIR="$TMPDIR_TEST/newdir/.claude"
mkdir -p "$NEW_DIR"
NEW_LOG="$NEW_DIR/aegis-flow-audit.log"
INPUT='{"tool_name":"Read","tool_input":{"file_path":"/app/README.md"}}'
env AEGIS_CONFIG_DIR="$NEW_DIR" bash "$HOOK" <<< "$INPUT" > /dev/null 2>&1
if [ -f "$NEW_LOG" ]; then ((PASS++)); echo "  ✓ creates log file if missing"
else ((FAIL++)); echo "  ✗ creates log file if missing"; fi

# Multiple entries accumulate (log is append-only)
LINE_COUNT=$(wc -l < "$LOG_FILE" 2>/dev/null || echo 0)
if [ "$LINE_COUNT" -ge 2 ]; then ((PASS++)); echo "  ✓ appends entries (log has $LINE_COUNT lines)"
else ((FAIL++)); echo "  ✗ appends entries (expected >= 2 lines, got $LINE_COUNT)"; fi

# Cleanup
rm -rf "$TMPDIR_TEST"

echo ""; echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] || exit 1
