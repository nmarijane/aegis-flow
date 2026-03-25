#!/bin/bash
HOOK="$(dirname "$0")/../../core/hooks/verify-tests.sh"
PASS=0; FAIL=0

assert_exit() {
  local desc="$1"; local expected="$2"
  shift 2
  # remaining args are env=value pairs then the command
  env "$@" bash "$HOOK" < /dev/null > /dev/null 2>&1
  local actual=$?
  if [ "$actual" -eq "$expected" ]; then ((PASS++)); echo "  ✓ $desc"
  else ((FAIL++)); echo "  ✗ $desc (expected exit $expected, got $actual)"; fi
}

TMPDIR_TEST=$(mktemp -d)
CONFIG_DIR="$TMPDIR_TEST/.claude"
mkdir -p "$CONFIG_DIR"

echo "verify-tests:"

# No config file at all — should skip (exit 0)
assert_exit "exits 0 when no config file" 0 "AEGIS_CONFIG_DIR=$TMPDIR_TEST/nonexistent"

# Config exists but no testRunner field — should skip (exit 0)
echo '{"project":{}}' > "$CONFIG_DIR/aegis-flow.json"
assert_exit "exits 0 when no testRunner in config" 0 "AEGIS_CONFIG_DIR=$CONFIG_DIR"

# Config with empty testRunner — should skip (exit 0)
echo '{"project":{"testRunner":""}}' > "$CONFIG_DIR/aegis-flow.json"
assert_exit "exits 0 when testRunner is empty string" 0 "AEGIS_CONFIG_DIR=$CONFIG_DIR"

# Config with testRunner set to a command that always passes
echo '{"project":{"testRunner":"true"}}' > "$CONFIG_DIR/aegis-flow.json"
assert_exit "exits 0 when test runner passes" 0 "AEGIS_CONFIG_DIR=$CONFIG_DIR"

# Config with testRunner set to a command that always fails — should exit 2
echo '{"project":{"testRunner":"false"}}' > "$CONFIG_DIR/aegis-flow.json"
assert_exit "exits 2 when test runner fails" 2 "AEGIS_CONFIG_DIR=$CONFIG_DIR"

# Known runner: vitest maps to npx vitest run (will fail if not installed, that's ok — we just test the mapping logic)
# We verify it does NOT exit 0 when a runner is configured but binary missing (treated as failure)
# Instead test that the runner key is mapped: we simulate by overriding PATH to use a fake runner
FAKE_BIN="$TMPDIR_TEST/bin"
mkdir -p "$FAKE_BIN"

# Fake npx that echoes its args and exits 0
cat > "$FAKE_BIN/npx" << 'EOF'
#!/bin/bash
exit 0
EOF
chmod +x "$FAKE_BIN/npx"

echo '{"project":{"testRunner":"vitest"}}' > "$CONFIG_DIR/aegis-flow.json"
assert_exit "exits 0 when vitest runner mapped and passes" 0 "AEGIS_CONFIG_DIR=$CONFIG_DIR" "PATH=$FAKE_BIN:$PATH"

# Fake npx that exits 1 (tests fail)
cat > "$FAKE_BIN/npx" << 'EOF'
#!/bin/bash
exit 1
EOF
chmod +x "$FAKE_BIN/npx"

echo '{"project":{"testRunner":"vitest"}}' > "$CONFIG_DIR/aegis-flow.json"
assert_exit "exits 2 when vitest runner mapped and fails" 2 "AEGIS_CONFIG_DIR=$CONFIG_DIR" "PATH=$FAKE_BIN:$PATH"

# Cleanup
rm -rf "$TMPDIR_TEST"

echo ""; echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] || exit 1
