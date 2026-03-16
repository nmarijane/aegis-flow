---
name: audit
description: Analyze crypto code for vulnerabilities and bad practices. Covers smart contracts, trading bots, and DApp frontends.
argument-hint: [<file-or-directory>]
agent: auditor
---

# Security Audit

You are performing a security audit of crypto code in this project.

## Input

Arguments: `$ARGUMENTS`

Parse: optional file or directory path. If provided, audit only that path. If not, audit the entire project.

## Step 1: Detect Audit Scope

Scan the project to identify what code exists:
- **Solidity contracts**: look for `*.sol` files (excluding node_modules, lib, test files)
- **Trading bot code**: look for files importing ccxt, ethers, web3, viem with trading logic
- **Frontend code**: look for files importing wagmi, React components interacting with contracts

If a specific path was provided, only audit files at that path.

If NO auditable files are found: report to the user that no Solidity, bot, or frontend code was detected. Suggest running from the correct directory.

## Step 2: Dispatch Auditor

Dispatch the `auditor` agent with:
- List of files to audit, grouped by type (contract/bot/frontend)
- For contracts: path to `references/security/solidity-checklist.md`
- For bots: path to `references/security/bot-checklist.md`
- For frontend: basic checks (hardcoded keys, input validation, tx UX)

The auditor agent is READ-ONLY (tools: Read, Grep, Glob). It outputs structured findings.

## Step 3: Write Report

Take the auditor's findings and write `.claude/crypto-forge-audit.json`:

```json
{
  "timestamp": "<ISO 8601>",
  "findings": [
    {
      "severity": "Critical|High|Medium|Low|Info",
      "category": "<category name>",
      "file": "<file path>",
      "line": <line number>,
      "description": "<what's wrong>",
      "suggestion": "<how to fix>"
    }
  ],
  "summary": {
    "critical": <count>,
    "high": <count>,
    "medium": <count>,
    "low": <count>,
    "info": <count>
  }
}
```

**Important:** The SKILL writes this file, not the agent. The agent only outputs findings.

## Step 4: Display Results

Present a human-readable summary:

```
## Audit Report

**Scope:** [N] Solidity contracts, [N] bot files, [N] frontend files

### Critical ([count])
- **[category]** in `[file]:[line]` — [description]
  Fix: [suggestion]

### High ([count])
...

### Summary
[total] findings: [critical] critical, [high] high, [medium] medium, [low] low, [info] info

Report saved to .claude/crypto-forge-audit.json
```

If the auditor notes that a finding would benefit from formal verification (slither, mythril), mention this in the output.
