# mcp-crypto

**Optional MCP server for real-time crypto data during development.**

Check prices, fetch contract ABIs, estimate gas, and inspect balances — without leaving Claude Code.

---

## Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `get-price` | Token price from CoinGecko | `token` (string), `currency` (string, default `"usd"`) |
| `get-contract` | Verified ABI and source from Etherscan | `address` (string), `chain` (string, default `"ethereum"`) |
| `get-gas` | Current gas price | `chain` (string, default `"ethereum"`) |
| `get-balance` | Address balance (ETH + top tokens) | `address` (string), `chain` (string, default `"ethereum"`) |
| `get-pool` | DEX pool info (reserves, TVL, fees) | `pool_address` (string), `dex` (string, default `"uniswap-v3"`), `chain` (string) |

---

## Status

**Planned** — not yet implemented. The core plugin works without this extension.

---

## Future

Will be a TypeScript MCP server using CoinGecko and Etherscan APIs. Once available, you will be able to register it with:

```bash
claude mcp add mcp-crypto node ./extensions/mcp-crypto/dist/index.js
```

Skills like `/crypto-forge:bot` and `/crypto-forge:audit` will automatically use these tools when available, but they are not required.
