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
