<div align="center">

# crypto-forge

**Build crypto applications from your terminal**

*Trading bots, DApps, smart contracts — one command at a time.*

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/claude--code-plugin-blueviolet)](https://code.claude.com/docs/en/plugins)
[![EVM](https://img.shields.io/badge/EVM-compatible-3C3C3D)](https://ethereum.org)

</div>

---

## The Problem

You want to build a crypto trading bot. So you:

1. Open the Uniswap docs to understand pool mechanics
2. Search for Solidity patterns for flash loans
3. Write boilerplate for ethers.js or web3.py
4. Configure Hardhat or Foundry from scratch
5. Set up RPC endpoints for three different chains
6. Write deployment scripts
7. Realize you forgot to add slippage protection
8. ...

**What if you could just type one command?**

```
/crypto-forge:bot "arbitrage ETH/USDC between Uniswap v3 and SushiSwap"
```

crypto-forge reads your project config, picks the right patterns, generates the contracts and bot logic, wires up the deployment pipeline, and presents a summary. All from your terminal.

---

## Features

### `/crypto-forge:setup` — One-time project configuration

```
/crypto-forge:setup                    # interactive setup wizard
/crypto-forge:setup --type bot         # quick setup for a trading bot
/crypto-forge:setup --type dapp        # quick setup for a DApp
```

Configures your project type, target chains, stack preferences, and RPC references. Saves to `.claude/crypto-forge.json` so every command knows exactly what to generate.

### `/crypto-forge:bot` — Trading bot creation

```
/crypto-forge:bot "arbitrage ETH/USDC between Uniswap v3 and SushiSwap"
/crypto-forge:bot "market making on ETH/USDT with 0.5% spread"
/crypto-forge:bot "grid trading BTC/USDC 10 levels"
```

Generates a complete trading bot: strategy logic, exchange integration, risk controls, position management, and execution engine. Supports TypeScript (ethers.js + ccxt) and Python (web3.py + ccxt).

### `/crypto-forge:dapp` — Full-stack DApp

```
/crypto-forge:dapp "staking platform for ERC-20 tokens with time-locked rewards"
/crypto-forge:dapp "DEX with concentrated liquidity pools"
/crypto-forge:dapp "NFT marketplace with royalty enforcement"
```

Generates smart contracts, a Next.js frontend with wagmi/viem wallet connectivity, and deployment scripts. Everything wired together and ready to run.

### `/crypto-forge:contract` — Smart contracts

```
/crypto-forge:contract "ERC-20 token with vesting schedule"
/crypto-forge:contract "lending protocol with variable interest rates"
/crypto-forge:contract "ERC-4626 vault with fee-on-deposit"
```

Generates Solidity contracts with tests, using Hardhat or Foundry based on your config. Follows best practices: OpenZeppelin where applicable, reentrancy guards, proper access control.

### `/crypto-forge:audit` — Security audit

```
/crypto-forge:audit                            # audit the current project
/crypto-forge:audit contracts/Vault.sol        # audit a specific file
```

Analyzes smart contracts for vulnerabilities: reentrancy, integer overflow, access control issues, flash loan attack vectors, and more. Produces a structured report with severity ratings and recommended fixes.

### `/crypto-forge:deploy` — Deployment to testnet or mainnet

```
/crypto-forge:deploy --network sepolia         # deploy to Sepolia testnet
/crypto-forge:deploy --network ethereum        # deploy to mainnet
```

Generates deployment scripts, verifies contracts on block explorers, and outputs deployed addresses. Supports all configured chains.

---

## How It Works

```
                       You type: /crypto-forge:bot "arbitrage ETH/USDC ..."
                                          |
                                          v
                              +---------------------+
                              |    Read Config      |
                              | .claude/crypto-     |
                              | forge.json          |
                              +---------------------+
                                          |
                                    config exists?
                                    /           \
                                  yes            no
                                  /               \
                                 v                 v
                         use configured      run /setup
                           settings          wizard first
                                  \               /
                                   v             v
                              +---------------------+
                              | Analyze Description |
                              +---------------------+
                                          |
                                          v
                              +---------------------+
                              | Dispatch to Agent   |
                              |  bot-builder.md     |
                              |  dapp-builder.md    |
                              |  contract-builder.md|
                              |  auditor.md         |
                              +---------------------+
                                          |
                                          v
                              +---------------------+
                              |    Implement        |
                              | contracts, logic,   |
                              | tests, scripts      |
                              +---------------------+
                                          |
                                          v
                              +---------------------+
                              |  Present Summary    |
                              +---------------------+
```

**Zero dependencies.** The plugin is pure Markdown — no build step, no npm install, no runtime. It orchestrates tools that are already on your machine.

---

## Quick Start

### Option A: Install via skills.sh (recommended)

```bash
npx skills add nmarijane/crypto-forge
```

That's it. The skills are installed and ready to use.

### Option B: Install as Claude Code plugin

```bash
git clone https://github.com/nmarijane/crypto-forge.git
claude --plugin-dir ./crypto-forge
```

### Start using it

```
/crypto-forge:setup
```

On first use, the setup wizard asks your project type, target chains, and stack preferences. Then jump into building:

```
/crypto-forge:bot "simple arbitrage between Uniswap v3 and SushiSwap on Arbitrum"
```

---

## Configuration

crypto-forge stores its config in `.claude/crypto-forge.json`. This file is created automatically by `/crypto-forge:setup`.

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

| Field | Description | Values |
|-------|-------------|--------|
| `projectType` | Kind of project | `"bot"`, `"dapp"`, `"contract"`, `"mixed"` |
| `chains` | Target EVM chains | `"ethereum"`, `"polygon"`, `"arbitrum"`, `"base"`, `"bsc"` |
| `stack.contracts` | Smart contract framework | `"hardhat"`, `"foundry"` |
| `stack.bot` | Bot scripting language | `"typescript"`, `"python"` |
| `stack.frontend` | Frontend framework | `"nextjs"` |
| `rpcs` | Chain-to-env-var mapping | e.g. `{ "ethereum": "$ETH_RPC_URL" }` |

Commit this file to share the config with your team, or add it to `.gitignore` for personal settings.

---

## Supported Chains

| Chain | Mainnet | Testnet |
|-------|---------|---------|
| Ethereum | Mainnet | Sepolia |
| Polygon | PoS | Amoy |
| Arbitrum | One | Sepolia |
| Base | Mainnet | Sepolia |
| BSC | Mainnet | Testnet |

All chains are EVM-compatible. crypto-forge generates the correct RPC URLs, chain IDs, and block explorer links for each target.

---

## Architecture

crypto-forge is a **pure-skills plugin** — every file is Markdown.

```
crypto-forge/
  .claude-plugin/plugin.json       # Plugin manifest
  skills/
    setup/SKILL.md                 # Project configuration wizard
    bot/SKILL.md                   # Trading bot creation
    dapp/SKILL.md                  # Full-stack DApp generation
    contract/SKILL.md              # Smart contract generation
    audit/SKILL.md                 # Security audit
    deploy/SKILL.md                # Deployment to testnet/mainnet
  agents/
    bot-builder.md                 # Subagent: trading bot implementation
    dapp-builder.md                # Subagent: DApp implementation
    contract-builder.md            # Subagent: contract implementation
    auditor.md                     # Subagent: security analysis
  references/
    apis/                          # API integration guides
    patterns/                      # Trading & DeFi patterns
    security/                      # Security checklists
  extensions/
    mcp-crypto/                    # Optional MCP server (planned)
```

No TypeScript. No build step. No `node_modules`. Just Markdown files that tell Claude what to do.

**Want to add a feature?** Edit a `.md` file and submit a PR.

---

## Contributing

This is an open-source project and contributions are very welcome!

1. **Fork** the repository
2. **Create** a feature branch
3. **Edit** the relevant `SKILL.md`, agent, or reference file
4. **Test** with `claude --plugin-dir ./crypto-forge`
5. **Submit** a pull request

### Ideas for contributions

- Add support for more chains (Optimism, Avalanche, Fantom, ...)
- More bot strategies (TWAP, VWAP, sandwich detection, ...)
- More DeFi patterns (yield farming, liquidation bots, ...)
- Improve security audit heuristics
- Add Solana or non-EVM chain support

---

## License

[MIT](LICENSE) — do whatever you want with it.
