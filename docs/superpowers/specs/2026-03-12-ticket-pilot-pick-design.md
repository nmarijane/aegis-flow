# ticket-pilot pick.sh — Design Specification

## Overview

`pick.sh` is an interactive ticket picker script for the ticket-pilot Claude Code plugin. It runs directly in the user's terminal (not through Claude Code) to provide arrow-key navigation for selecting tickets, then launches Claude Code with the chosen ticket and action.

## Goals

- **Interactive UX** — arrow-key navigation with `gum choose` for ticket selection
- **Multi-tracker** — supports GitHub Issues, Linear, and Jira
- **Flexible scope** — assigned tickets by default, `--all` for everything, `--sprint` for current sprint
- **Optional action argument** — pass the action upfront or pick it interactively

## Interface

```bash
./pick.sh                          # my tickets → pick action
./pick.sh resolve                  # my tickets → resolve selected
./pick.sh explore --all            # all tickets → explore selected
./pick.sh triage --sprint          # sprint tickets → triage selected
./pick.sh --tracker github         # force GitHub tracker
./pick.sh --tracker jira resolve   # force Jira + resolve action
```

### Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `[action]` | `resolve`, `explore`, `triage` | Interactive picker |
| `--tracker` | `github`, `linear`, `jira` | Auto-detected from config |
| `--all` | Show all open tickets | Off (assigned only) |
| `--sprint` | Show current sprint/cycle tickets | Off |

## Flow

```
1. Check gum is installed (if not, suggest: brew install gum)
2. Parse arguments (action, --tracker, --all, --sprint)
3. Detect tracker:
   a. --tracker flag if provided
   b. .claude/ticket-pilot.json config if exists
   c. Prompt user via gum choose (github/linear/jira)
4. Fetch tickets based on scope (assigned / --all / --sprint)
5. Display tickets in gum choose picker (arrow keys + enter)
6. If no action argument → second gum choose picker (resolve/explore/triage)
7. Launch: claude "/ticket-pilot:<action> <TICKET-ID>"
```

## Fetching Tickets

### GitHub Issues

Uses `gh` CLI (already authenticated).

| Scope | Command |
|-------|---------|
| My tickets | `gh issue list --assignee @me --state open --json number,title,labels --limit 50` |
| All tickets | `gh issue list --state open --json number,title,labels --limit 50` |
| Sprint | `gh issue list --milestone <current> --state open --json number,title,labels --limit 50` |

Current milestone detected via: `gh api repos/{owner}/{repo}/milestones --jq '.[] | select(.state=="open") | .title' | head -1`

### Linear

Uses `curl` to Linear GraphQL API. Requires `LINEAR_API_KEY` environment variable.

| Scope | GraphQL Query |
|-------|--------------|
| My tickets | `{ viewer { assignedIssues(filter: { state: { type: { nin: ["completed","canceled"] } } }) { nodes { identifier title state { name } } } } }` |
| All tickets | `{ issues(filter: { state: { type: { nin: ["completed","canceled"] } } }, first: 50) { nodes { identifier title state { name } } } }` |
| Sprint | `{ cycles(filter: { isActive: { eq: true } }, first: 1) { nodes { issues { nodes { identifier title state { name } } } } } }` |

### Jira

Uses `curl` to Jira REST API. Requires `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` environment variables.

| Scope | JQL |
|-------|-----|
| My tickets | `assignee = currentUser() AND status != Done ORDER BY updated DESC` |
| All tickets | `status != Done ORDER BY updated DESC` |
| Sprint | `sprint in openSprints() AND status != Done ORDER BY priority ASC` |

API endpoint: `${JIRA_BASE_URL}/rest/api/3/search?jql=<JQL>&fields=key,summary,status&maxResults=50`

Authentication: Basic auth with `${JIRA_EMAIL}:${JIRA_API_TOKEN}` base64 encoded.

## Display Format

Tickets are displayed in the `gum choose` picker as:

```
ENG-123  Add rate limiting to API endpoints          [In Progress]
ENG-124  Fix login timeout on mobile                 [Todo]
ENG-125  Refactor auth middleware                     [In Review]
```

Format: `<ID>  <Title (truncated to 50 chars)>  [<Status>]`

## Action Picker

If no action is provided as argument, a second picker appears:

```
? What do you want to do with ENG-123?

> resolve  — Implement the solution and create a PR
  explore  — Read-only analysis of the ticket
  triage   — Analyze priority, complexity, and dependencies
```

## Dependencies

- **Required:** `gum` (from Charm) — `brew install gum`
- **For GitHub:** `gh` CLI (authenticated)
- **For Linear:** `LINEAR_API_KEY` environment variable
- **For Jira:** `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` environment variables

## Error Handling

- `gum` not installed → print install instructions and exit
- No tracker detected → prompt user with `gum choose`
- No tickets found → print message and exit
- API error → print error message and exit
- `claude` CLI not found → print install instructions and exit

## File

Single new file: `ticket-pilot/scripts/pick.sh`

Update: `ticket-pilot/README.md` with pick.sh documentation.
