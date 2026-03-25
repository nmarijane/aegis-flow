#!/bin/bash
# aegis-flow hook: block-network (paranoid)
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
if [ -z "$COMMAND" ]; then exit 0; fi

if echo "$COMMAND" | grep -qE '\b(curl|wget)\b'; then
  echo "aegis-flow [paranoid]: blocked outbound network call. Whitelist domains in aegis-flow.json if needed." >&2
  exit 2
fi

exit 0
