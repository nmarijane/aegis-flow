# crypto-forge Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code plugin (pure Markdown) that serves as a specialized development assistant for crypto/trading/blockchain applications — trading bots, DApps, and smart contracts.

**Architecture:** Pure Markdown plugin with 6 skills (setup, bot, dapp, contract, audit, deploy), 4 agents (bot-builder, dapp-builder, contract-builder, auditor), and 17 reference knowledge documents. No build step, no dependencies. Follows the ticket-pilot/claude-seo plugin pattern.

**Tech Stack:** Markdown (SKILL.md with YAML frontmatter), JSON (plugin.json, config schema)

**Spec:** `docs/superpowers/specs/2026-03-16-crypto-forge-design.md`

---

## Chunk 1: Foundation

### Task 1: Create plugin manifest and directory structure

**Files:**
- Create: `crypto-forge/.claude-plugin/plugin.json`

- [ ] **Step 1: Create the directory structure**

```bash
mkdir -p crypto-forge/.claude-plugin
mkdir -p crypto-forge/skills/{setup,bot,dapp,contract,audit,deploy}
mkdir -p crypto-forge/agents
mkdir -p crypto-forge/references/{patterns,apis,security}
mkdir -p crypto-forge/extensions/mcp-crypto
```

- [ ] **Step 2: Write plugin.json**

Create `crypto-forge/.claude-plugin/plugin.json`:

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

- [ ] **Step 3: Commit**

```bash
git add crypto-forge/
git commit -m "feat: scaffold crypto-forge plugin directory structure and manifest"
```

---

### Task 2: Write setup skill

**Files:**
- Create: `crypto-forge/skills/setup/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

Create `crypto-forge/skills/setup/SKILL.md` with the following content. Key elements:
- YAML frontmatter: `name: setup`, `description`, `argument-hint: [--type bot|dapp|contract|mixed]`
- No `agent` field (runs inline)
- Pre-flight: check if `.claude/crypto-forge.json` exists
- Interactive flow: project type → chains → stack → API keys → save config
- Auto-setup behavior: if invoked without config by another skill, run inline
- Config schema with validation rules per the spec (see spec lines 132-177)
- Security: generates `.env.example`, never stores real keys, ensures `.env` in `.gitignore`

The skill should follow the same structure as ticket-pilot's `setup/SKILL.md`:
- `## Input` section parsing `$ARGUMENTS`
- Numbered steps with clear instructions
- Config file examples for each project type (bot, dapp, contract, mixed)
- Confirmation message after saving

Full content per spec section `/crypto-forge:setup` (spec lines 105-177).

- [ ] **Step 2: Commit**

```bash
git add crypto-forge/skills/setup/SKILL.md
git commit -m "feat: add setup skill for project configuration"
```

---

## Chunk 2: Reference Documents — Security

These are the knowledge base that agents consult during implementation. Security references come first because they define the safety rules all agents must follow.

**Note for implementers:** Reference documents (Tasks 3-8) are domain knowledge files. They require crypto/blockchain expertise to write well. Each document should include concrete code examples and patterns, not just abstract descriptions. When implementing, consult established resources: SWC Registry for Solidity vulnerabilities, ccxt documentation for exchange APIs, OpenZeppelin documentation for contract standards, and protocol documentation (Uniswap, Aave, Chainlink) for DeFi patterns.

### Task 3: Write solidity-checklist.md

**Files:**
- Create: `crypto-forge/references/security/solidity-checklist.md`

- [ ] **Step 1: Write solidity-checklist.md**

Comprehensive Solidity security checklist that the `auditor` agent references. Must cover all categories from the spec (lines 377-386):

Structure as a checklist document with sections:
1. **Reentrancy** — checks-effects-interactions pattern, ReentrancyGuard, read-only reentrancy in view functions, cross-contract reentrancy
2. **Access Control** — onlyOwner patterns, role-based (AccessControl), initializer guards for upgradeable contracts, two-step ownership transfer
3. **Integer Overflow/Underflow** — Solidity ≥0.8 default checks, unchecked blocks risks, SafeMath for <0.8
4. **Flash Loan Attacks** — price oracle manipulation, TWAP vs spot price, Chainlink staleness checks, multi-oracle patterns
5. **Front-running / MEV** — slippage parameters, commit-reveal schemes, deadline parameters, private mempools
6. **Gas Optimization** — unbounded loops, storage vs memory vs calldata, struct packing, short-circuiting
7. **Logic Errors** — rounding direction (favor protocol), division before multiplication, off-by-one in loops, zero-amount checks
8. **Upgradability** — storage layout collisions, initializer vs constructor, UUPS vs Transparent proxy, storage gaps
9. **External Calls** — low-level call return value checks, delegatecall risks, approval race conditions (ERC-20)
10. **Denial of Service** — push vs pull pattern, gas griefing, block gas limit

Each item should include: what to check, why it matters, and a brief code example of the correct pattern.

- [ ] **Step 2: Commit**

```bash
git add crypto-forge/references/security/solidity-checklist.md
git commit -m "feat: add Solidity security checklist reference"
```

---

### Task 4: Write bot-checklist.md

**Files:**
- Create: `crypto-forge/references/security/bot-checklist.md`

- [ ] **Step 1: Write bot-checklist.md**

Trading bot security checklist per spec (lines 390-396). Sections:

1. **Private Key Management** — never hardcode, use env vars, .env in .gitignore, hardware wallets for production, separate hot/cold wallets
2. **Slippage Protection** — configurable max slippage, never set to 100%, dynamic slippage based on liquidity, sandwich attack awareness
3. **Rate Limiting** — respect exchange API limits, exponential backoff, request queuing, WebSocket vs REST polling
4. **Error Handling** — retry logic with backoff, graceful shutdown (SIGINT/SIGTERM), nonce management, gas price spikes, network disconnection
5. **Fund Safety** — maximum position size limits, daily loss limits (kill switch), paper trading mode, emergency stop mechanism
6. **Logging & Monitoring** — structured logging, P&L tracking, alert thresholds, transaction receipts archival
7. **Configuration** — all parameters in config files (not code), environment-specific configs (dev/staging/prod), validation on startup

- [ ] **Step 2: Commit**

```bash
git add crypto-forge/references/security/bot-checklist.md
git commit -m "feat: add trading bot security checklist reference"
```

---

### Task 5: Write key-management.md

**Files:**
- Create: `crypto-forge/references/security/key-management.md`

- [ ] **Step 1: Write key-management.md**

Private key handling best practices. Sections:

1. **Environment Variables** — .env pattern, dotenv loading, never commit .env, .env.example with placeholders
2. **Hardware Wallets** — Ledger/Trezor integration with ethers.js and Foundry, when to use
3. **Key Derivation** — HD wallets (BIP-39/44), mnemonic security, derivation paths
4. **Multi-sig** — Gnosis Safe for team funds, threshold patterns
5. **Development vs Production** — test accounts with known keys for dev, separate wallets per environment, faucet usage for testnets
6. **Common Mistakes** — hardcoded keys in source, keys in git history, keys in logs, unencrypted key files

- [ ] **Step 2: Commit**

```bash
git add crypto-forge/references/security/key-management.md
git commit -m "feat: add key management best practices reference"
```

---

## Chunk 3: Reference Documents — API Guides

### Task 6: Write API reference documents

**Files:**
- Create: `crypto-forge/references/apis/binance.md`
- Create: `crypto-forge/references/apis/coinbase.md`
- Create: `crypto-forge/references/apis/uniswap.md`
- Create: `crypto-forge/references/apis/etherscan.md`
- Create: `crypto-forge/references/apis/coingecko.md`

These 5 files can be written in parallel as they are independent.

- [ ] **Step 1: Write binance.md**

Binance API integration guide. Sections:
- **REST API** — base URLs, authentication (API key + HMAC-SHA256 signature), common endpoints (account info, place order, get order book, klines/candlesticks)
- **WebSocket Streams** — connection pattern, trade streams, depth streams, user data stream, keepalive
- **Rate Limits** — request weight system, order rate limits, WebSocket connection limits
- **ccxt Integration** — initialization, common operations (fetchTicker, createOrder, fetchBalance), error handling
- **Code Examples** — TypeScript and Python snippets for common operations

- [ ] **Step 2: Write coinbase.md**

Coinbase Advanced Trade API guide. Sections:
- **Authentication** — API key + secret, JWT-based auth
- **REST Endpoints** — accounts, orders, products, market data
- **WebSocket** — market data feed, user channel
- **ccxt Integration** — setup and usage
- **Code Examples** — TypeScript and Python

- [ ] **Step 3: Write uniswap.md**

Uniswap integration guide. Sections:
- **V2 Contracts** — Router02, Factory, Pair, common functions (swapExactTokensForTokens, addLiquidity, getAmountsOut)
- **V3 Contracts** — SwapRouter, NonfungiblePositionManager, Quoter, tick math basics
- **SDK Usage** — @uniswap/v3-sdk, route computation, price impact calculation
- **Direct Contract Interaction** — ethers.js/viem examples for swap, add liquidity, remove liquidity
- **Flashloans** — Uniswap V2 flash swaps, V3 flash pattern
- **Addresses** — Deployed contract addresses per chain (Ethereum, Polygon, Arbitrum, Base)

- [ ] **Step 4: Write etherscan.md**

Etherscan API guide. Sections:
- **API Key** — registration, rate limits (5 calls/sec free tier)
- **Contract Verification** — verify source code, verify proxy, constructor arguments encoding
- **ABI Fetching** — getabi endpoint, parsing response
- **Transaction History** — txlist, tokentx, internaltx endpoints
- **Multi-chain** — Etherscan, Polygonscan, Arbiscan, BaseScan — same API, different base URLs
- **Hardhat/Foundry Integration** — hardhat-etherscan plugin, forge verify-contract

- [ ] **Step 5: Write coingecko.md**

CoinGecko API guide. Sections:
- **Endpoints** — /simple/price, /coins/{id}, /coins/{id}/market_chart, /coins/list
- **Rate Limits** — free tier (30 calls/min), pro tier
- **Token ID Mapping** — how to find CoinGecko token IDs, contract address lookup
- **Code Examples** — fetch price, historical data, market data

- [ ] **Step 6: Commit**

```bash
git add crypto-forge/references/apis/
git commit -m "feat: add API integration reference guides (Binance, Coinbase, Uniswap, Etherscan, CoinGecko)"
```

---

## Chunk 4: Reference Documents — Implementation Patterns

### Task 7: Write trading pattern references

**Files:**
- Create: `crypto-forge/references/patterns/arbitrage.md`
- Create: `crypto-forge/references/patterns/market-making.md`
- Create: `crypto-forge/references/patterns/cex-integration.md`
- Create: `crypto-forge/references/patterns/dex-integration.md`

These 4 files can be written in parallel.

- [ ] **Step 1: Write arbitrage.md**

DEX/CEX arbitrage patterns. Sections:
- **DEX-to-DEX Arbitrage** — price monitoring across pools, atomic execution, gas cost calculation, profitability threshold
- **CEX-to-DEX Arbitrage** — price delta detection, execution timing, inventory management, transfer latency
- **Flashloan Arbitrage** — Aave V3 flashloan pattern, Uniswap V2 flash swap, single-transaction profit extraction
- **Triangle Arbitrage** — multi-hop path detection, optimal routing
- **Bot Architecture** — event loop pattern, price feed aggregation, execution engine, profit tracker
- **Code Patterns** — TypeScript examples with viem for on-chain, ccxt for CEX

- [ ] **Step 2: Write market-making.md**

Market making patterns. Sections:
- **Grid Strategy** — price grid calculation, order placement, rebalancing logic
- **Spread Management** — dynamic spread based on volatility, inventory skew
- **Order Management** — order lifecycle, cancellation, partial fills
- **Inventory Risk** — delta-neutral strategies, hedging, position limits
- **CEX Market Making** — order book interaction, maker/taker fees
- **DEX Market Making** — concentrated liquidity (Uniswap V3), LP position management

- [ ] **Step 3: Write cex-integration.md**

CEX integration patterns. Sections:
- **ccxt Unified API** — initialization, exchange-specific configs, common operations
- **WebSocket Feeds** — real-time order book, trade stream, balance updates
- **Order Types** — market, limit, stop-loss, trailing stop, OCO
- **Authentication** — API key management, IP whitelisting, withdrawal permissions
- **Error Handling** — common error codes, rate limit handling, reconnection logic
- **Multi-Exchange** — abstract exchange interface pattern, exchange factory

- [ ] **Step 4: Write dex-integration.md**

DEX integration patterns. Sections:
- **Uniswap V2 Pattern** — router interaction, pair discovery, price calculation, swap execution
- **Uniswap V3 Pattern** — tick-based pricing, concentrated liquidity, quoter usage
- **SushiSwap** — fork of Uniswap V2, same interface
- **Multi-DEX Router** — aggregation pattern, split routing
- **Approval Pattern** — ERC-20 approve flow, infinite vs exact approval, permit2
- **Transaction Management** — gas estimation, nonce management, deadline setting, slippage calculation

- [ ] **Step 5: Commit**

```bash
git add crypto-forge/references/patterns/arbitrage.md crypto-forge/references/patterns/market-making.md crypto-forge/references/patterns/cex-integration.md crypto-forge/references/patterns/dex-integration.md
git commit -m "feat: add trading pattern references (arbitrage, market-making, CEX/DEX integration)"
```

---

### Task 8: Write smart contract pattern references

**Files:**
- Create: `crypto-forge/references/patterns/erc20.md`
- Create: `crypto-forge/references/patterns/erc721.md`
- Create: `crypto-forge/references/patterns/amm.md`
- Create: `crypto-forge/references/patterns/lending.md`
- Create: `crypto-forge/references/patterns/staking.md`

These 5 files can be written in parallel.

- [ ] **Step 1: Write erc20.md**

ERC-20 token patterns. Sections:
- **Basic ERC-20** — OpenZeppelin ERC20, constructor, mint/burn
- **Tax Token** — transfer override, buy/sell tax, tax collection address, exempt addresses
- **Burn Mechanism** — auto-burn on transfer, manual burn, deflationary supply
- **Mint Patterns** — capped supply, owner-only mint, scheduled mint
- **Pausable** — OpenZeppelin Pausable, emergency stop
- **Permit (ERC-2612)** — gasless approvals
- **Complete Template** — Solidity code for a full-featured ERC-20 with Hardhat and Foundry test examples

- [ ] **Step 2: Write erc721.md**

ERC-721 NFT patterns. Sections:
- **Basic NFT** — OpenZeppelin ERC721, metadata URI, tokenURI pattern
- **Minting** — public mint with price, whitelist (Merkle tree), free mint, max per wallet
- **Reveal Mechanism** — hidden metadata, reveal function, provenance hash
- **Royalties (ERC-2981)** — on-chain royalty info
- **Metadata** — on-chain vs off-chain, IPFS pinning, base URI pattern
- **Enumerable** — ERC721Enumerable for token listing
- **Complete Template** — Solidity code with tests

- [ ] **Step 3: Write amm.md**

AMM (Automated Market Maker) patterns. Sections:
- **Constant Product** — x * y = k formula, price impact calculation, slippage
- **Pool Contract** — reserves tracking, LP token minting/burning, fee collection
- **Router Contract** — multi-hop swaps, add/remove liquidity, WETH wrapping
- **Factory Contract** — pair creation, pair registry, fee configuration
- **Concentrated Liquidity** — tick-based pricing (Uniswap V3 style), range orders
- **Fee Tiers** — configurable fee percentages, protocol fees
- **Oracle** — TWAP calculation, cumulative price tracking
- **Complete Template** — Solidity code for a basic AMM with tests

- [ ] **Step 4: Write lending.md**

Lending protocol patterns. Sections:
- **Pool Architecture** — deposit/withdraw/borrow/repay, interest rate model
- **Interest Rate Model** — utilization-based rates, kink model (Compound-style)
- **Collateral** — collateral factor, health factor calculation
- **Liquidation** — liquidation threshold, liquidation bonus, partial liquidation
- **Oracle Integration** — Chainlink price feeds, staleness checks, fallback oracles
- **Flash Loans** — single-transaction borrow/repay pattern
- **Complete Template** — Solidity code for a basic lending pool with tests

- [ ] **Step 5: Write staking.md**

Staking patterns. Sections:
- **Basic Staking** — stake/unstake, reward distribution, reward rate
- **Reward Calculation** — rewards per token, accumulated rewards, Synthetix StakingRewards pattern
- **Timelock** — minimum staking period, withdrawal delay, early unstake penalty
- **Multi-Token Staking** — stake token A, earn token B
- **Compounding** — auto-compound pattern, restake function
- **Vault (ERC-4626)** — tokenized vault standard, share-based accounting, yield strategy interface
- **Complete Template** — Solidity code for a staking contract with tests

- [ ] **Step 6: Commit**

```bash
git add crypto-forge/references/patterns/erc20.md crypto-forge/references/patterns/erc721.md crypto-forge/references/patterns/amm.md crypto-forge/references/patterns/lending.md crypto-forge/references/patterns/staking.md
git commit -m "feat: add smart contract pattern references (ERC-20, ERC-721, AMM, lending, staking)"
```

---

## Chunk 5: Agents

### Task 9: Write bot-builder agent

**Files:**
- Create: `crypto-forge/agents/bot-builder.md`

- [ ] **Step 1: Write bot-builder.md**

Agent definition following the ticket-pilot resolver.md pattern. Must include:

**Frontmatter:**
```yaml
---
name: bot-builder
description: Implements complete trading bots from a description. Analyzes requirements, selects optimal stack, and generates project with strategy logic, exchange integration, tests, and monitoring.
tools: Read, Write, Edit, Bash, Grep, Glob
---
```

**Body sections:**
1. **Core Principles** — read the full description, follow crypto-forge config, consult reference documents, enforce security invariants
2. **Workflow** — understand → select stack → scaffold → implement strategy → add exchange integration → add monitoring → test → verify .env/.gitignore
3. **Stack Selection Rules** — when to use TypeScript vs Python (per spec lines 204-207)
4. **Project Structure** — TypeScript bot template (src/, config/, tests/, .env.example) and Python bot template
5. **Security Rules** — .env in .gitignore, no hardcoded keys, slippage protection, position limits
6. **Reference Lookup** — which reference files to read based on bot type (map bot type → reference file paths)
7. **Output** — after implementation, present a summary of created files and how to run the bot

- [ ] **Step 2: Commit**

```bash
git add crypto-forge/agents/bot-builder.md
git commit -m "feat: add bot-builder agent definition"
```

---

### Task 10: Write contract-builder agent

**Files:**
- Create: `crypto-forge/agents/contract-builder.md`

- [ ] **Step 1: Write contract-builder.md**

**Frontmatter:**
```yaml
---
name: contract-builder
description: Implements smart contracts with tests and deployment scripts. Supports ERC-20, ERC-721, ERC-1155, DeFi protocols (AMM, lending, staking, vaults), and governance.
tools: Read, Write, Edit, Bash, Grep, Glob
---
```

**Body sections:**
1. **Core Principles** — use OpenZeppelin when standard exists, follow Solidity best practices, compile and verify after writing, enforce gas optimization basics
2. **Workflow** — understand requirements → select pattern from references → scaffold (Hardhat or Foundry) → implement contract → write tests → compile → verify compilation
3. **Hardhat Setup** — project initialization, hardhat.config.ts template, dependencies (hardhat, @openzeppelin/contracts, @nomicfoundation/hardhat-toolbox)
4. **Foundry Setup** — forge init, foundry.toml template, remappings for OpenZeppelin
5. **Testing Patterns** — Hardhat (chai + ethers) and Foundry (forge test) patterns, what to test (deploy, core operations, access control, edge cases, events)
6. **Reference Lookup** — map contract type to reference file (ERC-20 → erc20.md, AMM → amm.md, etc.). Note: ERC-1155 and Governance patterns have no dedicated reference files — use OpenZeppelin documentation and contracts directly (OpenZeppelin ERC1155, Governor, TimelockController). Vesting patterns should use OpenZeppelin's VestingWallet as base.
7. **Security** — run through key items from solidity-checklist.md during implementation, not after
8. **Output** — present list of created files, compilation result, test results

- [ ] **Step 2: Commit**

```bash
git add crypto-forge/agents/contract-builder.md
git commit -m "feat: add contract-builder agent definition"
```

---

### Task 11: Write dapp-builder agent

**Files:**
- Create: `crypto-forge/agents/dapp-builder.md`

- [ ] **Step 1: Write dapp-builder.md**

**Frontmatter:**
```yaml
---
name: dapp-builder
description: Implements full-stack DApps with Next.js frontend, wagmi/viem blockchain integration, and wallet connection. Works with contracts generated by contract-builder.
tools: Read, Write, Edit, Bash, Grep, Glob
---
```

**Body sections:**
1. **Core Principles** — build on existing contracts (may be pre-generated by contract-builder), use wagmi + viem, follow Next.js App Router patterns
2. **Workflow** — understand DApp requirements → check if contracts exist (if not, implement them) → scaffold Next.js app → configure wagmi → implement wallet connection → build UI components → create contract hooks → add transaction handling → test
3. **Frontend Stack** — Next.js 14+ (App Router), TypeScript, wagmi v2, viem, RainbowKit (or ConnectKit), TailwindCSS
4. **Wagmi Configuration** — config file template, chain setup, transport configuration, connector setup
5. **Wallet Connection** — RainbowKit provider setup, ConnectButton, custom connect UI
6. **Contract Hooks** — pattern for useReadContract/useWriteContract, custom hooks per contract function (useStake, useSwap, etc.), transaction status handling
7. **UI Patterns** — dashboard layout, transaction form, transaction history, loading/error states, toast notifications
8. **ABI Integration** — import ABI from compiled contracts, contract address config per network
9. **Security** — no keys in frontend, input validation (amounts, addresses), readable error messages
10. **Output** — present list of created files, instructions to run (`npm run dev`)

- [ ] **Step 2: Commit**

```bash
git add crypto-forge/agents/dapp-builder.md
git commit -m "feat: add dapp-builder agent definition"
```

---

### Task 12: Write auditor agent

**Files:**
- Create: `crypto-forge/agents/auditor.md`

- [ ] **Step 1: Write auditor.md**

**Frontmatter:**
```yaml
---
name: auditor
description: Performs static security analysis of crypto code — smart contracts, trading bots, and DApp frontends. Produces structured audit reports.
tools: Read, Grep, Glob
---
```

Note: no Bash, Write, or Edit — this agent is read-only.

**Body sections:**
1. **Core Principles** — read-only analysis, no code modifications, no external tool execution, structured output
2. **Workflow** — detect code types in project → for each type, apply corresponding checklist → generate findings → write report to `.claude/crypto-forge-audit.json`
3. **Detection** — how to identify: Solidity files (*.sol), bot code (ccxt imports, exchange connections), frontend code (wagmi imports, React components)
4. **Smart Contract Audit** — reference `references/security/solidity-checklist.md`, check each category, report with file/line/severity/suggestion
5. **Bot Audit** — reference `references/security/bot-checklist.md`, check each category
6. **Frontend Audit** — check for hardcoded keys, input validation, transaction UX
7. **Severity Levels** — Critical (exploitable, fund loss), High (likely exploitable), Medium (potential issue), Low (best practice), Info (suggestion)
8. **Report Format** — JSON schema per spec (lines 409-423), save to `.claude/crypto-forge-audit.json`
9. **Output** — display human-readable summary with findings grouped by severity

**Important:** The agent is read-only — it outputs findings in a structured format in its response. The **skill** (not the agent) writes the `.claude/crypto-forge-audit.json` file based on the agent's output.

- [ ] **Step 2: Commit**

```bash
git add crypto-forge/agents/auditor.md
git commit -m "feat: add auditor agent definition"
```

---

## Chunk 6: Core Skills

### Task 13: Write bot skill

**Files:**
- Create: `crypto-forge/skills/bot/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

Follow the ticket-pilot resolve skill pattern. Key elements:

**Frontmatter:**
```yaml
---
name: bot
description: Implement a complete trading bot from a natural language description. Supports arbitrage, market making, sniping, copy trading, grid bots, and more.
argument-hint: "<description>" [--type arbitrage|market-making|sniping|grid|copy|liquidation|mev] [--yes]
agent: bot-builder
---
```

**Body sections:**
1. `## Input` — parse `$ARGUMENTS`: description, optional --type flag, --yes flag
2. `## Pre-flight: Check Configuration` — read `.claude/crypto-forge.json`, run setup inline if missing (same pattern as ticket-pilot resolve)
3. `## Step 1: Analyze Description` — identify bot type, pairs, venues, chains from the description. If ambiguous, ask the user.
4. `## Step 2: Select Stack` — recommend TypeScript or Python per the rules in the spec. Present to user.
5. `## Step 3: Present Plan` — show what will be generated (file structure, technologies, key decisions). Wait for confirmation unless `--yes` flag.
6. `## Step 4: Dispatch Agent` — dispatch `bot-builder` agent with: description, bot type, stack choice, config, and list of reference files to consult
7. `## Step 5: Summary` — present what was created, how to configure (.env), how to run

- [ ] **Step 2: Commit**

```bash
git add crypto-forge/skills/bot/SKILL.md
git commit -m "feat: add bot skill for trading bot creation"
```

---

### Task 14: Write contract skill

**Files:**
- Create: `crypto-forge/skills/contract/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

**Frontmatter:**
```yaml
---
name: contract
description: Implement standalone smart contracts — tokens, DeFi protocols, governance, and more.
argument-hint: "<description>" [--standard erc20|erc721|erc1155|custom] [--yes]
agent: contract-builder
---
```

**Note:** `--yes` is added to `argument-hint` beyond the spec's frontmatter. This is intentional to make the skip-confirmation flag discoverable. The spec's Execution Mode section (line 92) defines this behavior for all code-generating skills.

**Body sections:**
1. `## Input` — parse `$ARGUMENTS`: description, optional --standard flag, --yes flag
2. `## Pre-flight: Check Configuration` — same config check pattern
3. `## Step 1: Analyze Description` — identify standard, DeFi mechanics, modifiers
4. `## Step 2: Present Plan` — show what contract(s) will be created, which OpenZeppelin bases, test approach. Wait for confirmation unless `--yes`.
5. `## Step 3: Dispatch Agent` — dispatch `contract-builder` with description, detected pattern, config, reference files to consult
6. `## Step 4: Summary` — files created, compilation status, how to run tests, how to deploy

- [ ] **Step 2: Commit**

```bash
git add crypto-forge/skills/contract/SKILL.md
git commit -m "feat: add contract skill for smart contract creation"
```

---

### Task 15: Write dapp skill

**Files:**
- Create: `crypto-forge/skills/dapp/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

**Frontmatter:**
```yaml
---
name: dapp
description: Scaffold and implement a complete DApp — smart contracts + frontend + wallet integration.
argument-hint: "<description>" [--type dex|lending|staking|nft|dao|portfolio] [--yes]
agent: dapp-builder
---
```

**Note:** `--yes` added to make the skip-confirmation flag discoverable (same rationale as bot and contract skills).

**Body sections:**
1. `## Input` — parse `$ARGUMENTS`: description, optional --type flag, --yes flag
2. `## Pre-flight: Check Configuration` — same config check pattern
3. `## Step 1: Analyze Description` — identify DApp type, features, chains
4. `## Step 2: Assess Contract Complexity` — determine if contracts are simple (dapp-builder handles them) or complex (dispatch contract-builder first)
5. `## Step 3: Present Plan` — show full plan including contracts + frontend. Wait for confirmation unless `--yes`.
6. `## Step 4: Dispatch Agents` — if complex contracts: dispatch `contract-builder` first, wait, then dispatch `dapp-builder`. If simple: dispatch `dapp-builder` only.
7. `## Step 5: Summary` — files created, how to run contracts tests, how to run frontend, how to deploy

Key: this skill orchestrates two agents sequentially when needed (per spec lines 297-298).

- [ ] **Step 2: Commit**

```bash
git add crypto-forge/skills/dapp/SKILL.md
git commit -m "feat: add dapp skill for full-stack DApp creation"
```

---

## Chunk 7: Support Skills

### Task 16: Write audit skill

**Files:**
- Create: `crypto-forge/skills/audit/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

**Frontmatter:**
```yaml
---
name: audit
description: Analyze crypto code for vulnerabilities and bad practices. Covers smart contracts, trading bots, and DApp frontends.
argument-hint: [<file-or-directory>]
agent: auditor
---
```

**Body sections:**
1. `## Input` — parse `$ARGUMENTS`: optional file or directory path
2. `## Step 1: Detect Audit Scope` — if path provided, audit that. Otherwise, scan project for .sol files, bot code (ccxt/ethers/web3 imports), frontend code (wagmi/react)
3. `## Step 2: Dispatch Auditor` — dispatch `auditor` agent with: list of files to audit, their types, relevant security reference paths
4. `## Step 3: Write Report` — take the agent's structured findings and write `.claude/crypto-forge-audit.json` (the skill writes this, not the agent)
5. `## Step 4: Display Results` — show human-readable summary grouped by severity, with file locations and suggestions
6. `## Failure Modes` — no auditable files found → suggest correct directory

- [ ] **Step 2: Commit**

```bash
git add crypto-forge/skills/audit/SKILL.md
git commit -m "feat: add audit skill for security analysis"
```

---

### Task 17: Write deploy skill

**Files:**
- Create: `crypto-forge/skills/deploy/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

**Frontmatter:**
```yaml
---
name: deploy
description: Deploy smart contracts to testnet or mainnet with explorer verification.
argument-hint: [--network ethereum|polygon|arbitrum|base|bsc] [--testnet|--mainnet]
---
```

No `agent` field — runs inline.

**Body sections:**
1. `## Input` — parse `$ARGUMENTS`: --network, --testnet/--mainnet flags
2. `## Pre-flight: Check Configuration` — read config, verify stack.contracts is set
3. `## Step 1: Detect Contracts` — find compiled contracts (Hardhat: artifacts/, Foundry: out/)
4. `## Step 2: Check Audit Report` — if `.claude/crypto-forge-audit.json` exists and has Critical findings, warn and ask for confirmation
5. `## Step 3: Verify Prerequisites` — check .env for RPC URL, attempt compilation to verify contracts build, estimate gas cost
6. `## Step 4: Confirm with User` — for mainnet: explicit confirmation with gas estimate. For testnet: proceed directly.
7. `## Step 5: Execute Deployment` — run Hardhat or Foundry deploy command per config
8. `## Step 6: Post-Deployment` — verify on explorer, save addresses to `deployments/<network>.json`, update frontend config if exists, display summary with explorer links
9. `## Failure Modes` — partial deployment, insufficient gas, compilation errors, missing RPC URL (per spec lines 477-481)

**Note:** The `--yes` flag from the Execution Mode section does NOT apply to the deploy skill. Mainnet deployments always require explicit confirmation. Testnet deployments already proceed without confirmation. This is a deliberate safety decision.

- [ ] **Step 2: Commit**

```bash
git add crypto-forge/skills/deploy/SKILL.md
git commit -m "feat: add deploy skill for contract deployment"
```

---

## Chunk 8: Finishing Touches

### Task 18: Write MCP extension README

**Files:**
- Create: `crypto-forge/extensions/mcp-crypto/README.md`

- [ ] **Step 1: Write README.md**

Brief README describing the optional MCP server concept. Sections:
- **Purpose** — real-time crypto data during development
- **Tools** — table of 5 MCP tools (get-price, get-contract, get-gas, get-balance, get-pool) with description and parameters
- **Status** — "Planned — not yet implemented. The core plugin works without this extension."
- **Future Implementation** — note that this will be a TypeScript MCP server using CoinGecko and Etherscan APIs

- [ ] **Step 2: Commit**

```bash
git add crypto-forge/extensions/mcp-crypto/README.md
git commit -m "feat: add MCP extension README (planned)"
```

---

### Task 19: Write README.md

**Files:**
- Create: `crypto-forge/README.md`

- [ ] **Step 1: Write README.md**

Project README following ticket-pilot's README pattern. Sections:
- **Header** — name, badges (MIT, Claude Code Plugin, EVM), one-line description
- **The Problem** — context switching between docs, APIs, boilerplate when building crypto apps
- **Features** — showcase all 6 skills with usage examples
- **How It Works** — architecture diagram (ASCII art)
- **Quick Start** — installation (skills.sh + manual), first usage example
- **Configuration** — config file documentation
- **Supported Chains** — table of EVM chains
- **Architecture** — directory structure explanation
- **Contributing** — how to contribute, ideas for contributions
- **License** — MIT

- [ ] **Step 2: Commit**

```bash
git add crypto-forge/README.md
git commit -m "docs: add crypto-forge README"
```

---

### Task 20: Final verification

- [ ] **Step 1: Verify directory structure**

```bash
find crypto-forge/ -type f | sort
```

Expected: 30 files total (1 plugin.json + 6 SKILL.md + 4 agents + 17 references + 1 MCP README + 1 README)

- [ ] **Step 2: Verify all files have content**

```bash
find crypto-forge/ -type f -empty
```

Expected: no output (no empty files)

- [ ] **Step 3: Verify plugin.json references valid paths**

```bash
# Check that all agent paths in plugin.json exist
cat crypto-forge/.claude-plugin/plugin.json | grep -oP '"\.\/agents\/[^"]+' | sed 's/"//g' | while read f; do test -f "crypto-forge/$f" && echo "OK: $f" || echo "MISSING: $f"; done
```

- [ ] **Step 4: Verify all SKILL.md files have valid frontmatter**

```bash
for f in crypto-forge/skills/*/SKILL.md; do echo "--- $f ---"; head -10 "$f"; echo; done
```

Expected: each file starts with `---` frontmatter block containing `name` and `description`.

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add crypto-forge/
git commit -m "fix: address verification issues"
```

- [ ] **Step 6: Summary commit**

Only if there were no issues in verification. Otherwise fix first.
