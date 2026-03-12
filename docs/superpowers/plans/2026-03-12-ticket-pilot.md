# ticket-pilot Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code plugin that integrates issue trackers (Linear, GitHub, Jira) via four slash commands: `/resolve`, `/triage`, `/explore`, `/create`.

**Architecture:** Pure Markdown skills orchestrating existing MCP servers and `gh` CLI. No custom runtime, no build step, no dependencies. Skills use `context: fork` and custom subagents for heavy operations.

**Tech Stack:** Markdown (SKILL.md), YAML frontmatter, Bash (detect-tracker.sh), Claude Code plugin system.

**Spec:** `docs/superpowers/specs/2026-03-12-ticket-pilot-design.md`

---

## Chunk 1: Plugin Scaffold & Infrastructure

### Task 1: Create plugin manifest and directory structure

**Files:**
- Create: `ticket-pilot/.claude-plugin/plugin.json`
- Create: `ticket-pilot/LICENSE`

- [ ] **Step 1: Create plugin directory structure**

```bash
mkdir -p ticket-pilot/.claude-plugin ticket-pilot/skills/resolve ticket-pilot/skills/triage ticket-pilot/skills/explore ticket-pilot/skills/create ticket-pilot/agents ticket-pilot/scripts
```

- [ ] **Step 2: Write plugin.json**

Create `ticket-pilot/.claude-plugin/plugin.json`:

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

- [ ] **Step 3: Write LICENSE file**

Create `ticket-pilot/LICENSE` with MIT license text, year 2026, name "Nicolas Meridjen".

- [ ] **Step 4: Commit scaffold**

```bash
cd ticket-pilot
git init
git add .claude-plugin/plugin.json LICENSE
git commit -m "feat: initialize ticket-pilot plugin scaffold"
```

---

### Task 2: Create detect-tracker.sh with tests

**Files:**
- Create: `ticket-pilot/scripts/detect-tracker.sh`
- Create: `ticket-pilot/scripts/test-detect-tracker.sh`

- [ ] **Step 1: Write the test script**

Create `ticket-pilot/scripts/test-detect-tracker.sh`:

```bash
#!/bin/bash
# Test suite for detect-tracker.sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DETECT="$SCRIPT_DIR/detect-tracker.sh"
PASS=0
FAIL=0

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  PASS: $desc"
    ((PASS++))
  else
    echo "  FAIL: $desc (expected '$expected', got '$actual')"
    ((FAIL++))
  fi
}

assert_exit() {
  local desc="$1" expected="$2"
  shift 2
  "$DETECT" "$@" >/dev/null 2>&1
  local actual=$?
  if [[ "$actual" == "$expected" ]]; then
    echo "  PASS: $desc (exit $actual)"
    ((PASS++))
  else
    echo "  FAIL: $desc (expected exit $expected, got $actual)"
    ((FAIL++))
  fi
}

echo "=== detect-tracker.sh tests ==="

echo ""
echo "--- Output tests ---"

# GitHub patterns
assert_eq "GitHub #123" "github" "$("$DETECT" '#123')"
assert_eq "GitHub #1" "github" "$("$DETECT" '#1')"
assert_eq "GitHub owner/repo#456" "github" "$("$DETECT" 'owner/repo#456')"
assert_eq "GitHub my-org/my-repo#99" "github" "$("$DETECT" 'my-org/my-repo#99')"
assert_eq "GitHub org.name/repo-name#1" "github" "$("$DETECT" 'org.name/repo-name#1')"

# Ambiguous PREFIX-NUMBER patterns (could be Linear or Jira)
assert_eq "PREFIX-123 ambiguous" "ambiguous" "$("$DETECT" 'ENG-123')"
assert_eq "DES-42 ambiguous" "ambiguous" "$("$DETECT" 'DES-42')"
assert_eq "PROJ-1 ambiguous" "ambiguous" "$("$DETECT" 'PROJ-1')"
assert_eq "AB-999 ambiguous" "ambiguous" "$("$DETECT" 'AB-999')"
assert_eq "ABCDE-1 ambiguous (5 chars)" "ambiguous" "$("$DETECT" 'ABCDE-1')"

# Unknown patterns
assert_eq "lowercase prefix" "unknown" "$("$DETECT" 'eng-123')"
assert_eq "no number" "unknown" "$("$DETECT" 'ENG-')"
assert_eq "just text" "unknown" "$("$DETECT" 'hello')"
assert_eq "just number" "unknown" "$("$DETECT" '123')"
assert_eq "too long prefix" "unknown" "$("$DETECT" 'ABCDEF-123')"

# Empty/missing input
assert_eq "empty string" "unknown" "$("$DETECT" '')"

echo ""
echo "--- Exit code tests ---"

assert_exit "empty input exits 1" "1" ""
assert_exit "github exits 0" "0" "#123"
assert_exit "ambiguous exits 0" "0" "ENG-123"
assert_exit "unknown format exits 0" "0" "hello"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
chmod +x ticket-pilot/scripts/test-detect-tracker.sh
bash ticket-pilot/scripts/test-detect-tracker.sh
```

Expected: FAIL (detect-tracker.sh does not exist yet)

- [ ] **Step 3: Write detect-tracker.sh**

Create `ticket-pilot/scripts/detect-tracker.sh`:

```bash
#!/bin/bash
# Detect issue tracker type from ticket identifier format.
# Input: ticket identifier string (e.g., "ENG-123", "#456", "owner/repo#789")
# Output (stdout): github | ambiguous | unknown
# Exit codes: 0 = detection succeeded, 1 = error
#
# Note: "ambiguous" means the format matches both Linear and Jira (PREFIX-NUMBER).
# The calling skill should check .claude/ticket-pilot.json or ask the user to resolve.

ID="$1"

if [[ -z "$ID" ]]; then
  echo "unknown"
  exit 1
fi

# GitHub: #123 or owner/repo#123
if [[ "$ID" =~ ^#[0-9]+$ ]] || [[ "$ID" =~ ^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+#[0-9]+$ ]]; then
  echo "github"
# Linear or Jira: PREFIX-NUMBER (2-5 uppercase letters, dash, digits)
elif [[ "$ID" =~ ^[A-Z]{2,5}-[0-9]+$ ]]; then
  echo "ambiguous"
else
  echo "unknown"
fi
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
chmod +x ticket-pilot/scripts/detect-tracker.sh
bash ticket-pilot/scripts/test-detect-tracker.sh
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
cd ticket-pilot
git add scripts/detect-tracker.sh scripts/test-detect-tracker.sh
git commit -m "feat: add detect-tracker.sh with test suite"
```

---

## Chunk 2: Explore & Create Skills

### Task 3: Create the explore skill

The simplest skill — read-only, no subagent, no mode flags. Good foundation to validate the skill structure.

**Files:**
- Create: `ticket-pilot/skills/explore/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

Create `ticket-pilot/skills/explore/SKILL.md`:

````markdown
---
name: explore
description: Read an issue tracker ticket and analyze the codebase to provide a structured summary. Use when you want to understand a ticket before working on it.
argument-hint: [TICKET-ID]
---

# Explore Ticket

You are analyzing a ticket to provide a structured summary. **Do not modify any code or ticket.**

## Input

Ticket identifier: `$ARGUMENTS`

## Step 1: Detect Tracker

<!-- Note: $ARGUMENTS is safe here because explore only takes a single ticket ID with no flags -->
Tracker format hint: !`${CLAUDE_PLUGIN_ROOT}/scripts/detect-tracker.sh $ARGUMENTS`

Use this detection result to determine which tracker to query:

- **If `github`:** Use the `gh` CLI to read the issue. Run: `gh issue view <number> --json title,body,comments,labels,assignees,state,milestone`
- **If `ambiguous`:** Check if `.claude/ticket-pilot.json` exists in the project root. If it specifies a `tracker` field, use that. Otherwise, check which MCP servers are available. If only one tracker MCP is configured, use it. If still ambiguous, ask the user which tracker to use and offer to save the choice to `.claude/ticket-pilot.json`.
- **If `unknown`:** Ask the user to clarify the ticket identifier format.

### Prerequisites

Before querying, verify the tracker is accessible:
- **Linear:** Verify the Linear MCP server is available. If not, tell the user: "Add the Linear MCP server: `claude mcp add --transport http linear https://mcp.linear.app/mcp`"
- **GitHub:** Verify `gh` is installed and authenticated. Run `gh auth status`. If it fails, tell the user: "Install GitHub CLI: `brew install gh && gh auth login`"
- **Jira:** Verify the Atlassian MCP server is available. If not, tell the user: "Add the Atlassian MCP server and configure it for your instance"

## Step 2: Fetch Ticket

Read the full ticket details:

- **Linear:** Use `get_issue` with the ticket identifier. Then use `list_comments` to get comments.
- **GitHub:** Run `gh issue view <number> --json title,body,comments,labels,assignees,state,milestone`
- **Jira:** Use `getJiraIssue` with the ticket identifier.

## Step 3: Analyze Codebase

Based on the ticket content, search the codebase:
1. Identify keywords, file names, function names, or module names mentioned in the ticket
2. Use Grep and Glob to find related files
3. Read the most relevant files to understand the current state

## Step 4: Present Summary

Present a structured summary in this format:

### Ticket Summary
- **Title:** [ticket title]
- **Status:** [current status]
- **Assignee:** [if any]
- **Labels:** [if any]

### What the ticket asks for
[Clear description of the requirement or bug]

### Likely impacted files
- `path/to/file.ext` — [why this file is relevant]
- ...

### Relevant technical context
[Key information about the current implementation that relates to this ticket]

### Open questions
- [Any ambiguities or missing information in the ticket]
- [Questions that should be clarified before implementation]
````

- [ ] **Step 2: Verify plugin loads**

```bash
claude --plugin-dir ./ticket-pilot --print-skills
```

Expected: `ticket-pilot:explore` appears in the skill list.

- [ ] **Step 3: Commit**

```bash
cd ticket-pilot
git add skills/explore/SKILL.md
git commit -m "feat: add explore skill — read-only ticket analysis"
```

---

### Task 4: Create the create skill

**Files:**
- Create: `ticket-pilot/skills/create/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

Create `ticket-pilot/skills/create/SKILL.md`:

````markdown
---
name: create
description: Create a new issue tracker ticket with structured title, description, labels, and acceptance criteria. Use when you want to create a ticket from a conversation or code context.
argument-hint: [--tracker linear|github|jira] [description]
---

# Create Ticket

You are creating a well-structured ticket in an issue tracker.

## Input

Arguments: `$ARGUMENTS`

Parse the arguments:
- If `--tracker linear`, `--tracker github`, or `--tracker jira` is present, use that tracker.
- Any remaining text is the initial description of the issue.
- If no `--tracker` flag, detect the tracker:
  1. Check `.claude/ticket-pilot.json` for a `tracker` field
  2. Check which MCP servers are available
  3. If ambiguous, ask the user

## Step 1: Gather Information

If the user provided a description in the arguments, use it as a starting point. Otherwise, ask the user to describe the problem or feature they want to track.

Ask follow-up questions if needed to clarify:
- Is this a bug, feature, or task?
- What is the expected behavior vs actual behavior (for bugs)?
- What are the acceptance criteria?

## Step 2: Analyze Codebase

Search the codebase for context related to the described issue:
- Identify relevant files, modules, or components
- Find related code patterns or existing implementations
- Note any technical constraints or dependencies

## Step 3: Generate Ticket

Compose a structured ticket with:

**All trackers:**
- **Title:** concise, actionable (imperative form, e.g., "Add rate limiting to API endpoints")
- **Description:** structured with context, expected behavior, and technical notes from codebase analysis
- **Acceptance criteria:** specific, testable bullet points

**Tracker-specific fields:**

### Linear
- **Team:** use `defaultPrefix` from `.claude/ticket-pilot.json`, or ask the user. Use `list_teams` to show available teams if needed.
- **Labels:** suggest from `list_issue_labels`. Let the user confirm.
- **Priority:** suggest based on analysis (1=urgent, 2=high, 3=medium, 4=low)

### GitHub
- **Repository:** use current git repository
- **Labels:** suggest from `gh label list`. Let the user confirm.

### Jira
- **Project:** use config or ask. Use `getVisibleJiraProjects` to show options if needed.
- **Issue type:** use `getJiraIssueTypeMetaWithFields` to get available types. Default to "Task" for features, "Bug" for bugs.

## Step 4: Preview and Confirm

Present the full ticket to the user in a readable format. Ask for confirmation before creating.

If the user wants changes, adjust and preview again.

## Step 5: Create Ticket

Once confirmed:
- **Linear:** use `create_issue` with title, description, teamId, priority, labelIds
- **GitHub:** run `gh issue create --title "..." --body "..." --label "..."`
- **Jira:** use `createJiraIssue` with project, issuetype, summary, description

After creation, display the ticket URL/identifier to the user.
````

- [ ] **Step 2: Verify plugin loads**

```bash
claude --plugin-dir ./ticket-pilot --print-skills
```

Expected: `ticket-pilot:create` and `ticket-pilot:explore` both appear.

- [ ] **Step 3: Commit**

```bash
cd ticket-pilot
git add skills/create/SKILL.md
git commit -m "feat: add create skill — structured ticket creation"
```

---

## Chunk 3: Triage Skill

### Task 5: Create the triage skill

**Files:**
- Create: `ticket-pilot/skills/triage/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

Create `ticket-pilot/skills/triage/SKILL.md`:

````markdown
---
name: triage
description: Analyze issue tracker tickets and provide priority, complexity, and dependency recommendations. Use when you want to evaluate tickets before starting work.
argument-hint: [TICKET-ID] [--batch ID...] [--sprint]
---

# Triage Tickets

You are analyzing tickets to provide actionable recommendations on priority, complexity, and dependencies.

## Input

Arguments: `$ARGUMENTS`

Parse the arguments:
- **Single ticket:** just a ticket ID (e.g., `ENG-123`)
- **Batch mode:** multiple ticket IDs (e.g., `ENG-123 ENG-124 ENG-125`) or `--batch ENG-123 ENG-124`
- **Sprint mode:** `--sprint` flag — fetch all tickets in the current sprint/cycle

Determine the mode from the arguments.

## Tracker Detection

For each ticket ID, determine the tracker.
<!-- Note: $0 is used instead of $ARGUMENTS because $ARGUMENTS may contain flags like --batch or --sprint -->

Tracker format hint: !`${CLAUDE_PLUGIN_ROOT}/scripts/detect-tracker.sh $0`

Follow the same detection logic as explore:
1. Check `.claude/ticket-pilot.json`
2. Check available MCP servers
3. Use identifier format
4. Ask user if ambiguous

Verify prerequisites (same as explore skill).

## Single Ticket Mode

### Fetch
Read the ticket details (same tools as explore).

### Analyze

Evaluate the ticket across these dimensions:

**Complexity (T-shirt size):**
- **S** — isolated change, single file, clear requirements
- **M** — multiple files, some design decisions needed
- **L** — cross-cutting change, needs careful planning
- **XL** — architectural change, high risk, should be broken down

**Impacted components:**
Search the codebase to identify which modules, services, or layers are affected.

**Risks:**
- Breaking changes?
- Performance implications?
- Security considerations?
- Missing test coverage?

**Dependencies:**
- Does this block or depend on other work?
- Are there external dependencies (APIs, libraries)?

### Present Report

```
## Triage Report: [TICKET-ID]

**Title:** [title]
**Complexity:** [S/M/L/XL] — [brief justification]
**Suggested priority:** [urgent/high/medium/low] — [brief justification]

### Impacted components
- [component] — [how it's affected]

### Risks
- [risk description]

### Dependencies
- [dependency description]

### Suggested labels
- [label suggestions based on analysis]

### Questions to clarify
- [questions that should be answered before implementation]
```

### Optional: Update Ticket

Ask the user if they want to update the ticket with the triage results (add labels, set priority, add a comment with the analysis).

## Batch Mode

**Important:** For batch and sprint mode, use the Agent tool to dispatch the `triager` subagent. This provides isolation for the heavy analysis work while keeping single-ticket mode interactive in the main context.

For each ticket in the batch:
1. Fetch and analyze (same as single ticket)
2. After analyzing all tickets, produce a combined report:

```
## Batch Triage Report

### Priority Ranking
1. [TICKET-ID] — [title] — Priority: [X], Complexity: [Y]
2. ...

### Dependency Graph
- [TICKET-A] blocks [TICKET-B] (reason)
- ...

### Recommended Order
1. [TICKET-ID] — [reason to do first]
2. ...
```

## Sprint Mode

Fetch all tickets in the current sprint:
- **Linear:** use `list_issues` and filter by the active cycle. Use `list_teams` to identify the team if needed.
- **GitHub:** run `gh issue list --milestone <current-milestone> --state open --json number,title,labels,assignees`
- **Jira:** use `searchJiraIssuesUsingJql` with the JQL query `sprint in openSprints() AND status != Done`

Then process all fetched tickets using the Batch Mode flow above.
````

- [ ] **Step 2: Verify plugin loads**

```bash
claude --plugin-dir ./ticket-pilot --print-skills
```

Expected: `ticket-pilot:triage` appears alongside explore and create.

- [ ] **Step 3: Commit**

```bash
cd ticket-pilot
git add skills/triage/SKILL.md
git commit -m "feat: add triage skill — single, batch, and sprint analysis"
```

---

## Chunk 4: Agents & Resolve Skill

### Task 6: Create the resolver agent

**Files:**
- Create: `ticket-pilot/agents/resolver.md`

- [ ] **Step 1: Write resolver.md**

Create `ticket-pilot/agents/resolver.md`:

````markdown
---
name: resolver
description: Implements code changes to resolve an issue tracker ticket. Analyzes requirements, plans modifications, implements, tests, commits, and creates PRs.
tools: Read, Edit, Write, Bash, Grep, Glob, Agent
---

# Resolver Agent

You are a specialized implementation agent. Your job is to resolve an issue tracker ticket by writing code, tests, and creating a PR.

## Core Principles

- Read and understand the full ticket before writing any code
- Follow existing code patterns and conventions in the project
- Write tests for your changes
- Make focused, atomic commits
- Reference the ticket ID in commits and PR description

## Workflow

1. **Understand** — Read the ticket details provided to you. Identify the requirements, acceptance criteria, and any constraints.
2. **Explore** — Search the codebase to understand the current implementation. Identify the files you need to modify.
3. **Plan** — Before coding, outline what you will change and why.
4. **Implement** — Make the changes. Follow existing patterns.
5. **Test** — Run the project's test suite. If tests fail, fix your implementation.
6. **Commit** — Create a commit with a message referencing the ticket (e.g., `feat(ENG-123): add rate limiting`).
7. **PR** — If asked, create a pull request with a clear description.

## Branch Naming

- Detect the default branch: `git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||'` (fallback: `main`)
- Branch name: `feat/<TICKET-ID>-<title-slug>`
  - `title-slug`: ticket title lowercased, non-alphanumeric replaced with `-`, truncated to 50 chars
- If a branch matching `feat/<TICKET-ID>-*` already exists, check it out and continue
- If the working tree has uncommitted changes, warn the user and ask: stash, commit, or abort

## Commit Messages

Use conventional commits: `<type>(<TICKET-ID>): <description>`

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
````

- [ ] **Step 2: Commit**

```bash
cd ticket-pilot
git add agents/resolver.md
git commit -m "feat: add resolver agent for implementation work"
```

---

### Task 7: Create the triager agent

**Files:**
- Create: `ticket-pilot/agents/triager.md`

- [ ] **Step 1: Write triager.md**

Create `ticket-pilot/agents/triager.md`:

````markdown
---
name: triager
description: Analyzes issue tracker tickets for complexity, priority, and dependencies. Used for batch and sprint triage operations.
tools: Read, Grep, Glob, Bash(gh *)
---

# Triager Agent

You are a specialized analysis agent. Your job is to evaluate issue tracker tickets and produce structured triage reports.

## Core Principles

- Be objective and data-driven in your assessments
- Base complexity estimates on actual codebase analysis, not guesses
- Identify real dependencies, not hypothetical ones
- Flag missing information or ambiguities

## Complexity Assessment

Evaluate complexity by searching the codebase:

| Size | Criteria |
|------|----------|
| **S** | 1-2 files, isolated change, clear requirements, <50 lines |
| **M** | 3-5 files, some design decisions, moderate risk, 50-200 lines |
| **L** | 5-10 files, cross-cutting, needs planning, 200-500 lines |
| **XL** | 10+ files, architectural impact, high risk, should be decomposed |

## Priority Assessment

| Priority | Criteria |
|----------|----------|
| **Urgent** | Production broken, security vulnerability, data loss risk |
| **High** | Blocks other work, significant user impact, deadline-driven |
| **Medium** | Important improvement, moderate user impact |
| **Low** | Nice to have, minor improvement, tech debt |

## Output Format

Always produce structured reports as specified in the triage skill instructions.
````

- [ ] **Step 2: Commit**

```bash
cd ticket-pilot
git add agents/triager.md
git commit -m "feat: add triager agent for batch ticket analysis"
```

---

### Task 8: Create the resolve skill

The most complex skill — uses `context: fork`, delegates to resolver agent, supports `--auto` and `--guided` modes.

**Files:**
- Create: `ticket-pilot/skills/resolve/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

Create `ticket-pilot/skills/resolve/SKILL.md`:

````markdown
---
name: resolve
description: Resolve an issue tracker ticket by reading it, implementing the solution, and creating a PR. Use when you want to go from ticket to working code.
argument-hint: [TICKET-ID] [--auto|--guided]
context: fork
agent: resolver
---

# Resolve Ticket

You are resolving an issue tracker ticket end-to-end: reading it, implementing the solution, testing, committing, and optionally creating a PR.

## Input

Arguments: `$ARGUMENTS`

Parse the arguments:
- **Ticket ID:** the first argument that is not a flag (e.g., `ENG-123`, `#456`)
- **Mode flag:** `--auto` for fully autonomous, `--guided` for step-by-step with user approval.
- **Default mode:** If no flag is provided, check `.claude/ticket-pilot.json` for a `defaultMode` field (`"auto"` or `"guided"`). If not configured, default to `guided`.

<!-- Note: $0 is used instead of $ARGUMENTS because $ARGUMENTS may contain flags like --auto or --guided -->

## Step 1: Detect Tracker and Fetch Ticket

Tracker format hint: !`${CLAUDE_PLUGIN_ROOT}/scripts/detect-tracker.sh $0`

Follow the same detection logic as other skills:
1. Check `.claude/ticket-pilot.json`
2. Check available MCP servers
3. Use identifier format
4. Ask user if ambiguous

Verify prerequisites:
- **Linear:** Verify Linear MCP server is available. If not: "Add the Linear MCP server: `claude mcp add --transport http linear https://mcp.linear.app/mcp`"
- **GitHub:** Run `gh auth status`. If it fails: "Install GitHub CLI: `brew install gh && gh auth login`"
- **Jira:** Verify Atlassian MCP server is available. If not: "Add the Atlassian MCP server and configure it for your instance"

Fetch the full ticket:
- **Linear:** use `get_issue` with the identifier, then `list_comments` for comments
- **GitHub:** run `gh issue view <number> --json title,body,comments,labels,assignees,state,milestone`
- **Jira:** use `getJiraIssue` with the identifier

## Step 2: Present Summary

Present a structured summary of the ticket:

```
## Ticket: [TICKET-ID] — [Title]

**Status:** [status]
**Assignee:** [assignee or "unassigned"]
**Labels:** [labels]

### Description
[ticket description]

### Comments
[relevant comments, summarized if lengthy]

### Acceptance Criteria
[extracted from description, or "none specified"]
```

**If guided mode:** Ask the user to confirm they want to proceed before continuing.

## Step 3: Analyze Codebase and Plan

1. Search the codebase for files related to the ticket
2. Read relevant files to understand the current implementation
3. Propose an action plan:

```
## Action Plan

### Changes needed:
1. [file path] — [what to change and why]
2. ...

### Tests to add/modify:
1. [test file path] — [what to test]

### Estimated complexity: [S/M/L/XL]
```

**If guided mode:** Ask the user to approve the plan before continuing. If they suggest changes, adjust the plan.

## Step 4: Create Branch

Follow the branch naming rules from your agent instructions:
- Detect default branch
- Create `feat/<TICKET-ID>-<title-slug>`
- Handle existing branches and dirty working trees

## Step 5: Implement

Make the changes according to the plan:
- Follow existing code patterns and conventions
- Write clean, focused code
- Add or update tests

## Step 6: Run Tests

Run the project's test suite:
- Detect the test runner (look for `package.json` scripts, `pytest.ini`, `Makefile`, etc.)
- Run tests
- **GATE: Tests MUST pass.** If tests fail:
  - In **guided mode:** report failures, ask user for guidance
  - In **auto mode:** attempt to fix. If still failing after one retry, stop and report failures. Do NOT commit or create a PR with failing tests.

## Step 7: Commit

Create a commit with a conventional commit message referencing the ticket:
```
<type>(<TICKET-ID>): <concise description>

<optional body with more details>
```

## Step 8: Offer PR and Status Update

**If guided mode:** Ask the user if they want to:
1. Create a pull request
2. Update the ticket status (e.g., move to "In Review")
3. Both
4. Neither (just keep the local commit)

**If auto mode:** Create the PR and update the ticket status automatically.

### Creating a PR

```bash
gh pr create --title "<type>(<TICKET-ID>): <title>" --body "## Summary\n\nResolves <TICKET-ID>: <title>\n\n## Changes\n\n<list of changes>\n\n## Test plan\n\n<how this was tested>"
```

### Updating Ticket Status

- **Linear:** use `update_issue` to change the state. Use `list_issue_statuses` to find the "In Review" or equivalent state ID.
- **GitHub:** handled by PR (linked via "Resolves #N" in PR body)
- **Jira:** use `transitionJiraIssue`. Use `getTransitionsForJiraIssue` to find the appropriate transition.

Optionally add a comment to the ticket linking to the PR:
- **Linear:** use `create_comment`
- **Jira:** use `addCommentToJiraIssue`
````

- [ ] **Step 2: Verify all skills load**

```bash
claude --plugin-dir ./ticket-pilot --print-skills
```

Expected: all four skills appear: `ticket-pilot:resolve`, `ticket-pilot:triage`, `ticket-pilot:explore`, `ticket-pilot:create`.

- [ ] **Step 3: Commit**

```bash
cd ticket-pilot
git add skills/resolve/SKILL.md
git commit -m "feat: add resolve skill — full ticket-to-PR workflow"
```

---

## Chunk 5: README & Final Packaging

### Task 9: Write README.md

**Files:**
- Create: `ticket-pilot/README.md`

- [ ] **Step 1: Write README**

Create `ticket-pilot/README.md`:

````markdown
# ticket-pilot

Issue tracker integration for Claude Code — resolve, triage, explore, and create tickets from your terminal.

## Features

| Command | Description |
|---------|-------------|
| `/ticket-pilot:resolve` | Read a ticket, implement the solution, and create a PR |
| `/ticket-pilot:triage` | Analyze tickets for priority, complexity, and dependencies |
| `/ticket-pilot:explore` | Read-only summary of a ticket with codebase context |
| `/ticket-pilot:create` | Create a well-structured ticket from a conversation |

Supports **Linear**, **GitHub Issues**, and **Jira** through existing MCP servers and the `gh` CLI.

## Installation

**Manual (development):**

```bash
git clone https://github.com/<username>/ticket-pilot.git
claude --plugin-dir ./ticket-pilot
```

## Prerequisites

Set up at least one tracker before using the plugin:

| Tracker | Setup |
|---------|-------|
| **Linear** | `claude mcp add --transport http linear https://mcp.linear.app/mcp` |
| **GitHub** | `brew install gh && gh auth login` |
| **Jira** | Configure the Atlassian MCP server for your instance |

## Usage

### Explore a ticket

```
/ticket-pilot:explore ENG-123
/ticket-pilot:explore #42
```

### Resolve a ticket

```
/ticket-pilot:resolve ENG-123              # guided mode (default)
/ticket-pilot:resolve ENG-123 --auto       # fully autonomous
```

### Triage tickets

```
/ticket-pilot:triage ENG-123                          # single ticket
/ticket-pilot:triage ENG-123 ENG-124 ENG-125          # batch
/ticket-pilot:triage --sprint                          # current sprint
```

### Create a ticket

```
/ticket-pilot:create --tracker linear
/ticket-pilot:create --tracker github Fix the login timeout bug
```

## Configuration

Create `.claude/ticket-pilot.json` in your project root (optional):

```json
{
  "tracker": "linear",
  "teamPrefixes": ["ENG", "DES"],
  "defaultPrefix": "ENG",
  "defaultMode": "guided"
}
```

| Field | Description |
|-------|-------------|
| `tracker` | Default tracker: `linear`, `github`, or `jira` |
| `teamPrefixes` | Team prefixes used in this project (for Linear/Jira) |
| `defaultPrefix` | Default team prefix when creating tickets |
| `defaultMode` | Default mode for `/resolve`: `guided` or `auto` |

All fields are optional.

## Supported Trackers

| Feature | Linear | GitHub | Jira |
|---------|--------|--------|------|
| Read tickets | Yes | Yes | Yes |
| Create tickets | Yes | Yes | Yes |
| Update status | Yes | Via PR | Yes |
| Add comments | Yes | Yes | Yes |
| Sprint/cycle view | Yes | Milestones | Yes |

## Contributing

Contributions are welcome! This is a pure Markdown plugin — no build step required.

1. Fork the repository
2. Create a feature branch
3. Edit the relevant `SKILL.md` or agent file
4. Test with `claude --plugin-dir ./ticket-pilot`
5. Submit a pull request

## License

MIT
````

- [ ] **Step 2: Commit**

```bash
cd ticket-pilot
git add README.md
git commit -m "docs: add README with usage examples and setup guide"
```

---

### Task 10: Final verification and packaging

- [ ] **Step 1: Verify complete file structure**

```bash
find ticket-pilot -type f | sort
```

Expected output:
```
ticket-pilot/.claude-plugin/plugin.json
ticket-pilot/LICENSE
ticket-pilot/README.md
ticket-pilot/agents/resolver.md
ticket-pilot/agents/triager.md
ticket-pilot/scripts/detect-tracker.sh
ticket-pilot/scripts/test-detect-tracker.sh
ticket-pilot/skills/create/SKILL.md
ticket-pilot/skills/explore/SKILL.md
ticket-pilot/skills/resolve/SKILL.md
ticket-pilot/skills/triage/SKILL.md
```

- [ ] **Step 2: Run detect-tracker tests**

```bash
bash ticket-pilot/scripts/test-detect-tracker.sh
```

Expected: all tests pass.

- [ ] **Step 3: Verify plugin loads with all skills**

```bash
claude --plugin-dir ./ticket-pilot --print-skills
```

Expected: all 4 skills listed.

- [ ] **Step 4: Test explore skill manually**

With a GitHub repo that has issues:
```
claude --plugin-dir ./ticket-pilot
> /ticket-pilot:explore #1
```

Verify: skill detects GitHub, fetches the issue, presents structured summary.

- [ ] **Step 5: Final commit**

```bash
cd ticket-pilot
git add -A
git status  # verify nothing unexpected
git commit -m "chore: finalize ticket-pilot v0.1.0"
git tag v0.1.0
```
