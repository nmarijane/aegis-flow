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
   - Verify its agents and skills are present
   - Report: ✓ Modules consistent / ✗ Module mismatch

5. **Check project detection:**
   - Verify formatter exists if configured
   - Verify test runner exists if configured
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
