# aegis-flow — Design Specification

**Date:** 2026-03-25
**Status:** Draft
**Domain:** aegis-flow.com

## Overview

aegis-flow is a distributable CLI + Claude Code plugin that gives any developer or team a professional, secure, production-ready AI workflow out of the box. One command (`npx aegis-flow init`) configures hooks, agents, skills, and modules tailored to the project.

**Target audience:** Individual developers and companies adopting AI-assisted development who need enterprise-grade guardrails, code quality enforcement, and structured process.

## Architecture

Mono-plugin with CLI configurator. Single GitHub repository, single Claude Code plugin. The CLI generates project-specific configuration; everything else is pure Markdown and shell scripts with zero runtime dependencies.

```
aegis-flow/
├── cli/
│   ├── bin/aegis-flow.js
│   ├── commands/
│   │   ├── init.js
│   │   ├── add.js
│   │   ├── remove.js
│   │   ├── doctor.js
│   │   └── update.js
│   ├── templates/
│   └── package.json
│
├── core/
│   ├── hooks/
│   │   ├── pre-tool-use/
│   │   │   ├── block-secrets.sh
│   │   │   ├── protect-lockfiles.sh
│   │   │   └── validate-commands.sh
│   │   ├── post-tool-use/
│   │   │   ├── auto-format.sh
│   │   │   └── audit-log.sh
│   │   ├── stop/
│   │   │   └── verify-tests.sh
│   │   └── session-start/
│   │       └── inject-context.sh
│   │
│   ├── agents/
│   │   ├── code-reviewer.md
│   │   ├── security-auditor.md
│   │   └── tdd-runner.md
│   │
│   └── skills/
│       ├── review/SKILL.md
│       ├── secure/SKILL.md
│       ├── test/SKILL.md
│       └── doctor/SKILL.md
│
├── modules/
│   ├── crypto-forge/
│   │   ├── agents/
│   │   ├── skills/
│   │   ├── references/
│   │   └── README.md
│   ├── saas-forge/
│   │   ├── agents/
│   │   ├── skills/
│   │   └── README.md
│   └── ticket-pilot/
│       ├── agents/
│       ├── skills/
│       ├── scripts/
│       └── README.md
│
├── docs/
│   ├── getting-started.md
│   ├── configuration.md
│   ├── modules.md
│   └── hooks.md
│
├── .claude-plugin/
│   └── plugin.json
│
├── CLAUDE.md
├── LICENSE
├── README.md
└── package.json
```

## CLI

### Purpose

The CLI's only job is to configure the `.claude/` directory of the target project. It does not run at runtime. It detects the project environment, asks the user a few questions, installs the Claude Code plugin, and writes configuration files.

### Commands

| Command | Description |
|---------|-------------|
| `npx aegis-flow init` | Interactive project setup |
| `aegis-flow add <module>` | Enable a module |
| `aegis-flow remove <module>` | Disable a module |
| `aegis-flow doctor` | Verify setup health |
| `aegis-flow update` | Update config after plugin upgrade |

### `init` flow

1. Auto-detect project: language, framework, package manager, test runner, formatter
2. Ask security level: standard / strict / paranoid
3. Ask which modules to enable (context-aware suggestions)
4. Install the Claude Code plugin via `claude plugins add`
5. Write `.claude/settings.json` with appropriate hooks
6. Write `.claude/aegis-flow.json` with project config

### Generated files

**`.claude/aegis-flow.json`** — Project configuration:
```json
{
  "version": "1.0.0",
  "security": "strict",
  "modules": ["ticket-pilot"],
  "project": {
    "language": "typescript",
    "framework": "nextjs",
    "testRunner": "vitest",
    "packageManager": "pnpm",
    "formatter": "prettier"
  }
}
```

**`.claude/settings.json`** — Hooks injected based on security level. Both files are committed to git so the entire team shares the same workflow.

### Technology

Node.js, no heavy CLI framework. Dependencies: `inquirer` for prompts, `fs` for file operations. Single `package.json` inside `cli/` (not at repo root — the root `package.json` is a workspace pointer only).

### Plugin installation mechanism

The CLI installs the plugin by adding the repo path to `.claude/settings.json` under the plugins configuration. If `claude plugins add` becomes a supported CLI command in the future, the CLI will use it instead. The implementation should abstract this behind a helper function for easy swapping.

## Core — Hooks

Three security levels, each stacking on the previous.

### Level: `standard`

| Hook | Event | Matcher | Behavior |
|------|-------|---------|----------|
| `block-secrets` | PreToolUse | Edit\|Write | Blocks editing `.env`, `credentials.*`, `*.pem`, `*.key`. Exit 2 with reason. |
| `protect-lockfiles` | PreToolUse | Edit\|Write | Blocks manual modification of `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `Gemfile.lock`, `poetry.lock`. |
| `auto-format` | PostToolUse | Edit\|Write | Runs project formatter (detected from config). Prettier, Biome, Black, rustfmt. Silent skip if none found. |

### Level: `strict` (recommended)

Everything from `standard` plus:

| Hook | Event | Matcher | Behavior |
|------|-------|---------|----------|
| `validate-commands` | PreToolUse | Bash | Blocks `rm -rf`, `git push --force`, `git reset --hard`, `DROP TABLE`, `TRUNCATE`, `chmod 777`. Exit 2 with reason. |
| `verify-tests` | Stop | — | Command hook (type: `command`): runs the test command from `aegis-flow.json` config (e.g., `npm test`, `pytest`). If exit code != 0, returns the failure output via stderr (exit 2) so Claude continues working. |
| `audit-log` | PostToolUse | — | Appends a JSON entry to `.claude/aegis-flow-audit.log`: timestamp, tool, input summary, result summary. |

### Level: `paranoid`

Everything from `strict` plus:

| Hook | Event | Matcher | Behavior |
|------|-------|---------|----------|
| `block-network` | PreToolUse | Bash | Blocks `curl`, `wget`, outbound `fetch`, non-whitelisted network calls. |
| `require-approval` | PreToolUse | — | Prompt hook (type: `prompt`): LLM evaluates each action. High risk = destructive file operations, external network calls, database mutations, credential access. Blocks with explanation. |
| `branch-protection` | PreToolUse | Bash | Blocks direct commit/push to `main`/`master`. Forces feature branches. |

### Auto-format detection

The `auto-format` hook reads `aegis-flow.json` project config and selects:
- `prettier` detected → `npx prettier --write <file>`
- `biome` detected → `npx biome format --write <file>`
- `black` detected → `black <file>`
- `rustfmt` detected → `rustfmt <file>`
- Nothing detected → silent skip

## Core — Agents

### code-reviewer

- **Tools:** Read, Grep, Glob (read-only)
- **Purpose:** Reviews modified code for patterns, security, complexity, missing tests
- **Output:** Structured report with severity levels (critical/warning/info)
- **Dispatched by:** `/review` skill

### security-auditor

- **Tools:** Read, Grep, Glob (read-only)
- **Purpose:** Transversal security audit — OWASP top 10, hardcoded secrets, vulnerable dependencies, injection vectors
- **Output:** `.claude/aegis-flow-security.json` with findings
- **Dispatched by:** `/secure` skill

### tdd-runner

- **Tools:** Read, Write, Edit, Bash, Grep, Glob
- **Purpose:** Complete TDD cycle — writes tests first, then implementation, then refactor
- **Dispatched by:** `/test` skill

## Core — Skills

### `/review` — Code review

```
/review              → reviews modified files (git diff)
/review src/auth/    → reviews a specific directory
/review --pr 42      → reviews a pull request
```

Dispatches `code-reviewer` agent. Returns a structured report.

### `/secure` — Security audit

```
/secure              → full project audit
/secure src/api/     → targeted audit
```

Dispatches `security-auditor` agent. Generates `.claude/aegis-flow-security.json`.

### `/test` — TDD workflow

```
/test "user login should validate email"    → TDD for a feature
/test --fix                                 → fix failing tests
```

Dispatches `tdd-runner` agent. Red → Green → Refactor cycle.

### `/doctor` — Diagnostic

```
/doctor              → health check
```

No agent dispatch. Directly checks:
- Hooks installed and functional
- `aegis-flow.json` config valid
- Enabled modules consistent with project
- Formatter detected
- Test runner detected

## Modules

### Migration strategy

The three existing plugins (crypto-forge, saas-forge, ticket-pilot) move to `modules/` with minimal changes:

| Before | After |
|--------|-------|
| `crypto-forge/.claude-plugin/plugin.json` | Removed — root `plugin.json` manages everything |
| `crypto-forge/skills/bot/SKILL.md` | `modules/crypto-forge/skills/bot/SKILL.md` (unchanged) |
| `crypto-forge/agents/bot-builder.md` | `modules/crypto-forge/agents/bot-builder.md` (unchanged) |

Content of agents, skills, and references remains identical. Only the plugin manifest changes.

### Unified plugin.json

A single manifest at `.claude-plugin/plugin.json` declares all agents and skill directories. The CLI dynamically generates this manifest based on which modules are enabled in `aegis-flow.json`.

### Module activation/deactivation

When a module is disabled:
- Its agents and skills are not referenced in the generated `plugin.json`
- Its module-specific hooks (if any) are not added to `settings.json`
- Files remain in the repo but are not loaded by Claude Code

The `plugin.json` is generated statically at `init`/`add`/`remove` time and committed to git. There is no dynamic loading at runtime.

### Module inventory

**crypto-forge** (4 agents, 6 skills, 27+ references)
- Agents: bot-builder, contract-builder, dapp-builder, auditor
- Skills: setup, bot, dapp, contract, audit, deploy
- References: APIs (Binance, Coinbase, CoinGecko, Etherscan, Uniswap), patterns (arbitrage, AMM, ERC-20, ERC-721, lending, staking, market-making), security checklists

**saas-forge** (1 agent, 1 skill)
- Agent: saas-builder
- Skill: saas (brainstorm + scaffold)

**ticket-pilot** (3 agents, 6 skills)
- Agents: resolver, triager, moderator
- Skills: setup, resolve, triage, explore, create, moderate
- Scripts: detect-tracker.sh, pick.sh

## Onboarding

### Time to first use: < 2 minutes

1. `npx aegis-flow init` — interactive setup
2. Answer 3-4 questions (security level, modules)
3. `claude` — start working with secured workflow

### Team onboarding

Configuration files (`.claude/settings.json`, `.claude/aegis-flow.json`) are committed to git. New team members clone the repo and get the full workflow automatically. No per-developer setup needed beyond installing Claude Code.

### Daily workflow

- Developer codes normally with Claude
- Hooks run silently in the background (format, security blocks, test verification)
- Skills available on demand (`/review`, `/secure`, `/test`, `/doctor`)
- Module skills available based on config (`/resolve`, `/bot`, `/saas`, etc.)

## Priorities

1. **Code quality** — TDD enforcement, auto-review, formatting
2. **Security** — Secret protection, command validation, audit logging
3. **Process** — Branching strategy, PR structure, ticket linking
4. **Governance** — Audit logs, approval workflows, security levels
5. **Onboarding** — < 2 min setup, team-shared config

## Constraints

- No build step, no bundler (except the CLI itself)
- Agents and skills are pure Markdown
- Hooks are shell scripts (portable across macOS/Linux)
- Single `package.json` at root for the CLI only
- crypto-forge must not be published as a standalone public package (private constraint)

## Out of scope for V1

- Web dashboard or UI
- Paid tiers or licensing
- Custom module creation wizard
- CI/CD integration (GitHub Actions, etc.)
- VS Code extension
