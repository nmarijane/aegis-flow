---
name: dapp
description: Scaffold and implement a complete DApp — smart contracts + frontend + wallet integration.
argument-hint: "<description>" [--type dex|lending|staking|nft|dao|portfolio] [--yes]
agent: dapp-builder
---

# Build DApp

You are building a complete DApp from a user description — smart contracts, frontend, and wallet integration. You will analyze requirements, assess contract complexity, present a plan, and dispatch the appropriate agents.

## Input

Arguments: `$ARGUMENTS`

Parse the arguments:
- **Description:** everything that is not a flag (the natural language description of the DApp).
- **Type flag:** `--type` with a value of `dex`, `lending`, `staking`, `nft`, `dao`, or `portfolio`. Optional.
- **Auto-confirm flag:** `--yes` to skip the confirmation prompt. Optional.

## Pre-flight: Check Configuration

**Before anything else**, check if `.claude/crypto-forge.json` exists in the project root.

If the file **does not exist**, tell the user:

> It looks like crypto-forge hasn't been configured for this project yet. Let me set it up quickly — what type of project is this?
> 1. **Bot**
> 2. **DApp**
> 3. **Smart Contract**
> 4. **Mixed**

Once the user answers, create `.claude/crypto-forge.json` with at minimum `{ "projectType": "<choice>" }`. Then continue with the command they originally ran.

If the file **exists**, read it and use its fields for all decisions below.

Ensure the configuration includes both a contract framework and a frontend stack. If either is missing, prompt the user to configure them before proceeding.

---

## Step 1: Analyze Description

From the description and optional `--type` flag, identify:

- **DApp type:** DEX, lending, staking, NFT marketplace, DAO, portfolio tracker
- **Features:** wallet connection, dashboard, transaction history, admin panel
- **Target chain(s):** from config or description

If the description is ambiguous, ask the user to clarify the DApp type and core features before proceeding. Do NOT guess — get explicit confirmation.

## Step 2: Assess Contract Complexity

Determine if the smart contracts are:

- **Simple** (basic ERC-20, simple staking): the `dapp-builder` agent handles everything in one pass.
- **Complex** (AMM with multiple contracts, lending protocol): dispatch `contract-builder` first, then `dapp-builder` for the frontend.

Criteria for **complex**:
- Multiple interacting contracts
- Custom math (AMM curves, interest rate models)
- Oracle integration (Chainlink, Pyth)
- Upgradeable proxy patterns with multiple facets

## Step 3: Present Plan

Unless the `--yes` flag is set, present a summary and wait for confirmation:

```
## DApp Plan

**Type:** [DApp type]
**Features:** [wallet connection, dashboard, etc.]
**Chain(s):** [chains]
**Contract complexity:** [Simple / Complex]

### Contracts:
- [contract name] — [purpose]

### Frontend:
- Framework: [Next.js / Vite+React from config]
- Wallet: [wagmi + viem / ethers.js]
- Styling: [Tailwind / etc. from config]

### Files to generate:
- contracts/ — Solidity source files
- frontend/ — React application with wallet integration
- test/ — contract tests
- scripts/ — deployment scripts
- .env.example — API keys, RPC URLs, contract addresses

Proceed?
```

**Wait for user confirmation before continuing.**

## Step 4: Dispatch Agents

### If complex contracts:

1. **First**, dispatch the `contract-builder` agent with the contract portion of the description. Include:
   - Contract requirements extracted from the full description
   - Configuration from `.claude/crypto-forge.json`
   - Reference file paths for relevant patterns
2. **Wait** for the contract-builder agent to complete.
3. **Then**, dispatch the `dapp-builder` agent with:
   - Full user description
   - Note that contracts already exist (point to the generated contract files)
   - Frontend requirements
   - Configuration from `.claude/crypto-forge.json`

### If simple contracts:

Dispatch the `dapp-builder` agent only. It handles simple contracts alongside the frontend in a single pass. Provide:
- Full user description
- DApp type, features, target chains
- Configuration from `.claude/crypto-forge.json`
- Reference file paths

## Step 5: Summary

After all agents complete, present:

- **Files created** — list all generated files (contracts + frontend)
- **How to run contract tests:** `forge test` or `npx hardhat test`
- **How to run frontend:** `npm run dev`
- **How to deploy contracts:** testnet and mainnet instructions
- **How to connect wallet:** which wallet providers are supported, how to switch networks
