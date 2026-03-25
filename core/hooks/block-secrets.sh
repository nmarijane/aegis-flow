#!/bin/bash
# aegis-flow hook: block-secrets
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then exit 0; fi

BASENAME=$(basename "$FILE_PATH")

# Block .env files (but not .envrc)
if [[ "$BASENAME" =~ ^\.env($|\.) ]]; then
  echo "aegis-flow: blocked editing secret file '$BASENAME'. Secrets must be managed outside Claude." >&2
  exit 2
fi

# Block credential files
if [[ "$BASENAME" =~ ^credentials\. ]]; then
  echo "aegis-flow: blocked editing credential file '$BASENAME'." >&2
  exit 2
fi

# Block private keys
if [[ "$BASENAME" =~ \.(pem|key)$ ]]; then
  echo "aegis-flow: blocked editing key file '$BASENAME'." >&2
  exit 2
fi

exit 0
