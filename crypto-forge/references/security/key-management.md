# Private Key Management Best Practices

Comprehensive guide to handling private keys, mnemonics, and API secrets in crypto applications. Referenced by all code-generating agents (`bot-builder`, `contract-builder`, `dapp-builder`) and the `auditor` agent.

---

## 1. Environment Variables

### What to know

Private keys and API secrets must be stored in environment variables, loaded at runtime via `.env` files. The `.env` file is never committed to version control. A `.env.example` file with placeholder values is committed to document required variables.

### .env pattern (TypeScript — ethers.js)

```typescript
import dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config();

// Validate required variables
const requiredVars = ["PRIVATE_KEY", "ETH_RPC_URL"] as const;
for (const varName of requiredVars) {
  if (!process.env[varName]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
}

const provider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

console.log(`Wallet address: ${wallet.address}`);
// NEVER log the private key itself
```

### .env pattern (TypeScript — viem)

```typescript
import dotenv from "dotenv";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";

dotenv.config();

if (!process.env.PRIVATE_KEY) {
  throw new Error("PRIVATE_KEY environment variable is required");
}

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const client = createWalletClient({
  account,
  chain: mainnet,
  transport: http(process.env.ETH_RPC_URL),
});
```

### .env pattern (Python — web3.py)

```python
import os
from dotenv import load_dotenv
from web3 import Web3

load_dotenv()

PRIVATE_KEY = os.environ.get("PRIVATE_KEY")
RPC_URL = os.environ.get("ETH_RPC_URL")

if not PRIVATE_KEY or not RPC_URL:
    raise ValueError("PRIVATE_KEY and ETH_RPC_URL environment variables are required")

w3 = Web3(Web3.HTTPProvider(RPC_URL))
account = w3.eth.account.from_key(PRIVATE_KEY)

print(f"Wallet address: {account.address}")
# NEVER print the private key
```

### .env.example template

```env
# Blockchain RPC endpoints
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
ARB_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_API_KEY
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# Wallet (use a dedicated wallet — never your main wallet)
PRIVATE_KEY=0x_your_private_key_here

# Exchange API (restrict permissions: read + trade only, no withdraw)
EXCHANGE_API_KEY=your_api_key_here
EXCHANGE_API_SECRET=your_api_secret_here

# Block explorer (for contract verification)
ETHERSCAN_API_KEY=your_etherscan_key_here
```

### .gitignore entries

```gitignore
# Environment files with secrets
.env
.env.local
.env.*.local
.env.production
.env.staging

# Key files
*.pem
*.key
*.keystore

# Foundry broadcast files (contain deployer addresses and tx data)
broadcast/

# Hardhat artifacts that may contain deployment info
deployments/**/solcInputs/
```

---

## 2. Hardware Wallets

### When to use

- **Production deployments** — deploying contracts to mainnet.
- **Multisig signers** — signing Safe transactions.
- **High-value operations** — any transaction involving > $1,000 equivalent.
- **Admin operations** — contract upgrades, ownership transfers, parameter changes.

### Ledger with ethers.js

```typescript
import { ethers } from "ethers";
import { LedgerSigner } from "@ethersproject/hardware-wallets";

const provider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL);

// Connects to Ledger via USB
// Derivation path: m/44'/60'/0'/0/0 (first Ethereum account)
const signer = new LedgerSigner(provider, "hid", "m/44'/60'/0'/0/0");

const address = await signer.getAddress();
console.log(`Ledger address: ${address}`);

// Transactions require physical confirmation on the device
const tx = await signer.sendTransaction({
  to: "0x...",
  value: ethers.parseEther("1.0"),
});
console.log(`Transaction sent: ${tx.hash}`);
```

### Ledger with Foundry

```bash
# Deploy with Ledger hardware wallet
# Foundry connects to Ledger via USB and requests confirmation on device
forge script script/Deploy.s.sol \
  --rpc-url $ETH_RPC_URL \
  --ledger \
  --sender 0xYourLedgerAddress \
  --broadcast \
  --verify

# Use a specific derivation path
forge script script/Deploy.s.sol \
  --rpc-url $ETH_RPC_URL \
  --ledger \
  --mnemonic-derivation-path "m/44'/60'/0'/0/0" \
  --broadcast
```

### Trezor with ethers.js

```typescript
import TrezorConnect from "@trezor/connect";

// Initialize Trezor connection
TrezorConnect.init({
  manifest: {
    email: "developer@example.com",
    appUrl: "https://your-dapp.com",
  },
});

// Get address
const result = await TrezorConnect.ethereumGetAddress({
  path: "m/44'/60'/0'/0/0",
  showOnTrezor: true,
});

if (result.success) {
  console.log(`Trezor address: ${result.payload.address}`);
}

// Sign transaction (requires physical confirmation)
const signedTx = await TrezorConnect.ethereumSignTransaction({
  path: "m/44'/60'/0'/0/0",
  transaction: {
    to: "0x...",
    value: "0xDE0B6B3A7640000", // 1 ETH in hex
    chainId: 1,
    nonce: "0x0",
    gasLimit: "0x5208",
    maxFeePerGas: "0x2540BE400",
    maxPriorityFeePerGas: "0x3B9ACA00",
  },
});
```

---

## 3. Key Derivation

### What to know

HD (Hierarchical Deterministic) wallets generate multiple keys from a single mnemonic phrase (BIP-39). Derivation paths (BIP-44) specify which key to use. This allows managing many addresses from one backup.

### BIP-39 mnemonic generation (TypeScript)

```typescript
import { ethers } from "ethers";

// Generate a new random mnemonic (12 or 24 words)
const mnemonic = ethers.Mnemonic.entropyToPhrase(ethers.randomBytes(16)); // 12 words
console.log("Mnemonic (STORE SECURELY, NEVER LOG IN PRODUCTION):", mnemonic);

// Derive wallet from mnemonic
const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic);
console.log(`Address: ${wallet.address}`);
```

### BIP-44 derivation paths

```
m / purpose' / coin_type' / account' / change / address_index

Standard Ethereum path: m/44'/60'/0'/0/0
                        │    │     │    │   │
                        │    │     │    │   └── Address index (0, 1, 2...)
                        │    │     │    └────── 0 = external, 1 = internal (change)
                        │    │     └─────────── Account index (0, 1, 2...)
                        │    └──────────────── 60 = Ethereum (coin type)
                        └───────────────────── 44 = BIP-44 purpose
```

### Deriving multiple accounts (TypeScript)

```typescript
import { ethers } from "ethers";

const mnemonic = process.env.MNEMONIC;
if (!mnemonic) throw new Error("MNEMONIC required");

// Derive multiple accounts from one mnemonic
const basePath = "m/44'/60'/0'/0";
const accounts: ethers.HDNodeWallet[] = [];

for (let i = 0; i < 5; i++) {
  const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, `${basePath}/${i}`);
  accounts.push(wallet);
  console.log(`Account ${i}: ${wallet.address}`);
}

// Use different accounts for different purposes:
// accounts[0] — deployer
// accounts[1] — bot operator
// accounts[2] — fee collector
```

### Mnemonic security rules

- **Never** store mnemonics in digital plain text (no .txt files, no notes apps).
- **Never** transmit mnemonics over the internet (no email, no chat, no cloud storage).
- Store physical copies in separate secure locations.
- Use passphrases (BIP-39 optional passphrase) for additional security.
- For programmatic use, derive private keys and use those — do not embed the full mnemonic in bot configs.

### Key derivation (Python)

```python
from eth_account import Account
from mnemonic import Mnemonic

# Generate mnemonic
m = Mnemonic("english")
words = m.generate(strength=128)  # 12 words
print(f"Mnemonic: {words}")  # STORE SECURELY

# Derive account
Account.enable_unaudited_hdwallet_features()
account = Account.from_mnemonic(words, account_path="m/44'/60'/0'/0/0")
print(f"Address: {account.address}")

# Derive multiple accounts
for i in range(5):
    acct = Account.from_mnemonic(words, account_path=f"m/44'/60'/0'/0/{i}")
    print(f"Account {i}: {acct.address}")
```

---

## 4. Multi-sig

### What to know

Multi-signature wallets (e.g., Gnosis Safe) require M-of-N approvals to execute transactions. Use multi-sig for treasury management, contract admin operations, and any high-value transactions involving team funds.

### When to use multi-sig

| Scenario | Recommended threshold |
|----------|----------------------|
| Team treasury | 2-of-3 or 3-of-5 |
| Contract admin (upgrades, pause) | 2-of-3 minimum |
| Protocol fee collection | 2-of-3 |
| Development fund | 1-of-2 (convenience) or 2-of-3 |
| Emergency operations | Lower threshold (1-of-3) with timelock |

### Gnosis Safe interaction (TypeScript)

```typescript
import Safe from "@safe-global/protocol-kit";
import { SafeTransactionDataPartial } from "@safe-global/safe-core-sdk-types";

// Connect to existing Safe
const safe = await Safe.create({
  ethAdapter,
  safeAddress: "0xYourSafeAddress",
});

// Create a transaction
const txData: SafeTransactionDataPartial = {
  to: "0xRecipientAddress",
  value: ethers.parseEther("1.0").toString(),
  data: "0x",
};

const safeTx = await safe.createTransaction({ transactions: [txData] });

// Sign (each signer does this independently)
const signedTx = await safe.signTransaction(safeTx);

// Execute when enough signatures are collected
const executeTxResponse = await safe.executeTransaction(signedTx);
await executeTxResponse.transactionResponse?.wait();

console.log("Safe transaction executed:", executeTxResponse.hash);
```

### Setting Safe as contract owner (Solidity)

```solidity
import "@openzeppelin/contracts/access/Ownable.sol";

contract Protocol is Ownable {
    // Deploy with Safe address as owner
    constructor(address safeAddress) Ownable(safeAddress) {}

    // All onlyOwner functions now require Safe multi-sig approval
    function setFeeRate(uint256 newRate) external onlyOwner {
        require(newRate <= 1000, "Fee too high"); // max 10%
        feeRate = newRate;
    }

    function pause() external onlyOwner {
        _pause();
    }
}
```

### Creating a Safe programmatically (TypeScript)

```typescript
import { SafeFactory } from "@safe-global/protocol-kit";

const safeFactory = await SafeFactory.create({ ethAdapter });

const safeAccountConfig = {
  owners: [
    "0xOwner1Address",
    "0xOwner2Address",
    "0xOwner3Address",
  ],
  threshold: 2, // 2-of-3 required
};

const safe = await safeFactory.deploySafe({ safeAccountConfig });
const safeAddress = await safe.getAddress();

console.log(`Safe deployed at: ${safeAddress}`);
```

---

## 5. Development vs Production

### What to know

Development and production must use completely separate wallets, keys, and configurations. Test accounts with known private keys are fine for local development but must never hold real funds. Each environment (development, staging, production) should use dedicated wallets.

### Development: well-known test accounts

```typescript
// Hardhat / Anvil default test accounts — NEVER use on mainnet
// These private keys are publicly known
const TEST_ACCOUNTS = {
  deployer: {
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  },
  user1: {
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  },
};

// In development config
const config = {
  development: {
    rpcUrl: "http://127.0.0.1:8545",
    privateKey: TEST_ACCOUNTS.deployer.privateKey,
  },
  production: {
    rpcUrl: process.env.ETH_RPC_URL,    // Real RPC
    privateKey: process.env.PRIVATE_KEY, // Real key from env
  },
};
```

### Foundry: test accounts and fork testing

```bash
# Local development with Anvil (Foundry's local node)
anvil --fork-url $ETH_RPC_URL

# Run tests with fork
forge test --fork-url $ETH_RPC_URL

# Deploy to local Anvil (uses Anvil's default test accounts)
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast

# Deploy to testnet (uses .env private key)
source .env
forge script script/Deploy.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify
```

### Hardhat: network configuration

```typescript
// hardhat.config.ts
import { HardhatUserConfig } from "hardhat/config";
import dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  networks: {
    // Local development — no real keys needed
    hardhat: {
      forking: {
        url: process.env.ETH_RPC_URL ?? "",
        enabled: !!process.env.FORK,
      },
    },
    // Testnet — dedicated testnet wallet
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL ?? "",
      accounts: process.env.TESTNET_PRIVATE_KEY
        ? [process.env.TESTNET_PRIVATE_KEY]
        : [],
    },
    // Mainnet — production wallet (or use Ledger)
    mainnet: {
      url: process.env.ETH_RPC_URL ?? "",
      accounts: process.env.MAINNET_PRIVATE_KEY
        ? [process.env.MAINNET_PRIVATE_KEY]
        : [],
      // Or use Ledger:
      // ledgerAccounts: ["0xYourLedgerAddress"],
    },
  },
};

export default config;
```

### Environment separation checklist

| Environment | Wallet source | Funds | RPC |
|-------------|--------------|-------|-----|
| Local (Hardhat/Anvil) | Built-in test accounts | Fake ETH (unlimited) | `http://127.0.0.1:8545` |
| Testnet (Sepolia, Mumbai) | Dedicated testnet wallet | Faucet ETH (free) | Alchemy/Infura testnet URL |
| Staging | Dedicated staging wallet | Small real funds for integration tests | Alchemy/Infura mainnet URL |
| Production | Hardware wallet or multi-sig | Production funds | Alchemy/Infura mainnet URL |

### Testnet faucets

```bash
# Sepolia (Ethereum testnet)
# https://sepoliafaucet.com — requires Alchemy account
# https://www.infura.io/faucet/sepolia — requires Infura account

# Arbitrum Sepolia
# https://faucet.quicknode.com/arbitrum/sepolia

# Base Sepolia
# https://www.coinbase.com/faucets/base-ethereum-goerli-faucet

# Polygon Amoy
# https://faucet.polygon.technology/
```

---

## 6. Common Mistakes

### Hardcoded keys in source code

```typescript
// WRONG — key is in source code, will be committed to git
const wallet = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");

// CORRECT — key loaded from environment
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!);
```

### Keys in git history

Even if you delete a key from the code, it remains in git history forever.

```bash
# Check if keys have ever been committed (run this in any crypto project)
git log --all -p -- '*.env' '*.key' '*.pem'
git log --all -p -S "0x" --diff-filter=A -- '*.ts' '*.js' '*.py' '*.sol'

# If a key was ever committed, consider it COMPROMISED
# 1. Rotate the key immediately (generate a new one)
# 2. Transfer all funds from the old address
# 3. Revoke and regenerate API keys
# 4. Use git filter-branch or BFG Repo Cleaner to remove from history (optional)
```

### Keys in log output

```typescript
// WRONG — key appears in logs
console.log("Config:", JSON.stringify(config)); // config contains privateKey

// WRONG — error includes key
try {
  const wallet = new ethers.Wallet(privateKey);
} catch (e) {
  console.error("Failed to create wallet with key:", privateKey, e); // Leaks key
}

// CORRECT — redact sensitive fields before logging
function sanitizeConfig(config: any): any {
  const sanitized = { ...config };
  const sensitiveKeys = ["privateKey", "apiSecret", "mnemonic", "password"];
  for (const key of sensitiveKeys) {
    if (key in sanitized) {
      sanitized[key] = "***REDACTED***";
    }
  }
  return sanitized;
}

console.log("Config:", JSON.stringify(sanitizeConfig(config)));
```

### Unencrypted key files

```typescript
// WRONG — plain text key file
import { readFileSync } from "fs";
const key = readFileSync("./private-key.txt", "utf8").trim();

// BETTER — encrypted keystore (ethers.js)
import { ethers } from "ethers";

// Encrypt a key to a keystore file (do this once)
async function encryptKey(privateKey: string, password: string): Promise<string> {
  const wallet = new ethers.Wallet(privateKey);
  return wallet.encrypt(password);
}

// Load from encrypted keystore at runtime
async function loadKey(keystorePath: string, password: string): Promise<ethers.Wallet> {
  const keystore = readFileSync(keystorePath, "utf8");
  return ethers.Wallet.fromEncryptedJson(keystore, password);
}

// Password comes from environment variable or interactive prompt — not from a file
const wallet = await loadKey("./keystore.json", process.env.KEYSTORE_PASSWORD!);
```

### API keys with excessive permissions

```
WRONG:  Exchange API key with withdrawal permission enabled
        (if the bot is compromised, attacker can withdraw funds)

CORRECT: Exchange API key with ONLY these permissions:
        - Read account info
        - Place/cancel orders
        - NO withdrawal permission
        - IP whitelist restricted to bot's server IP
```

### Shared keys across environments

```
WRONG:  Same private key used for development, testnet, and mainnet
        (a bug in dev code can accidentally send mainnet transactions)

CORRECT: Separate wallets per environment:
        - Development: Hardhat/Anvil test accounts
        - Testnet: Dedicated testnet wallet (TESTNET_PRIVATE_KEY)
        - Production: Dedicated production wallet (MAINNET_PRIVATE_KEY)
```

---

## Quick Reference: Key Management Rules

| Rule | Consequence of violation |
|------|------------------------|
| Never hardcode keys in source | Keys exposed via git history — total fund loss |
| Always add .env to .gitignore | Keys committed to repository — total fund loss |
| Never log keys or mnemonics | Keys exposed in log files/aggregators |
| Use hardware wallets for mainnet | Software key theft if server is compromised |
| Separate keys per environment | Dev bug triggers mainnet transaction |
| Restrict API key permissions | Compromised bot can withdraw exchange funds |
| Rotate keys if potentially exposed | Attacker uses old key before you react |
| Validate env vars on startup | Silent failure leads to undefined behavior |
