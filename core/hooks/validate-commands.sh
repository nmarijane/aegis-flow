#!/bin/bash
# aegis-flow hook: validate-commands
# PreToolUse (Bash) — blocks dangerous shell commands
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then exit 0; fi

# Block rm -rf on root, home, or current directory
if echo "$COMMAND" | grep -qE '(^|[[:space:]])rm[[:space:]].*-[a-zA-Z]*r[a-zA-Z]*f[[:space:]]*(\/|~|\.)([[:space:]]|$)|(^|[[:space:]])rm[[:space:]].*-[a-zA-Z]*f[a-zA-Z]*r[[:space:]]*(\/|~|\.)([[:space:]]|$)'; then
  echo "aegis-flow: blocked 'rm -rf' on a dangerous target ('/', '~', '.'). Be specific about what to delete." >&2
  exit 2
fi

# Block git push --force or git push -f
if echo "$COMMAND" | grep -qE '(^|[[:space:]])git[[:space:]]+push\b.*(\s--force\b|\s-f\b)'; then
  echo "aegis-flow: blocked 'git push --force'. Force pushing can destroy remote history. Use --force-with-lease or open a PR." >&2
  exit 2
fi

# Block git reset --hard
if echo "$COMMAND" | grep -qE '(^|[[:space:]])git[[:space:]]+reset\b.*\s--hard\b'; then
  echo "aegis-flow: blocked 'git reset --hard'. This discards uncommitted changes permanently. Use --soft or --mixed instead." >&2
  exit 2
fi

# Block SQL destructive statements (case insensitive)
if echo "$COMMAND" | grep -qiE '\b(DROP[[:space:]]+(TABLE|DATABASE)|TRUNCATE)\b'; then
  echo "aegis-flow: blocked destructive SQL statement (DROP TABLE / DROP DATABASE / TRUNCATE). Run this manually if you are certain." >&2
  exit 2
fi

# Block chmod 777
if echo "$COMMAND" | grep -qE '(^|[[:space:]])chmod[[:space:]]+777\b'; then
  echo "aegis-flow: blocked 'chmod 777'. World-writable permissions are a security risk. Use 755 or more restrictive permissions." >&2
  exit 2
fi

exit 0
