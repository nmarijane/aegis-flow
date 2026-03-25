#!/bin/bash
# aegis-flow hook: audit-log
# PostToolUse — appends a JSON entry to the audit log for every tool use

INPUT=$(cat)

TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
TARGET=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.command // empty')
# Truncate target to 200 characters
TARGET="${TARGET:0:200}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

CONFIG_DIR="${AEGIS_CONFIG_DIR:-.claude}"
LOG_FILE="$CONFIG_DIR/aegis-flow-audit.log"

mkdir -p "$CONFIG_DIR"

# Append JSON line (NDJSON / JSON Lines format)
printf '{"timestamp":"%s","tool":"%s","target":"%s"}\n' \
  "$TIMESTAMP" \
  "$TOOL" \
  "$TARGET" \
  >> "$LOG_FILE"

exit 0
