#!/bin/bash
# aegis-flow hook: auto-format
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then exit 0; fi

CONFIG_DIR="${AEGIS_CONFIG_DIR:-.claude}"
CONFIG_FILE="$CONFIG_DIR/aegis-flow.json"
if [ -n "$CLAUDE_PROJECT_DIR" ] && [ ! -f "$CONFIG_FILE" ]; then
  CONFIG_FILE="$CLAUDE_PROJECT_DIR/.claude/aegis-flow.json"
fi
if [ ! -f "$CONFIG_FILE" ]; then exit 0; fi

FORMATTER=$(jq -r '.project.formatter // empty' "$CONFIG_FILE")
if [ -z "$FORMATTER" ]; then exit 0; fi

case "$FORMATTER" in
  prettier) npx prettier --write "$FILE_PATH" > /dev/null 2>&1 ;;
  biome) npx biome format --write "$FILE_PATH" > /dev/null 2>&1 ;;
  black) black "$FILE_PATH" > /dev/null 2>&1 ;;
  rustfmt) rustfmt "$FILE_PATH" > /dev/null 2>&1 ;;
esac
exit 0
