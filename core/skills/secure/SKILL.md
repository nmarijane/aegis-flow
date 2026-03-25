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

Dispatch the `security-auditor` agent (defined in core/agents/security-auditor.md) with:
- The scope (full project or specific path)
- Instructions to follow its own agent definition
- Request to write findings to .claude/aegis-flow-security.json
