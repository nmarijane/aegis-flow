#!/bin/bash
HOOK="$(dirname "$0")/../../core/hooks/auto-format.sh"
PASS=0; FAIL=0

assert_exit() {
  local desc="$1"; local expected="$2"; local input="$3"
  echo "$input" | bash "$HOOK" > /dev/null 2>&1
  local actual=$?
  if [ "$actual" -eq "$expected" ]; then ((PASS++)); echo "  ✓ $desc"
  else ((FAIL++)); echo "  ✗ $desc (expected exit $expected, got $actual)"; fi
}

# Setup temp dir for config tests
TMPDIR_TEST=$(mktemp -d)
TMPFILE="$TMPDIR_TEST/test.txt"
touch "$TMPFILE"

echo "auto-format:"

# No file path — should allow (exit 0)
assert_exit "exits 0 when no file_path" 0 '{}'

# File path but file doesn't exist — should allow (exit 0)
assert_exit "exits 0 when file does not exist" 0 '{"tool_input":{"file_path":"/nonexistent/path/file.ts"}}'

# File exists but no config file — should allow (exit 0)
assert_exit "exits 0 when no config file" 0 "{\"tool_input\":{\"file_path\":\"$TMPFILE\"}}"

# File exists, config with no formatter — should allow (exit 0)
CONFIG_DIR="$TMPDIR_TEST/.claude"
mkdir -p "$CONFIG_DIR"
echo '{"project":{}}' > "$CONFIG_DIR/aegis-flow.json"
AEGIS_CONFIG_DIR="$CONFIG_DIR" assert_exit "exits 0 when no formatter in config" 0 "{\"tool_input\":{\"file_path\":\"$TMPFILE\"}}"

# File exists, config with unknown formatter — should allow (exit 0)
echo '{"project":{"formatter":"unknown-formatter"}}' > "$CONFIG_DIR/aegis-flow.json"
AEGIS_CONFIG_DIR="$CONFIG_DIR" assert_exit "exits 0 with unknown formatter (silent skip)" 0 "{\"tool_input\":{\"file_path\":\"$TMPFILE\"}}"

# File exists, config with known formatter (prettier, not installed) — should still exit 0 (errors suppressed)
echo '{"project":{"formatter":"prettier"}}' > "$CONFIG_DIR/aegis-flow.json"
AEGIS_CONFIG_DIR="$CONFIG_DIR" assert_exit "exits 0 even when prettier unavailable" 0 "{\"tool_input\":{\"file_path\":\"$TMPFILE\"}}"

# Cleanup
rm -rf "$TMPDIR_TEST"

echo ""; echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] || exit 1
