# Etherscan API Guide

## API Key

### Registration

1. Create an account at https://etherscan.io/register.
2. Go to https://etherscan.io/myapikey and create a new key.
3. Store the key as `ETHERSCAN_API_KEY` in your environment.

### Rate Limits

| Tier       | Rate Limit       | Daily Limit |
| ---------- | ---------------- | ----------- |
| Free       | 5 calls / sec    | 100,000     |
| Standard   | 10 calls / sec   | Unlimited   |
| Advanced   | 20 calls / sec   | Unlimited   |

All endpoints use the same base format:

```
https://api.etherscan.io/api?module=...&action=...&apikey={ETHERSCAN_API_KEY}
```

---

## Contract Verification

### Verify Source Code

```
POST https://api.etherscan.io/api
```

Parameters:

| Param                    | Value                                    |
| ------------------------ | ---------------------------------------- |
| `module`                 | `contract`                               |
| `action`                 | `verifysourcecode`                       |
| `sourceCode`             | Flattened Solidity source or Standard JSON |
| `contractaddress`        | `0x...`                                  |
| `codeformat`             | `solidity-single-file` or `solidity-standard-json-input` |
| `contractname`           | `MyContract` (or `path/File.sol:Contract` for standard JSON) |
| `compilerversion`        | `v0.8.20+commit.a1b79de6`               |
| `optimizationUsed`       | `1` or `0`                               |
| `runs`                   | `200`                                    |
| `constructorArguements`  | ABI-encoded constructor args (hex, no 0x prefix) |
| `evmversion`             | `paris`, `shanghai`, etc.                |

Response returns a GUID. Check status with:

```
GET ?module=contract&action=checkverifystatus&guid={guid}
```

### Verify Proxy Contract

```
POST ?module=contract&action=verifyproxycontract&address={proxyAddress}
```

This links the proxy to its implementation so Etherscan shows the implementation ABI.

### Constructor Args Encoding

If your constructor takes `(address _token, uint256 _amount)`:

```typescript
import { ethers } from "ethers";

const encoded = ethers.AbiCoder.defaultAbiCoder()
  .encode(
    ["address", "uint256"],
    ["0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", ethers.parseUnits("1000", 6)]
  )
  .slice(2); // remove 0x prefix

console.log(encoded);
// Pass this as constructorArguements
```

---

## ABI Fetching

### Endpoint

```
GET ?module=contract&action=getabi&address={contractAddress}&apikey={key}
```

### Response

```json
{
  "status": "1",
  "message": "OK",
  "result": "[{\"inputs\":[],\"name\":\"totalSupply\",\"outputs\":[{\"type\":\"uint256\"}],\"stateMutability\":\"view\",\"type\":\"function\"}]"
}
```

Note: `result` is a JSON string that must be parsed separately.

### Usage in Code

```typescript
const response = await fetch(
  `https://api.etherscan.io/api?module=contract&action=getabi&address=${address}&apikey=${apiKey}`
);
const data = await response.json();

if (data.status !== "1") {
  throw new Error(`ABI fetch failed: ${data.result}`);
}

const abi = JSON.parse(data.result);
const contract = new ethers.Contract(address, abi, provider);
```

```python
import requests
import json

url = f"https://api.etherscan.io/api?module=contract&action=getabi&address={address}&apikey={api_key}"
resp = requests.get(url).json()

if resp["status"] != "1":
    raise Exception(f"ABI fetch failed: {resp['result']}")

abi = json.loads(resp["result"])
```

---

## Transaction History

### Normal Transactions

```
GET ?module=account&action=txlist&address={address}&startblock=0&endblock=99999999&page=1&offset=100&sort=desc&apikey={key}
```

Response fields per tx: `blockNumber`, `timeStamp`, `hash`, `from`, `to`, `value`, `gas`, `gasUsed`, `isError`, `input`, `methodId`, `functionName`.

### ERC-20 Token Transfers

```
GET ?module=account&action=tokentx&address={address}&startblock=0&endblock=99999999&sort=desc&apikey={key}
```

Additional fields: `tokenName`, `tokenSymbol`, `tokenDecimal`, `contractAddress`.

Filter by specific token:

```
&contractaddress={tokenAddress}
```

### Internal Transactions

```
GET ?module=account&action=txlistinternal&address={address}&startblock=0&endblock=99999999&sort=desc&apikey={key}
```

Useful for tracking ETH transfers via contracts (e.g., DEX swaps, withdrawals).

### Example Response (txlist)

```json
{
  "status": "1",
  "message": "OK",
  "result": [
    {
      "blockNumber": "19000000",
      "timeStamp": "1705000000",
      "hash": "0xabc...",
      "from": "0x1234...",
      "to": "0x5678...",
      "value": "1000000000000000000",
      "gas": "21000",
      "gasUsed": "21000",
      "gasPrice": "30000000000",
      "isError": "0",
      "functionName": "transfer(address,uint256)"
    }
  ]
}
```

---

## Multi-Chain Support

Etherscan powers block explorers for multiple chains. The API is identical; only the base URL changes.

| Chain          | Explorer           | API Base URL                         |
| -------------- | ------------------ | ------------------------------------ |
| Ethereum       | etherscan.io       | `https://api.etherscan.io/api`       |
| Goerli         | goerli.etherscan.io | `https://api-goerli.etherscan.io/api` |
| Sepolia        | sepolia.etherscan.io | `https://api-sepolia.etherscan.io/api` |
| Polygon        | polygonscan.com    | `https://api.polygonscan.com/api`    |
| Arbitrum       | arbiscan.io        | `https://api.arbiscan.io/api`        |
| Optimism       | optimistic.etherscan.io | `https://api-optimistic.etherscan.io/api` |
| Base           | basescan.org       | `https://api.basescan.org/api`       |
| BSC            | bscscan.com        | `https://api.bscscan.com/api`        |

Each chain requires its own API key registered on that explorer.

### Helper Function

```typescript
const ETHERSCAN_URLS: Record<string, string> = {
  ethereum: "https://api.etherscan.io/api",
  polygon: "https://api.polygonscan.com/api",
  arbitrum: "https://api.arbiscan.io/api",
  optimism: "https://api-optimistic.etherscan.io/api",
  base: "https://api.basescan.org/api",
  bsc: "https://api.bscscan.com/api",
};

function etherscanUrl(chain: string, params: Record<string, string>): string {
  const base = ETHERSCAN_URLS[chain];
  if (!base) throw new Error(`Unsupported chain: ${chain}`);
  const qs = new URLSearchParams({ ...params, apikey: process.env[`${chain.toUpperCase()}_ETHERSCAN_KEY`]! });
  return `${base}?${qs}`;
}
```

---

## Hardhat Integration

### Installation

```bash
npm install --save-dev @nomicfoundation/hardhat-verify
```

### Configuration

```typescript
// hardhat.config.ts
import "@nomicfoundation/hardhat-verify";

const config: HardhatUserConfig = {
  networks: {
    mainnet: {
      url: process.env.RPC_URL!,
      accounts: [process.env.PRIVATE_KEY!],
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL!,
      accounts: [process.env.PRIVATE_KEY!],
    },
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY!,
      polygon: process.env.POLYGONSCAN_API_KEY!,
      arbitrumOne: process.env.ARBISCAN_API_KEY!,
      base: process.env.BASESCAN_API_KEY!,
    },
  },
};
```

### Usage

```bash
# Verify a contract
npx hardhat verify --network mainnet 0xContractAddress "constructorArg1" "constructorArg2"

# Verify with constructor args file
npx hardhat verify --network mainnet 0xContractAddress --constructor-args arguments.js
```

`arguments.js`:

```javascript
module.exports = [
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // token address
  "1000000000",                                     // amount
];
```

---

## Foundry Integration

### Configuration

In `foundry.toml`:

```toml
[etherscan]
mainnet = { key = "${ETHERSCAN_API_KEY}" }
polygon = { key = "${POLYGONSCAN_API_KEY}", url = "https://api.polygonscan.com/api" }
arbitrum = { key = "${ARBISCAN_API_KEY}", url = "https://api.arbiscan.io/api" }
base = { key = "${BASESCAN_API_KEY}", url = "https://api.basescan.org/api" }
```

### Usage

```bash
# Verify after deployment
forge verify-contract \
  0xContractAddress \
  src/MyContract.sol:MyContract \
  --chain mainnet \
  --constructor-args $(cast abi-encode "constructor(address,uint256)" 0xTokenAddress 1000000000)

# Check verification status
forge verify-check {guid} --chain mainnet

# Verify during deployment (forge script)
forge script script/Deploy.s.sol --rpc-url mainnet --broadcast --verify
```
