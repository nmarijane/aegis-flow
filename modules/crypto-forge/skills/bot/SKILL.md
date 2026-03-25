---
name: bot
description: Implement a complete trading bot from a natural language description. Supports arbitrage, market making, sniping, copy trading, grid bots, and more.
argument-hint: "<description>" [--type arbitrage|market-making|sniping|grid|copy|liquidation|mev] [--yes]
agent: bot-builder
---

# Build Trading Bot

You are building a complete trading bot from a user description. You will analyze requirements, present a plan, and dispatch the bot-builder agent to implement it.

## Input

Arguments: `$ARGUMENTS`

Parse the arguments:
- **Description:** everything that is not a flag (the natural language description of the bot).
- **Type flag:** `--type` with a value of `arbitrage`, `market-making`, `sniping`, `grid`, `copy`, `liquidation`, or `mev`. Optional.
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

---

## Step 1: Analyze Description

From the description and optional `--type` flag, identify:

- **Bot type:** arbitrage, market making, sniping, copy trading, liquidation, MEV, grid bot
- **Trading pairs:** which tokens or markets (e.g., ETH/USDC)
- **Venues:** DEX (Uniswap, SushiSwap), CEX (Binance, Bybit), or cross-venue
- **Target chain(s):** from config or description

If the description is ambiguous, ask the user to clarify the bot type and trading pair before proceeding. Do NOT guess — get explicit confirmation.

## Step 2: Select Stack

Based on the bot type and configuration:

- **On-chain arbitrage / MEV** → TypeScript + viem (low latency, direct RPC interaction)
- **Heavy backtesting** → Python + pandas
- **CEX trading** → TypeScript or Python + ccxt
- **Default:** use `stack.bot` from config if present, otherwise TypeScript

## Step 3: Present Plan

Unless the `--yes` flag is set, present a summary and wait for confirmation:

```
## Bot Plan

**Type:** [bot type]
**Pairs:** [pairs]
**Venues:** [venues]
**Chain(s):** [chains]
**Stack:** [TypeScript/Python]

### Files to generate:
- src/ — strategy logic, exchange connectors, monitoring
- tests/ — unit tests for strategy
- .env.example — API keys and RPC URLs
- package.json / requirements.txt

Proceed?
```

**Wait for user confirmation before continuing.**

## Step 4: Dispatch Agent

Dispatch the `bot-builder` agent with the following context:

- Full user description
- Bot type, trading pairs, venues, target chains
- Stack choice
- Configuration from `.claude/crypto-forge.json`
- Reference files to consult (map the bot type to relevant files in `references/patterns/` and `references/apis/`)

## Step 5: Summary

After the agent completes, present:

- **Files created** — list all generated files
- **How to configure:** copy `.env.example` to `.env`, fill in API keys and RPC URLs
- **How to run:** `npm start` or `python main.py` depending on stack
- **Key decisions** made by the agent (e.g., which exchange library, which strategy variant)
