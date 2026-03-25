# aegis-flow

Professional AI workflow for Claude Code — secure, tested, production-ready.

One command to set up enterprise-grade guardrails, code quality enforcement, and structured process for your AI-assisted development.

## Quick Start

```bash
npx aegis-flow init
```

That's it. Your project is now configured with security hooks, code review agents, and TDD workflows.

## What You Get

### Security Hooks (automatic, always-on)

Three security levels — each builds on the previous:

| Level | What it does |
|-------|-------------|
| **standard** | Block secret file edits (`.env`, `*.pem`, `*.key`), protect lockfiles, auto-format code |
| **strict** (recommended) | + Block dangerous commands (`rm -rf`, force push, `DROP TABLE`), verify tests before completion, audit log |
| **paranoid** | + Block outbound network calls, branch protection (no direct push to main) |

### Core Skills (on-demand)

| Command | Description |
|---------|-------------|
| `/review` | Code review — quality, security, missing tests |
| `/secure` | Security audit (OWASP top 10) |
| `/test` | TDD workflow — red, green, refactor |
| `/doctor` | Verify your aegis-flow setup |

### Optional Modules

Enable domain-specific tooling:

| Module | Description |
|--------|-------------|
| `crypto-forge` | Build trading bots, DApps, smart contracts |
| `saas-forge` | Scaffold full-stack SaaS apps |
| `ticket-pilot` | Resolve, triage, and manage issues (GitHub, Linear, Jira) |

```bash
aegis-flow add crypto-forge
aegis-flow add ticket-pilot
```

## How It Works

aegis-flow is a [Claude Code plugin](https://docs.anthropic.com/en/docs/claude-code) with a CLI configurator. The CLI detects your project, asks a few questions, and writes two files:

- `.claude/aegis-flow.json` — your project config (security level, modules, detected tools)
- `.claude/settings.json` — Claude Code hooks that enforce security and quality

Both files are committed to git. Every team member gets the same workflow automatically.

### Init Flow

```
$ npx aegis-flow init

🛡️  aegis-flow — Professional AI Workflow

Detecting project...
  ✓ Language: TypeScript
  ✓ Framework: Next.js
  ✓ Package manager: pnpm
  ✓ Test runner: vitest
  ✓ Formatter: prettier

? Security level? strict (recommended)
? Enable modules? ticket-pilot

✓ Config written
✓ Hooks configured (6 hooks active)
✓ Plugin installed

Done! Run `claude` to start with your secured workflow.
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `npx aegis-flow init` | Interactive project setup |
| `aegis-flow add <module>` | Enable a module |
| `aegis-flow remove <module>` | Disable a module |
| `aegis-flow doctor` | Verify setup health |
| `aegis-flow update` | Regenerate config after upgrade |

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed
- `jq` available in PATH (used by hooks)
- Node.js 18+

## Architecture

```
aegis-flow/
├── cli/           # Node.js CLI (the only JavaScript)
├── core/
│   ├── hooks/     # Shell scripts — security & quality enforcement
│   ├── agents/    # Markdown — code-reviewer, security-auditor, tdd-runner
│   └── skills/    # Markdown — /review, /secure, /test, /doctor
└── modules/       # Domain-specific plugins (opt-in)
    ├── crypto-forge/
    ├── saas-forge/
    └── ticket-pilot/
```

Everything except the CLI is pure Markdown and shell scripts. No build step, no bundler, no runtime dependencies.

## Team Usage

After `aegis-flow init`, commit the generated files:

```bash
git add .claude/aegis-flow.json .claude/settings.json
git commit -m "chore: configure aegis-flow"
```

New team members clone the repo and get the full workflow. No per-developer setup needed.

## License

MIT
