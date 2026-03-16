# crypto-forge — Design Specification

**Date:** 2026-03-16
**Status:** Draft
**Author:** Nicolas Meridjen

---

## Overview

crypto-forge is a Claude Code plugin (pure Markdown, zero dependencies) that serves as a **specialized development assistant for crypto/trading/blockchain applications**. It implements complete features autonomously — from trading bots to full-stack DApps — following EVM-first best practices.

Modeled after the architecture of ticket-pilot and claude-seo: skills define workflows, agents execute implementation, and reference documents provide domain expertise.

## Goals

- Implement complete, functional crypto applications from a natural language description
- Cover the full development lifecycle: scaffold → implement → test → audit → deploy
- EVM-first: Ethereum, Polygon, Arbitrum, Base, BSC (Solidity, Hardhat, Foundry, ethers.js, viem)
- Recommend the optimal stack per use case rather than forcing a single tech choice
- Embed crypto-specific security knowledge without blocking the development workflow

## Non-Goals

- Non-EVM chains (Solana, Cosmos, Sui) — future extension
- Live trading execution (the plugin generates code, it doesn't trade)
- Storing or managing private keys
- Replacing a professional security audit for mainnet contracts

---

## Architecture

```
crypto-forge/
  .claude-plugin/
    plugin.json                 # Plugin manifest
  skills/
    setup/SKILL.md              # Project configuration (chains, APIs, wallets)
    bot/SKILL.md                # Trading bot creation
    dapp/SKILL.md               # Full-stack DApp implementation
    contract/SKILL.md           # Smart contract implementation
    audit/SKILL.md              # Security audit
    deploy/SKILL.md             # Deployment to testnet/mainnet
  agents/
    bot-builder.md              # Subagent: bot implementation
    dapp-builder.md             # Subagent: DApp implementation
    contract-builder.md         # Subagent: smart contract implementation
    auditor.md                  # Subagent: security audit
  references/
    patterns/                   # Domain-specific implementation patterns
      arbitrage.md
      market-making.md
      dex-integration.md
      cex-integration.md
      erc20.md
      erc721.md
      amm.md
      lending.md
      staking.md
    apis/                       # API integration guides
      binance.md
      coinbase.md
      uniswap.md
      etherscan.md
      coingecko.md
    security/                   # Security checklists
      solidity-checklist.md
      bot-checklist.md
      key-management.md
  extensions/
    mcp-crypto/                 # Optional MCP server for real-time data
      README.md
```

### Design Principles

- **Pure Markdown** — no build step, no npm install, no runtime
- **Skills = workflows** — each skill maps to a user-facing command
- **Agents = implementers** — subagents receive context and implement autonomously
- **References = knowledge** — consulted by agents during implementation, not exposed as skills
- **MCP extension = optional** — real-time data during dev, not required for core functionality

### Execution Mode

All code-generating skills (`bot`, `dapp`, `contract`) follow this pattern before dispatching agents:

1. **Analyze** the user's description and identify the type, stack, and features
2. **Present a plan** summarizing what will be generated (file structure, technologies, key decisions)
3. **Wait for user confirmation** before dispatching the agent

This gives the user a chance to adjust the plan before 20+ files are generated. The user can skip this step by adding `--yes` to any command (e.g., `/crypto-forge:bot --yes "arbitrage bot"`).

### Security Invariants

All code-generating agents enforce these rules at generation time:
- `.env` is added to `.gitignore` if not already present
- Private keys are never hardcoded — always referenced via environment variables
- Generated `.env.example` files contain placeholder values, never real credentials

---

## Skills

### `/crypto-forge:setup` — Project Configuration

**Purpose:** One-time project configuration. Saves to `.claude/crypto-forge.json`.

**SKILL.md frontmatter:**
```yaml
---
name: setup
description: Configure crypto-forge for this project. Sets chains, stack preferences, and API configuration. Saves to .claude/crypto-forge.json.
argument-hint: [--type bot|dapp|contract|mixed]
---
```

No agent — runs inline as an interactive configuration wizard.

**Flow:**
1. Detect existing config → display and offer to modify
2. Ask **project type**: bot, dapp, contract, or mixed
3. Ask **target chains**: Ethereum, Polygon, Arbitrum, Base, BSC...
4. Ask **preferred stack**:
   - Smart contracts: Hardhat or Foundry
   - Frontend (if DApp): Next.js + wagmi/viem
   - Bot: TypeScript (ethers.js/ccxt) or Python (web3.py/ccxt)
5. Ask **API keys** to configure:
   - Does NOT store keys — generates `.env.example` and instructs to fill `.env`
6. Save config

**Config schema:**

| Field | Type | Values | Required |
|-------|------|--------|----------|
| `projectType` | string | `"bot"`, `"dapp"`, `"contract"`, `"mixed"` | Yes |
| `chains` | string[] | `"ethereum"`, `"polygon"`, `"arbitrum"`, `"base"`, `"bsc"` | Yes |
| `stack.contracts` | string | `"hardhat"`, `"foundry"` | If projectType is dapp, contract, or mixed |
| `stack.bot` | string | `"typescript"`, `"python"` | If projectType is bot or mixed |
| `stack.frontend` | string | `"nextjs"` | If projectType is dapp or mixed |
| `rpcs` | object | Chain name → env var reference (e.g., `"$ETH_RPC_URL"`) | No (generated in .env.example) |

**Examples by project type:**

Bot project:
```json
{
  "projectType": "bot",
  "chains": ["ethereum", "arbitrum"],
  "stack": { "bot": "typescript" },
  "rpcs": { "ethereum": "$ETH_RPC_URL", "arbitrum": "$ARB_RPC_URL" }
}
```

DApp project:
```json
{
  "projectType": "dapp",
  "chains": ["ethereum"],
  "stack": { "contracts": "foundry", "frontend": "nextjs" },
  "rpcs": { "ethereum": "$ETH_RPC_URL" }
}
```

Mixed project:
```json
{
  "projectType": "mixed",
  "chains": ["ethereum", "arbitrum"],
  "stack": { "contracts": "hardhat", "bot": "python", "frontend": "nextjs" },
  "rpcs": { "ethereum": "$ETH_RPC_URL", "arbitrum": "$ARB_RPC_URL" }
}
```

The `rpcs` values are env var references (prefixed with `$`), not actual URLs. They map to variables in `.env`.

**Auto-setup:** If any skill is invoked without config, it detects the absence and runs setup inline before continuing.

---

### `/crypto-forge:bot` — Trading Bot Creation

**Purpose:** Implement a complete, functional trading bot from a description.

**SKILL.md frontmatter:**
```yaml
---
name: bot
description: Implement a complete trading bot from a natural language description. Supports arbitrage, market making, sniping, copy trading, grid bots, and more.
argument-hint: "<description>" [--type arbitrage|market-making|sniping|grid|copy|liquidation|mev]
agent: bot-builder
---
```

**Input:** Natural language description (e.g., `"arbitrage ETH/USDC on Uniswap v3"`)

**Flow:**
1. Read project config (or run setup inline)
2. Analyze description to identify:
   - **Type**: arbitrage, market making, sniping, copy trading, liquidation, MEV, grid bot
   - **Pairs**: which tokens/markets
   - **Venues**: DEX (Uniswap, SushiSwap...), CEX (Binance, Bybit...), or cross-venue
   - **Target chain(s)**
3. Recommend optimal stack:
   - On-chain arbitrage → TypeScript + viem (low latency)
   - Heavy backtesting → Python + pandas
   - CEX trading → TypeScript or Python + ccxt
4. Dispatch `bot-builder` subagent which implements:
   - Project structure (src/, config/, tests/)
   - Exchange/DEX connection
   - Strategy logic
   - Order management (limit, market, slippage)
   - Monitoring (logs, P&L tracking)
   - Error handling (rate limits, nonces, gas)
   - `.env.example` with all required variables
   - Unit tests for the strategy
   - Start script (`npm start` / `python main.py`)
5. Consult relevant `references/patterns/` and `references/apis/`
6. Present summary of what was created

**Recognized sub-types:**

| Type | What is generated |
|------|-------------------|
| DEX Arbitrage | Multi-pool price monitoring, atomic execution via flashloans |
| CEX/DEX Arbitrage | Price bridging, latency management, inventory management |
| Market Making | Order grid, rebalancing, spread management |
| Sniping | Mempool monitoring, gas bidding, anti-rug checks |
| Copy Trading | On-chain wallet tracking, transaction mirroring |
| Grid Bot | Parameterizable price grid, automatic DCA |
| Liquidation | Monitoring of undercollateralized positions, liquidation execution |
| MEV | Transaction ordering, sandwich detection, bundle submission (Flashbots) |

**Failure modes:**
- **Ambiguous description:** Ask the user to clarify the bot type and trading pair before proceeding.
- **Unsupported venue/exchange:** Warn and suggest the closest supported alternative.
- **Missing API docs in references:** Implement using general patterns and ccxt when possible; note in summary that no specific reference was available.

---

### `/crypto-forge:dapp` — Full-Stack DApp

**Purpose:** Scaffold and implement a complete DApp — smart contracts + frontend + wallet integration.

**SKILL.md frontmatter:**
```yaml
---
name: dapp
description: Scaffold and implement a complete DApp — smart contracts + frontend + wallet integration.
argument-hint: "<description>" [--type dex|lending|staking|nft|dao|portfolio]
agent: dapp-builder
---
```

**Input:** Natural language description (e.g., `"ETH staking platform with rewards dashboard"`)

**Flow:**
1. Read project config
2. Analyze description to identify:
   - **Type**: DEX, lending, staking, NFT marketplace, DAO, portfolio tracker
   - **Features**: wallet connection, dashboard, history, admin panel
   - **Target chain(s)**
3. Dispatch `dapp-builder` subagent which implements:

**Backend (Smart Contracts):**
- Solidity contracts (via Hardhat or Foundry per config)
- Contract tests
- Deployment scripts
- Invokes `contract-builder` subagent if on-chain logic is complex

**Frontend:**
- Next.js + TypeScript
- wagmi + viem for blockchain integration
- RainbowKit or ConnectKit for wallet connection
- UI components: dashboard, interaction forms, transaction history
- Custom hooks for contract calls (useStake, useWithdraw, etc.)
- State management: pending tx, confirmations, errors

**Integration:**
- Auto-imported ABIs from compiled contracts
- Multi-chain config (network switching)
- Complete `.env.example`

**Generated structure:**
```
contracts/          # Solidity + tests + deploy scripts
frontend/           # Next.js app
  src/
    hooks/          # useContract, useStake...
    components/     # UI components
    config/         # chains, contract addresses
    lib/            # wagmi config, providers
```

**Failure modes:**
- **Ambiguous description:** Ask the user to clarify the DApp type and core features before proceeding.
- **Compilation failure:** The agent runs `forge build` or `npx hardhat compile` after generating contracts. If compilation fails, it fixes the errors and retries (max 3 attempts).
- **Complex on-chain logic:** When contract logic is complex, the skill itself (not the dapp-builder agent) dispatches a separate `contract-builder` agent call before dispatching `dapp-builder`. The dapp-builder receives the already-generated contracts.

---

### `/crypto-forge:contract` — Smart Contracts

**Purpose:** Implement standalone smart contracts — when a full DApp is not needed.

**SKILL.md frontmatter:**
```yaml
---
name: contract
description: Implement standalone smart contracts — tokens, DeFi protocols, governance, and more.
argument-hint: "<description>" [--standard erc20|erc721|erc1155|custom]
agent: contract-builder
---
```

**Input:** Natural language description (e.g., `"ERC-20 with 2% tax on sells and auto-burn"`)

**Flow:**
1. Read project config
2. Analyze description to identify:
   - **Standard**: ERC-20, ERC-721, ERC-1155, custom
   - **DeFi mechanics**: AMM, lending pool, vault, staking, vesting
   - **Modifiers**: tax, burn, mint, pause, upgradeable, governance
3. Dispatch `contract-builder` subagent which implements:
   - Solidity contract(s)
   - Uses OpenZeppelin when a standard exists
   - Complete tests (Hardhat or Foundry per config)
   - Deployment script
   - Basic gas optimization (packing, calldata vs memory, etc.)

**Recognized patterns:**

| Pattern | What is generated |
|---------|-------------------|
| ERC-20 Token | Contract + mint/burn/tax per options |
| NFT ERC-721 | Contract + metadata, public/whitelist mint, reveal |
| Collection ERC-1155 | Multi-token, supply management |
| AMM / DEX | Pool, router, factory, LP token |
| Lending | Pool, oracle integration, liquidation |
| Staking | Stake/unstake, rewards calculation, timelock |
| Vault (ERC-4626) | Deposit/withdraw, yield strategy |
| Vesting | Linear/cliff schedule, revocable |
| Governance | Governor + timelock (OpenZeppelin) |

**Relationship with `dapp`:** This skill generates only the on-chain part. No frontend, no wagmi hooks. It is also used internally by the `dapp` skill when contract logic is complex.

**Failure modes:**
- **Compilation failure:** The agent compiles after generating. If it fails, it fixes errors and retries (max 3 attempts).
- **Ambiguous standard:** Ask the user to clarify which ERC standard or DeFi pattern before proceeding.

---

### `/crypto-forge:audit` — Security Audit

**Purpose:** Analyze crypto code (contracts, bots, DApps) for vulnerabilities and bad practices.

**SKILL.md frontmatter:**
```yaml
---
name: audit
description: Analyze crypto code for vulnerabilities and bad practices. Covers smart contracts, trading bots, and DApp frontends.
argument-hint: [<file-or-directory>]
agent: auditor
---
```

**Input:** Optional file path. Without arguments, scans the entire project.

**Flow:**
1. Auto-detect what to audit:
   - If a path is provided → targeted audit
   - Otherwise → scan project for Solidity contracts, bot code, frontend code
2. Dispatch `auditor` subagent which analyzes per code type:

**Smart Contracts** (based on `references/security/solidity-checklist.md`):

| Category | Checks |
|----------|--------|
| Reentrancy | External calls before state changes, checks-effects-interactions |
| Access control | onlyOwner, roles, initializers |
| Overflow | Solidity ≥0.8 or SafeMath |
| Flash loans | Price manipulation, oracle stale data |
| Front-running | Slippage protection, commit-reveal |
| Gas | Unbounded loops, storage vs memory |
| Logic | Rounding errors, division by zero, edge cases |
| Upgradability | Storage collisions, initializers |

**Trading Bots** (based on `references/security/bot-checklist.md`):

| Category | Checks |
|----------|--------|
| Private keys | Never hardcoded, .env in .gitignore |
| Slippage | Protection configured, no 100% slippage |
| Rate limits | API limit handling |
| Error handling | Retry logic, graceful shutdown |
| Funds | Position limits, kill switch |

**DApp Frontend:**

| Category | Checks |
|----------|--------|
| Input validation | Amounts, addresses, overflow |
| Transaction UX | Pending states, readable errors |
| Secrets | No keys in frontend code |

**Output:** Structured report saved to `.claude/crypto-forge-audit.json` and displayed to the user.

Report format:
```json
{
  "timestamp": "2026-03-16T14:30:00Z",
  "findings": [
    {
      "severity": "Critical",
      "category": "Reentrancy",
      "file": "contracts/Vault.sol",
      "line": 42,
      "description": "External call before state update",
      "suggestion": "Move state update before external call (checks-effects-interactions)"
    }
  ],
  "summary": { "critical": 1, "high": 0, "medium": 2, "low": 1, "info": 3 }
}
```

This file is read by the `deploy` skill to check for unresolved Critical findings.

**Failure modes:**
- **No auditable files found:** Report that no Solidity, TypeScript/Python bot code, or frontend code was detected. Suggest running from the correct directory.
- **Auditor limited to static analysis:** The auditor agent reads and analyzes code. It does NOT run external tools (slither, mythril). It flags when a finding would benefit from formal verification.

---

### `/crypto-forge:deploy` — Deployment

**Purpose:** Deploy smart contracts to testnet or mainnet with explorer verification.

**SKILL.md frontmatter:**
```yaml
---
name: deploy
description: Deploy smart contracts to testnet or mainnet with explorer verification.
argument-hint: [--network ethereum|polygon|arbitrum|base|bsc] [--testnet|--mainnet]
---
```

No agent — runs inline. Deployment is a sequential, user-facing process with confirmations that benefits from running in the main conversation context.

**Input:** Optional `--network <chain>` and `--testnet` (default) / `--mainnet` flags.

**Flow:**
1. Read project config (chains, stack)
2. Detect compiled contracts in the project
3. Confirm with user:
   - **Network**: testnet (default) or mainnet
   - **Chain**: per config or `--network` argument
4. Verify prerequisites:
   - RPC URL configured in `.env`
   - Wallet with sufficient gas (estimated cost displayed)
   - Contracts compiled without errors
5. Execute deployment:
   - Hardhat: `npx hardhat deploy --network <network>`
   - Foundry: `forge script script/Deploy.s.sol --broadcast --rpc-url <url>`
6. Post-deployment:
   - Verify contract on Etherscan/Arbiscan/etc. (`--verify`)
   - Save deployed addresses to `deployments/<network>.json`
   - Update frontend config if `frontend/` directory exists (contract addresses)
   - Display summary with explorer links

**Safety guards:**
- **Mainnet** → explicit confirmation required, estimated gas cost displayed via `eth_estimateGas` (through Hardhat/Foundry's built-in estimation)
- **Testnet** → deploys directly
- **Audit check:** If `.claude/crypto-forge-audit.json` exists and contains unresolved Critical findings, display a warning with the findings. Ask the user to confirm before proceeding. This is a warning, not a hard block.

**No key management:** The skill never touches private keys. It uses existing tools (Hardhat/Foundry) which read `.env` themselves.

**Failure modes:**
- **Deployment fails partway:** Save already-deployed addresses to `deployments/<network>.json`, report which contracts succeeded and which failed, and suggest how to resume.
- **Insufficient gas:** Report the estimated cost and current wallet balance. Suggest faucets for testnets.
- **Compilation errors:** Run compile first. If it fails, report errors and stop before attempting deployment.
- **Missing RPC URL:** Report which chain's RPC is missing and which env var to set.

---

## Agents

| Agent | Invoked by | Role | Tools |
|-------|-----------|------|-------|
| `bot-builder.md` | skill `bot` | Implements the complete bot, consults `references/patterns/` and `references/apis/` | Read, Write, Edit, Bash, Grep, Glob |
| `dapp-builder.md` | skill `dapp` | Implements frontend + wallet integration | Read, Write, Edit, Bash, Grep, Glob |
| `contract-builder.md` | skills `contract`, `dapp` | Implements smart contracts, tests, deploy scripts | Read, Write, Edit, Bash, Grep, Glob |
| `auditor.md` | skill `audit` | Static analysis of code against `references/security/` checklists (read-only, no Bash) | Read, Grep, Glob |

Each agent receives full context (description, config, relevant references) and works autonomously in the project directory.

**Notes:**
- `dapp-builder` does NOT invoke `contract-builder` directly. When complex contracts are needed, the `dapp` skill dispatches `contract-builder` first, then `dapp-builder` with the generated contracts.
- `auditor` performs static analysis only (reading code). It does not execute external tools. This is intentional: the audit is based on pattern matching and code review, not tool output.
- All code-generating agents (bot-builder, dapp-builder, contract-builder) MUST ensure `.env` is in `.gitignore` when generating projects that use environment variables.

---

## MCP Extension: `mcp-crypto/`

Optional MCP server for real-time data during development. Not required for core functionality.

**Tools provided:**
| Tool | Description |
|------|-------------|
| `get-price` | Token price (CoinGecko) |
| `get-contract` | Verified ABI and source code (Etherscan) |
| `get-gas` | Current gas price |
| `get-balance` | Address balance |
| `get-pool` | DEX pool info (reserves, TVL, fees) |

---

## References

Embedded knowledge documents consulted by agents during implementation. Not exposed as skills.

### `references/patterns/`
- `arbitrage.md` — DEX/CEX arbitrage patterns, flashloan integration
- `market-making.md` — Order grid strategies, spread management
- `dex-integration.md` — Uniswap v2/v3, SushiSwap, router patterns
- `cex-integration.md` — ccxt usage, WebSocket feeds, order types
- `erc20.md` — Token patterns, tax/burn/mint mechanics
- `erc721.md` — NFT patterns, metadata, reveal mechanics
- `amm.md` — AMM math, constant product, concentrated liquidity
- `lending.md` — Lending pool patterns, oracle integration, liquidation
- `staking.md` — Staking rewards math, timelock patterns

### `references/apis/`
- `binance.md` — REST + WebSocket API, authentication, rate limits
- `coinbase.md` — Advanced Trade API, authentication
- `uniswap.md` — Router, factory, quoter contracts, SDK usage
- `etherscan.md` — Contract verification, ABI fetching, tx history
- `coingecko.md` — Price feeds, market data, historical data

### `references/security/`
- `solidity-checklist.md` — Comprehensive Solidity security checklist
- `bot-checklist.md` — Trading bot security checklist
- `key-management.md` — Private key handling best practices

---

## Plugin Manifest

`.claude-plugin/plugin.json`:
```json
{
  "name": "crypto-forge",
  "version": "0.1.0",
  "description": "Crypto/trading/blockchain development assistant for Claude Code — build bots, DApps, and smart contracts from your terminal",
  "author": { "name": "Nicolas Meridjen" },
  "repository": "https://github.com/nmarijane/crypto-forge",
  "license": "MIT",
  "keywords": ["crypto", "trading", "blockchain", "defi", "ethereum", "solidity", "bot", "dapp"],
  "skills": "./skills/",
  "agents": [
    "./agents/bot-builder.md",
    "./agents/dapp-builder.md",
    "./agents/contract-builder.md",
    "./agents/auditor.md"
  ]
}
```

---

## Usage Examples

```bash
# Setup
/crypto-forge:setup

# Build a DEX arbitrage bot
/crypto-forge:bot "arbitrage ETH/USDC between Uniswap v3 and SushiSwap on Arbitrum"

# Build a staking DApp
/crypto-forge:dapp "ETH staking platform with rewards dashboard and admin panel"

# Create a custom token
/crypto-forge:contract "ERC-20 with 2% tax on sells and auto-burn"

# Audit the project
/crypto-forge:audit

# Deploy to testnet
/crypto-forge:deploy --network arbitrum --testnet
```
