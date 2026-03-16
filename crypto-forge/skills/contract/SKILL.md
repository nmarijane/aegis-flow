---
name: contract
description: Implement standalone smart contracts — tokens, DeFi protocols, governance, and more.
argument-hint: "<description>" [--standard erc20|erc721|erc1155|custom] [--yes]
agent: contract-builder
---

# Build Smart Contract

You are building standalone smart contracts from a user description. You will analyze requirements, present a plan, and dispatch the contract-builder agent to implement it.

## Input

Arguments: `$ARGUMENTS`

Parse the arguments:
- **Description:** everything that is not a flag (the natural language description of the contract).
- **Standard flag:** `--standard` with a value of `erc20`, `erc721`, `erc1155`, or `custom`. Optional.
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

If `projectType` is `"bot"` only, warn the user:

> Your project is currently configured as a bot-only project. Building smart contracts requires a contract framework (Hardhat or Foundry). Would you like to update the configuration to include contracts?

---

## Step 1: Analyze Description

From the description and optional `--standard` flag, identify:

- **Standard:** ERC-20, ERC-721, ERC-1155, or custom
- **DeFi mechanics:** AMM, lending pool, vault, staking, vesting
- **Modifiers:** tax, burn, mint, pause, upgradeable, governance

If the description is ambiguous, ask the user to clarify the contract type and core mechanics before proceeding. Do NOT guess — get explicit confirmation.

## Step 2: Present Plan

Unless the `--yes` flag is set, present a summary and wait for confirmation:

```
## Contract Plan

**Standard:** [ERC-20 / ERC-721 / ERC-1155 / Custom]
**Mechanics:** [AMM, lending, staking, etc.]
**Modifiers:** [pausable, upgradeable, etc.]
**OpenZeppelin bases:** [which base contracts will be used]
**Framework:** [Hardhat / Foundry from config]
**Test approach:** [unit tests for core logic, fork tests if needed]

### Files to generate:
- contracts/ — Solidity source files
- test/ — unit and integration tests
- scripts/ — deployment scripts
- .env.example — deployer private key and RPC URLs

Proceed?
```

**Wait for user confirmation before continuing.**

## Step 3: Dispatch Agent

Dispatch the `contract-builder` agent with the following context:

- Full user description
- Detected standard, mechanics, and modifiers
- Configuration from `.claude/crypto-forge.json`
- Reference file paths (map detected pattern to relevant files in `references/patterns/` and `references/apis/`)

## Step 4: Summary

After the agent completes, present:

- **Files created** — list all generated files
- **Compilation status** — whether contracts compile cleanly
- **How to run tests:** `forge test` or `npx hardhat test` depending on framework
- **How to deploy:** instructions for testnet and mainnet deployment
