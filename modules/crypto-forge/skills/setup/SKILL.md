---
name: setup
description: Configure crypto-forge for this project. Sets chains, stack preferences, and API configuration. Saves to .claude/crypto-forge.json.
argument-hint: [--type bot|dapp|contract|mixed]
---

# Setup crypto-forge

Configure crypto-forge for this project so chain targets, stack choices, and RPC references are always deterministic.

## Input

Arguments: `$ARGUMENTS`

If `--type` is provided in arguments, use that value (must be one of: `bot`, `dapp`, `contract`, `mixed`). Otherwise, ask the user in Step 1.

## Pre-flight: Detect Current Config

Check if `.claude/crypto-forge.json` already exists in the project root. If it does, read it and show the current configuration to the user:

```
## Current Configuration

- **Project type:** [projectType]
- **Chains:** [chains list, or "not set"]
- **Stack — contracts:** [stack.contracts or "n/a"]
- **Stack — bot:** [stack.bot or "n/a"]
- **Stack — frontend:** [stack.frontend or "n/a"]
- **RPCs:** [rpcs or "none configured"]

Want to update these settings?
```

If the user says no, stop here. If yes, continue to Step 1.

If no config file exists, continue to Step 1.

## Step 1: Choose Project Type

If no `--type` argument was provided, ask the user what kind of project this is:

1. **bot** — Trading bot or automated strategy (off-chain logic calling on-chain)
2. **dapp** — Decentralized application (smart contracts + frontend)
3. **contract** — Smart contracts only (libraries, protocols, no frontend)
4. **mixed** — Combination of bot + dapp (contracts, frontend, and bot logic)

Validate the choice is one of: `bot`, `dapp`, `contract`, `mixed`.

## Step 2: Choose Target Chains

Ask the user which EVM chains they want to target. They may choose one or more:

1. **Ethereum** — mainnet + Sepolia testnet
2. **Polygon** — PoS mainnet + Amoy testnet
3. **Arbitrum** — One mainnet + Sepolia testnet
4. **Base** — mainnet + Sepolia testnet
5. **BSC** — mainnet + testnet

Store selected chains as lowercase strings: `"ethereum"`, `"polygon"`, `"arbitrum"`, `"base"`, `"bsc"`.

At least one chain must be selected.

## Step 3: Choose Stack

Based on the project type chosen in Step 1, ask the relevant stack questions.

### If project type is `bot` or `mixed`

Ask which bot/scripting stack:

1. **TypeScript** — ethers.js + ccxt
2. **Python** — web3.py + ccxt

Store as `stack.bot`: `"typescript"` or `"python"`.

### If project type is `dapp`, `contract`, or `mixed`

Ask which smart contract framework:

1. **Hardhat** — JavaScript/TypeScript-based, broad plugin ecosystem
2. **Foundry** — Solidity-native, fast compilation and testing

Store as `stack.contracts`: `"hardhat"` or `"foundry"`.

### If project type is `dapp` or `mixed`

Frontend is always **Next.js + wagmi/viem** (no choice needed). Inform the user:

```
Frontend will use Next.js with wagmi + viem for wallet connectivity and contract interaction.
```

Store as `stack.frontend`: `"nextjs"`.

## Step 4: API Configuration

This step does **not** store any API keys or secrets.

### Generate `.env.example`

Create a `.env.example` file in the project root with placeholder values based on the selected chains and stack. Example content:

```env
# RPC endpoints
ETH_RPC_URL=https://mainnet.infura.io/v3/YOUR_KEY
# (include one line per selected chain)

# Add exchange API keys if building a trading bot
# EXCHANGE_API_KEY=
# EXCHANGE_API_SECRET=

# Add block explorer keys for contract verification
# ETHERSCAN_API_KEY=
```

Only include lines relevant to the chosen chains and project type:
- For each selected chain, add the corresponding RPC URL placeholder (e.g., `ETH_RPC_URL`, `POLYGON_RPC_URL`, `ARB_RPC_URL`, `BASE_RPC_URL`, `BSC_RPC_URL`).
- If project type is `bot` or `mixed`, include exchange API key placeholders.
- If project type is `dapp`, `contract`, or `mixed`, include block explorer API key placeholders.

### Ensure `.gitignore` covers `.env`

Check if `.gitignore` exists and contains `.env`. If not, append `.env` to `.gitignore` (create the file if needed). Never overwrite existing `.gitignore` content.

Build the `rpcs` config object mapping each selected chain to its env var reference:
- `"ethereum"` -> `"$ETH_RPC_URL"`
- `"polygon"` -> `"$POLYGON_RPC_URL"`
- `"arbitrum"` -> `"$ARB_RPC_URL"`
- `"base"` -> `"$BASE_RPC_URL"`
- `"bsc"` -> `"$BSC_RPC_URL"`

## Step 5: Save Config

Create the `.claude/` directory if it doesn't exist, then write `.claude/crypto-forge.json`.

### Config schema

| Field | Type | Values | Required |
|-------|------|--------|----------|
| `projectType` | string | `"bot"`, `"dapp"`, `"contract"`, `"mixed"` | Yes |
| `chains` | string[] | `"ethereum"`, `"polygon"`, `"arbitrum"`, `"base"`, `"bsc"` | Yes |
| `stack.contracts` | string | `"hardhat"`, `"foundry"` | If projectType is dapp, contract, or mixed |
| `stack.bot` | string | `"typescript"`, `"python"` | If projectType is bot or mixed |
| `stack.frontend` | string | `"nextjs"` | If projectType is dapp or mixed |
| `rpcs` | object | Chain name to env var reference (e.g., `"$ETH_RPC_URL"`) | No |

Only include fields that have values.

### Example configs

**Bot project:**

```json
{
  "projectType": "bot",
  "chains": ["ethereum", "arbitrum"],
  "stack": {
    "bot": "typescript"
  },
  "rpcs": {
    "ethereum": "$ETH_RPC_URL",
    "arbitrum": "$ARB_RPC_URL"
  }
}
```

**DApp project:**

```json
{
  "projectType": "dapp",
  "chains": ["ethereum"],
  "stack": {
    "contracts": "foundry",
    "frontend": "nextjs"
  },
  "rpcs": {
    "ethereum": "$ETH_RPC_URL"
  }
}
```

**Mixed project:**

```json
{
  "projectType": "mixed",
  "chains": ["ethereum", "arbitrum"],
  "stack": {
    "contracts": "hardhat",
    "bot": "python",
    "frontend": "nextjs"
  },
  "rpcs": {
    "ethereum": "$ETH_RPC_URL",
    "arbitrum": "$ARB_RPC_URL"
  }
}
```

### Confirmation

After saving, confirm:

```
Configuration saved to .claude/crypto-forge.json

crypto-forge is now configured for this project:
- Type: [projectType]
- Chains: [chains]
- Stack: [stack summary]

.env.example has been generated with RPC and API key placeholders.
Fill in your actual values in a .env file (already gitignored).
```

**Remind the user** to add `.claude/crypto-forge.json` to version control so the team shares the same config, or to `.gitignore` if they prefer personal settings.
