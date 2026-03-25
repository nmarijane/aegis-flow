#!/bin/bash
# aegis-flow hook: protect-lockfiles
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
if [ -z "$FILE_PATH" ]; then exit 0; fi
BASENAME=$(basename "$FILE_PATH")
LOCKFILES="package-lock.json pnpm-lock.yaml yarn.lock Gemfile.lock poetry.lock bun.lockb Cargo.lock composer.lock"
for lockfile in $LOCKFILES; do
  if [ "$BASENAME" = "$lockfile" ]; then
    echo "aegis-flow: blocked editing lockfile '$BASENAME'. Use the package manager to update dependencies." >&2
    exit 2
  fi
done
exit 0
