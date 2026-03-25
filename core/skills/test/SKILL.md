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

Dispatch the `tdd-runner` agent (defined in core/agents/tdd-runner.md) with:
- Mode: new feature or fix
- Feature description or failure output
- Instructions to follow its own agent definition
