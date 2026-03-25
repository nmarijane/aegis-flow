#!/bin/bash
# aegis-flow hook: branch-protection (paranoid)
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
if [ -z "$COMMAND" ]; then exit 0; fi

# Block push to main/master
if echo "$COMMAND" | grep -qE 'git\s+push\s+\S+\s+(main|master)(\s|$)'; then
  echo "aegis-flow [paranoid]: blocked push to protected branch. Use a feature branch." >&2
  exit 2
fi

# Block commit when on main/master
if echo "$COMMAND" | grep -qE 'git\s+commit'; then
  CURRENT_BRANCH="${AEGIS_CURRENT_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null)}"
  if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
    echo "aegis-flow [paranoid]: blocked commit on '$CURRENT_BRANCH'. Create a feature branch first." >&2
    exit 2
  fi
fi

exit 0
