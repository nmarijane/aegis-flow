# ticket-pilot — Design Specification

## Overview

**ticket-pilot** is a Claude Code plugin that integrates issue trackers (Linear, GitHub Issues, Jira) directly into the developer workflow. It provides four slash commands — `/resolve`, `/triage`, `/explore`, `/create` — that let developers interact with tickets without leaving the terminal.

The plugin follows a "skills-only" architecture: pure Markdown skills orchestrate existing MCP servers and CLI tools, with no custom runtime or dependencies.

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
  settings.json             # Default plugin settings
  README.md
  LICENSE
```

### Plugin Manifest (`plugin.json`)

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
| `PREFIX-123` | Ambiguous (Linear or Jira) — ask user, remember choice |
| Unknown format | Ask user |

### MCP Tool Mapping

| Action | Linear MCP | GitHub (`gh` CLI) | Jira (Atlassian MCP) |
|--------|-----------|-------------------|---------------------|
| Read ticket | Linear MCP tools | `gh issue view` | `getJiraIssue` |
| Update status | Linear MCP tools | `gh issue edit` | `transitionJiraIssue` |
| Add comment | Linear MCP tools | `gh issue comment` | `addCommentToJiraIssue` |
| Create ticket | Linear MCP tools | `gh issue create` | `createJiraIssue` |

## Skills

### `/ticket-pilot:resolve TICKET-ID [--auto|--guided]`

Reads a ticket, implements the solution, and creates a PR.

**Mode: guided (default)**

1. Detect tracker and fetch ticket (title, description, comments, labels, acceptance criteria)
2. Present a structured summary to the user
3. Analyze the codebase and propose an action plan
4. **Wait for user approval**
5. Create branch `feat/TICKET-ID-title-slug`
6. Implement the solution
7. Run tests
8. Create commit referencing the ticket
9. Offer to create PR and update ticket status

**Mode: auto (`--auto`)**

Steps 1-9 execute without pauses. User is notified at completion with a summary.

**Execution:** Delegates to `resolver` subagent with `context: fork` for isolation.

### `/ticket-pilot:triage TICKET-ID [--batch ID...] [--sprint]`

Analyzes tickets and provides actionable recommendations.

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

**Execution:** Uses `triager` subagent in batch mode for parallelization.

### `/ticket-pilot:explore TICKET-ID`

Read-only analysis of a ticket and its codebase context.

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

1. Ask the user to describe the problem or feature
2. Analyze the codebase to enrich context
3. Generate structured ticket (title, description, suggested labels, acceptance criteria)
4. Preview and wait for user approval
5. Create the ticket via the tracker's MCP tools

Runs in main context (no subagent needed).

## Agents

### `resolver.md`

Specialized subagent for implementation work. Invoked by `/resolve` with `context: fork`.

**Responsibilities:**
- Analyze ticket requirements and codebase
- Plan modifications
- Implement, test, commit
- Create PR if requested

### `triager.md`

Specialized subagent for ticket analysis. Invoked by `/triage` in batch mode.

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
- **Ambiguous tracker** — ask user to specify or create `.claude/ticket-pilot.json`

## Configuration

### `settings.json` (plugin defaults)

```json
{
  "ticket-pilot": {
    "defaultMode": "guided"
  }
}
```

### `.claude/ticket-pilot.json` (per-project, optional)

```json
{
  "tracker": "linear",
  "teamPrefixes": ["ENG", "DES"],
  "defaultPrefix": "ENG"
}
```

## Distribution

- **Phase 1:** GitHub repository under MIT license
- **Phase 2:** Submit to the official Anthropic plugin marketplace once stable

## Out of Scope (v1)

- Custom MCP server or TypeScript runtime
- OAuth flow management (delegated to MCP servers)
- Webhook/real-time notifications
- Multi-repo support in a single command
- Ticket templates or custom workflows
