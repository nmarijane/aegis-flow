# ticket-pilot — Design Specification

## Overview

**ticket-pilot** is a Claude Code plugin that integrates issue trackers (Linear, GitHub Issues, Jira) directly into the developer workflow. It provides four slash commands — `/resolve`, `/triage`, `/explore`, `/create` — that let developers interact with tickets without leaving the terminal.

The plugin follows a "skills-only" architecture: pure Markdown skills orchestrate existing MCP servers and CLI tools, with no custom runtime or dependencies.

**Target:** Claude Code plugin system (as documented at [code.claude.com/docs/en/plugins-reference](https://code.claude.com/docs/en/plugins-reference)).

## Goals

- **Unified interface** across issue trackers — same commands regardless of Linear, GitHub, or Jira
- **Workflow automation** — go from ticket to PR in a single command
- **Zero dependencies** — no build step, no npm install, no runtime
- **Easy contribution** — modifying a Markdown file is accessible to anyone
- **Open-source first** — MIT licensed, designed for the Claude Code plugin marketplace

## Architecture

### Approach: Pure Skills

The plugin contains only Markdown-based skills, agent definitions, and a shell script. All API interactions are delegated to:

- **Linear MCP server** (`https://mcp.linear.app/mcp`) for Linear
- **Atlassian MCP server** for Jira
- **GitHub CLI (`gh`)** for GitHub Issues

No custom MCP server, no TypeScript, no build step.

### Plugin Structure

```
ticket-pilot/
  .claude-plugin/
    plugin.json             # Plugin manifest
  skills/
    resolve/SKILL.md        # /ticket-pilot:resolve
    triage/SKILL.md         # /ticket-pilot:triage
    explore/SKILL.md        # /ticket-pilot:explore
    create/SKILL.md         # /ticket-pilot:create
  agents/
    resolver.md             # Subagent for implementation work
    triager.md              # Subagent for batch analysis
  scripts/
    detect-tracker.sh       # Tracker detection by ID format
  README.md
  LICENSE
```

### Plugin Manifest (`plugin.json`)

Validated against the [Claude Code plugin manifest schema](https://code.claude.com/docs/en/plugins-reference). `name` is the only required field. `skills` and `agents` accept string paths or arrays, relative to plugin root.

```json
{
  "name": "ticket-pilot",
  "version": "0.1.0",
  "description": "Issue tracker integration for Claude Code — resolve, triage, explore, and create tickets from your terminal",
  "author": { "name": "Nicolas Meridjen" },
  "repository": "https://github.com/<username>/ticket-pilot",
  "license": "MIT",
  "keywords": ["linear", "github", "jira", "issues", "tickets", "workflow"],
  "skills": "./skills/",
  "agents": "./agents/"
}
```

## Tracker Detection & Routing

Three-tier strategy to determine which tracker to use:

### 1. Project Configuration (highest priority)

If `.claude/ticket-pilot.json` exists in the project root:

```json
{
  "tracker": "linear",
  "teamPrefixes": ["ENG", "DES"],
  "defaultPrefix": "ENG"
}
```

### 2. MCP Server Detection (medium priority)

Check which MCP servers are available. If only one tracker's MCP server is configured, use it. If multiple are present, fall back to identifier format or ask the user.

### 3. Identifier Format (fallback)

| Pattern | Tracker |
|---------|---------|
| `#123` or `owner/repo#123` | GitHub |
| `PREFIX-123` | Ambiguous (Linear or Jira) — ask user |
| Unknown format | Ask user |

**Ambiguity resolution:** When the user resolves an ambiguous identifier for the first time, offer to persist the choice by creating or updating `.claude/ticket-pilot.json`. This ensures the choice is remembered across sessions without relying on transient state.

### `detect-tracker.sh` Interface

**Input:** single argument — the ticket identifier string.

**Output (stdout):** one of `github`, `linear`, `jira`, `ambiguous`, `unknown`.

**Exit codes:** `0` = detection succeeded (including `ambiguous`), `1` = error.

```bash
#!/bin/bash
ID="$1"
if [[ -z "$ID" ]]; then
  echo "unknown"; exit 1
fi
if [[ "$ID" =~ ^#[0-9]+$ ]] || [[ "$ID" =~ ^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+#[0-9]+$ ]]; then
  echo "github"
elif [[ "$ID" =~ ^[A-Z]{2,5}-[0-9]+$ ]]; then
  echo "ambiguous"  # Could be Linear or Jira
else
  echo "unknown"
fi
```

Skills invoke this via `!`${CLAUDE_PLUGIN_ROOT}/scripts/detect-tracker.sh $ARGUMENTS`` in the skill body.

### MCP Tool Mapping

| Action | Linear MCP | GitHub (`gh` CLI) | Jira (Atlassian MCP) |
|--------|-----------|-------------------|---------------------|
| Read ticket | `get_issue` | `gh issue view` | `getJiraIssue` |
| List tickets | `list_issues` / `list_my_issues` | `gh issue list` | `searchJiraIssuesUsingJql` |
| Update status | `update_issue` + `get_issue_status` / `list_issue_statuses` | `gh issue edit` | `transitionJiraIssue` |
| Add comment | `create_comment` | `gh issue comment` | `addCommentToJiraIssue` |
| List comments | `list_comments` | `gh issue view --comments` | (included in `getJiraIssue`) |
| Create ticket | `create_issue` | `gh issue create` | `createJiraIssue` |
| Get labels | `list_issue_labels` | `gh label list` | (included in `getJiraIssue`) |
| Get branch name | `get_issue_git_branch_name` | N/A | N/A |

**Note:** Linear MCP tool names are unprefixed (e.g., `get_issue`, not `linear_get_issue`). They are exposed by the official server at `https://mcp.linear.app/mcp`. Full list of 26+ tools documented at [linear.app/docs/mcp](https://linear.app/docs/mcp).

## Skills

### Skill Skeleton

All skills follow this frontmatter structure (per [Claude Code skills docs](https://code.claude.com/docs/en/skills)):

```yaml
---
name: <skill-name>
description: <when to use this skill>
argument-hint: [TICKET-ID]
context: fork          # optional — runs in isolated subagent
agent: resolver        # optional — which subagent to use
allowed-tools: ...     # optional — tool restrictions
---

Instructions using $ARGUMENTS for the ticket ID...
```

**Key variables:** `$ARGUMENTS` (all args), `$0`/`$1` (positional), `${CLAUDE_PLUGIN_ROOT}` (plugin directory path).

### `/ticket-pilot:resolve TICKET-ID [--auto|--guided]`

Reads a ticket, implements the solution, and creates a PR.

```yaml
---
name: resolve
description: Resolve an issue tracker ticket by reading it, implementing the solution, and creating a PR
argument-hint: [TICKET-ID] [--auto|--guided]
context: fork
agent: resolver
---
```

**Mode: guided (default)**

1. Detect tracker and fetch ticket (title, description, comments, labels, acceptance criteria)
2. Present a structured summary to the user
3. Analyze the codebase and propose an action plan
4. **Wait for user approval**
5. Create branch (see Branch Naming below)
6. Implement the solution
7. Run tests
8. **Gate: tests must pass before proceeding.** If tests fail, report failures and stop.
9. Create commit referencing the ticket
10. Offer to create PR and update ticket status

**Mode: auto (`--auto`)**

Steps 1-10 execute without pauses, with these safety guardrails:
- **Tests must pass** before committing (step 8). If tests fail, stop and report.
- **No PR creation** unless tests pass.
- User is notified at completion with a full summary of changes made.

**Execution:** Delegates to `resolver` subagent via `context: fork`. This creates an isolated conversation context — the subagent receives the skill instructions as its prompt and does not share the main conversation history. Results are summarized back to the main context.

#### Branch Naming

- **Base branch:** the project's default branch (detected via `git symbolic-ref refs/remotes/origin/HEAD` or falling back to `main`)
- **Branch name:** `feat/<TICKET-ID>-<title-slug>` where `title-slug` is the ticket title lowercased, non-alphanumeric characters replaced with hyphens, truncated to 50 characters
- **Branch exists:** if `feat/<TICKET-ID>-*` already exists, check it out and continue from where it left off
- **Dirty working tree:** if uncommitted changes exist, warn the user and ask whether to stash, commit, or abort

### `/ticket-pilot:triage TICKET-ID [--batch ID...] [--sprint]`

Analyzes tickets and provides actionable recommendations.

```yaml
---
name: triage
description: Analyze issue tracker tickets and provide priority, complexity, and dependency recommendations
argument-hint: [TICKET-ID] [--batch ID...] [--sprint]
---
```

**Single ticket (default):**

1. Read the ticket
2. Analyze: estimated complexity (S/M/L/XL), impacted components, risks, dependencies
3. Suggest: priority, labels, questions to clarify before implementation
4. Optionally update the ticket with suggestions

**Batch mode (`--batch` or multiple IDs):**

1. Read all tickets
2. Rank by recommended priority
3. Identify inter-ticket dependencies
4. Propose optimal processing order

**Sprint mode (`--sprint`):**

Fetches all tickets in the current sprint/cycle for the detected tracker:
- **Linear:** uses `list_issues` filtered by the active cycle
- **GitHub:** uses `gh issue list --milestone <current>`
- **Jira:** uses `searchJiraIssuesUsingJql` with `sprint in openSprints()`

Then processes them as a batch (same as batch mode steps 1-4).

**Execution:** Single ticket runs in main context. Batch/sprint mode uses `triager` subagent via `context: fork` for isolation.

### `/ticket-pilot:explore TICKET-ID`

Read-only analysis of a ticket and its codebase context.

```yaml
---
name: explore
description: Read an issue tracker ticket and analyze the codebase to provide a structured summary
argument-hint: [TICKET-ID]
---
```

1. Read full ticket (description, comments, links, sub-tasks)
2. Analyze codebase to identify affected files/modules
3. Present structured summary:
   - What the ticket asks for
   - Likely impacted files
   - Relevant technical context
   - Open questions or ambiguities

No modifications to code or ticket. Runs in main context (no subagent needed).

### `/ticket-pilot:create [--tracker linear|github|jira]`

Creates a well-structured ticket from a conversation.

```yaml
---
name: create
description: Create a new issue tracker ticket with structured title, description, labels, and acceptance criteria
argument-hint: [--tracker linear|github|jira] [description]
---
```

1. Ask the user to describe the problem or feature
2. Analyze the codebase to enrich context
3. Generate structured ticket:
   - **All trackers:** title, description, acceptance criteria
   - **Linear:** team (from config or ask), labels (from `list_issue_labels`), priority
   - **GitHub:** repository (from current repo), labels (from `gh label list`)
   - **Jira:** project key (from config or ask), issue type (from `getJiraIssueTypeMetaWithFields`)
4. Preview and wait for user approval
5. Create the ticket via the tracker's MCP tools

Runs in main context (no subagent needed).

## Agents

### `resolver.md`

Specialized subagent for implementation work. Invoked by `/resolve` with `context: fork` and `agent: resolver`.

```yaml
---
name: resolver
description: Implements code changes to resolve an issue tracker ticket
tools: Read, Edit, Write, Bash, Grep, Glob, Agent
---
```

**Responsibilities:**
- Analyze ticket requirements and codebase
- Plan modifications
- Implement, test, commit
- Create PR if requested

### `triager.md`

Specialized subagent for ticket analysis. Invoked by `/triage` in batch/sprint mode via `context: fork` and `agent: triager`.

```yaml
---
name: triager
description: Analyzes issue tracker tickets for complexity, priority, and dependencies
tools: Read, Grep, Glob, Bash(gh *)
---
```

**Responsibilities:**
- Read and analyze one or more tickets
- Evaluate complexity, risks, dependencies
- Produce a structured report

## Prerequisites & Error Handling

### Prerequisites Check

Each skill begins by verifying the target tracker is accessible:

| Tracker | Prerequisite | Error Message |
|---------|-------------|---------------|
| Linear | MCP server `linear` configured | "Add the Linear MCP server: `claude mcp add --transport http linear https://mcp.linear.app/mcp`" |
| GitHub | `gh` CLI installed and authenticated | "Install GitHub CLI: `brew install gh && gh auth login`" |
| Jira | MCP server `atlassian` configured | "Add the Atlassian MCP server and configure it for your instance" |

### Error Handling

- **Ticket not found** — explicit message with the identifier attempted
- **Insufficient permissions** — guide to auth configuration
- **MCP server unavailable** — suggest checking with `/mcp`
- **Ambiguous tracker** — ask user to specify, offer to persist choice in `.claude/ticket-pilot.json`
- **Tests fail in auto mode** — stop before committing, report failures

## Configuration

### Settings Merge Order

Settings are resolved in this priority (highest wins):

1. **Command-line flags** (e.g., `--auto`, `--tracker linear`)
2. **Per-project config** (`.claude/ticket-pilot.json`)
3. **Hardcoded defaults** in skill Markdown instructions

### Hardcoded Defaults

Each skill defines its own defaults in its Markdown instructions. For example, `/resolve` defaults to `guided` mode unless `--auto` is passed or `.claude/ticket-pilot.json` specifies `"defaultMode": "auto"`.

### `.claude/ticket-pilot.json` (per-project, optional)

```json
{
  "tracker": "linear",
  "teamPrefixes": ["ENG", "DES"],
  "defaultPrefix": "ENG",
  "defaultMode": "guided"
}
```

All fields are optional. Only the fields present override the plugin defaults.

## Distribution

- **Phase 1:** GitHub repository under MIT license
- **Phase 2:** Submit to the official Anthropic plugin marketplace once stable

## Out of Scope (v1)

- Custom MCP server or TypeScript runtime
- OAuth flow management (delegated to MCP servers)
- Webhook/real-time notifications
- Multi-repo support in a single command
- Ticket templates or custom workflows
- Status polling / sync after PR creation (future consideration)
