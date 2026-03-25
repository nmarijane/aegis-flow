#!/bin/bash
# aegis-flow hook: verify-tests
# Stop hook — runs project test suite before Claude finishes; blocks if tests fail

CONFIG_DIR="${AEGIS_CONFIG_DIR:-.claude}"
CONFIG_FILE="$CONFIG_DIR/aegis-flow.json"
if [ -n "$CLAUDE_PROJECT_DIR" ] && [ ! -f "$CONFIG_FILE" ]; then
  CONFIG_FILE="$CLAUDE_PROJECT_DIR/.claude/aegis-flow.json"
fi
if [ ! -f "$CONFIG_FILE" ]; then exit 0; fi

TEST_RUNNER=$(jq -r '.project.testRunner // empty' "$CONFIG_FILE")
if [ -z "$TEST_RUNNER" ]; then exit 0; fi

# Map known runner names to full commands
case "$TEST_RUNNER" in
  vitest) CMD="npx vitest run --reporter=verbose" ;;
  jest)   CMD="npx jest --verbose" ;;
  pytest) CMD="pytest -v" ;;
  mocha)  CMD="npx mocha" ;;
  rspec)  CMD="bundle exec rspec" ;;
  *)      CMD="$TEST_RUNNER" ;;
esac

OUTPUT=$(eval "$CMD" 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo "aegis-flow: tests failed — fix before finishing." >&2
  echo "$OUTPUT" >&2
  exit 2
fi

exit 0
