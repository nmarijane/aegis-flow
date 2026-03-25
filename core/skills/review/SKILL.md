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

Dispatch the `code-reviewer` agent (defined in core/agents/code-reviewer.md) with:
- The scope (git diff, directory, or PR)
- Instructions to follow its own agent definition
- Request for structured report output
