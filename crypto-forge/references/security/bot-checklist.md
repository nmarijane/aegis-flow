# Trading Bot Security Checklist

Comprehensive security checklist for trading bot development. Referenced by the `auditor` agent when auditing bot code and by the `bot-builder` agent during code generation.

---

## 1. Private Key Management

### What to check

- Private keys and API secrets are never hardcoded in source code.
- Keys are loaded from environment variables via `.env` files.
- `.env` is listed in `.gitignore`.
- Production deployments use hardware wallets or cloud KMS.
- Hot wallets (for active trading) are separate from cold wallets (for storage).

### Why it matters

A leaked private key means total loss of funds. Keys committed to git history are exposed even after deletion. Bots with direct access to high-value wallets are single points of failure.

### Environment variable pattern (TypeScript)

```typescript
import dotenv from "dotenv";
dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
  throw new Error("PRIVATE_KEY environment variable is required");
}

const API_KEY = process.env.EXCHANGE_API_KEY;
const API_SECRET = process.env.EXCHANGE_API_SECRET;
if (!API_KEY || !API_SECRET) {
  throw new Error("Exchange API credentials are required");
}
```

### Environment variable pattern (Python)

```python
import os
from dotenv import load_dotenv

load_dotenv()

PRIVATE_KEY = os.environ.get("PRIVATE_KEY")
if not PRIVATE_KEY:
    raise ValueError("PRIVATE_KEY environment variable is required")

API_KEY = os.environ.get("EXCHANGE_API_KEY")
API_SECRET = os.environ.get("EXCHANGE_API_SECRET")
if not API_KEY or not API_SECRET:
    raise ValueError("Exchange API credentials are required")
```

### .env.example template

```env
# Blockchain
PRIVATE_KEY=0x_your_private_key_here
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
ARB_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY

# Exchange API
EXCHANGE_API_KEY=your_api_key_here
EXCHANGE_API_SECRET=your_api_secret_here

# Bot Configuration
MAX_POSITION_SIZE_USD=1000
DAILY_LOSS_LIMIT_USD=500
```

### .gitignore entries

```gitignore
.env
.env.local
.env.production
*.pem
*.key
```

---

## 2. Slippage Protection

### What to check

- Maximum slippage is configurable and never set to 100%.
- Slippage is dynamically adjusted based on trade size and pool liquidity.
- Bot is aware of sandwich attacks and uses private mempools when available.
- Minimum output amounts are calculated before every swap.

### Why it matters

Without slippage protection, MEV bots will sandwich every transaction, extracting the maximum possible value. A swap with `minAmountOut = 0` (100% slippage) is giving away all funds to the first MEV bot that spots it.

### Configurable slippage (TypeScript)

```typescript
interface SlippageConfig {
  defaultSlippageBps: number;   // e.g., 50 = 0.5%
  maxSlippageBps: number;       // e.g., 300 = 3% — hard cap
  dynamicSlippage: boolean;     // Adjust based on liquidity
}

function calculateMinOutput(
  expectedOutput: bigint,
  slippageBps: number,
  maxSlippageBps: number
): bigint {
  const effectiveSlippage = Math.min(slippageBps, maxSlippageBps);
  return expectedOutput - (expectedOutput * BigInt(effectiveSlippage)) / 10000n;
}

// WRONG: minAmountOut = 0 — gives MEV bots a blank check
// router.swapExactTokensForTokens(amountIn, 0, path, to, deadline);

// CORRECT: calculate minimum output with bounded slippage
const minOut = calculateMinOutput(expectedOut, config.defaultSlippageBps, config.maxSlippageBps);
```

### Dynamic slippage based on liquidity (TypeScript)

```typescript
function getDynamicSlippage(
  tradeSize: bigint,
  poolLiquidity: bigint,
  baseSlippageBps: number
): number {
  // Increase slippage for larger trades relative to pool size
  const ratio = Number((tradeSize * 10000n) / poolLiquidity);

  if (ratio < 10) return baseSlippageBps;          // < 0.1% of pool
  if (ratio < 100) return baseSlippageBps * 2;      // < 1% of pool
  if (ratio < 500) return baseSlippageBps * 3;      // < 5% of pool

  // Trade too large relative to pool — warn and abort
  throw new Error(
    `Trade size is ${ratio / 100}% of pool liquidity — too high impact`
  );
}
```

### Sandwich attack mitigation (TypeScript)

```typescript
// Use Flashbots or other private mempool services to avoid the public mempool
import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";

async function sendPrivateTransaction(signedTx: string): Promise<string> {
  const flashbotsProvider = await FlashbotsBundleProvider.create(
    provider,
    authSigner,
    "https://relay.flashbots.net"
  );

  const bundle = await flashbotsProvider.sendPrivateTransaction({
    signedTransaction: signedTx,
    maxBlockNumber: await provider.getBlockNumber() + 5,
  });

  return bundle.hash;
}
```

---

## 3. Rate Limiting

### What to check

- Bot respects exchange API rate limits (requests per second/minute).
- Exponential backoff is implemented for rate limit errors (HTTP 429).
- Requests are queued to smooth traffic spikes.
- WebSocket connections are used instead of REST polling where possible.
- Connection limits per IP/API key are respected.

### Why it matters

Exceeding rate limits causes temporary bans, missed trades, and degraded data quality. Aggressive polling wastes resources and can trigger permanent API key revocation.

### Rate limiter (TypeScript)

```typescript
class RateLimiter {
  private timestamps: number[] = [];

  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {}

  async waitForSlot(): Promise<void> {
    while (true) {
      const now = Date.now();
      this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);

      if (this.timestamps.length < this.maxRequests) {
        this.timestamps.push(now);
        return;
      }

      const oldestInWindow = this.timestamps[0];
      const waitTime = this.windowMs - (now - oldestInWindow) + 10;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
}

// Usage: Binance allows 1200 requests/minute
const limiter = new RateLimiter(1200, 60_000);

async function fetchOrderBook(symbol: string) {
  await limiter.waitForSlot();
  return exchange.fetchOrderBook(symbol);
}
```

### Exponential backoff (TypeScript)

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  baseDelayMs: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRateLimit = error?.status === 429 || error?.code === "RATE_LIMIT";
      const isRetryable = isRateLimit || error?.code === "ETIMEDOUT";

      if (!isRetryable || attempt === maxRetries) throw error;

      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000;
      console.warn(
        `Attempt ${attempt + 1} failed (${error.message}), retrying in ${Math.round(delay)}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Unreachable");
}
```

### WebSocket over REST polling (TypeScript)

```typescript
// WRONG: polling every 100ms wastes API calls
setInterval(async () => {
  const ticker = await exchange.fetchTicker("ETH/USDC");
  processPrice(ticker.last);
}, 100);

// CORRECT: use WebSocket for real-time data
const ws = new WebSocket("wss://stream.binance.com:9443/ws/ethusdc@ticker");

ws.on("message", (data: string) => {
  const ticker = JSON.parse(data);
  processPrice(parseFloat(ticker.c)); // Current price
});

ws.on("close", () => {
  console.warn("WebSocket closed, reconnecting...");
  setTimeout(connect, 5000); // Reconnect with delay
});
```

### Rate limiter (Python)

```python
import asyncio
import time
from collections import deque


class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: float):
        self.max_requests = max_requests
        self.window = window_seconds
        self.timestamps: deque[float] = deque()

    async def acquire(self):
        while True:
            now = time.monotonic()
            while self.timestamps and now - self.timestamps[0] >= self.window:
                self.timestamps.popleft()

            if len(self.timestamps) < self.max_requests:
                self.timestamps.append(now)
                return

            wait_time = self.window - (now - self.timestamps[0]) + 0.01
            await asyncio.sleep(wait_time)


# Usage
limiter = RateLimiter(max_requests=1200, window_seconds=60)

async def fetch_order_book(exchange, symbol: str):
    await limiter.acquire()
    return await exchange.fetch_order_book(symbol)
```

---

## 4. Error Handling

### What to check

- Retry logic with exponential backoff for transient errors.
- Graceful shutdown on SIGINT/SIGTERM (cancel open orders, close positions if configured).
- Nonce management handles concurrent transactions and nonce conflicts.
- Gas price spikes are detected and handled (wait or use gas price limits).
- Network disconnection triggers automatic reconnection.
- All errors are logged with context (timestamp, operation, parameters).

### Why it matters

Bots run unattended. An unhandled error can leave open orders, miss liquidation, or send duplicate transactions. Poor nonce management causes stuck or failed transactions. Without graceful shutdown, a Ctrl+C during a multi-step operation can leave the bot in an inconsistent state.

### Graceful shutdown (TypeScript)

```typescript
class TradingBot {
  private isShuttingDown = false;
  private openOrders: string[] = [];

  constructor() {
    process.on("SIGINT", () => this.shutdown("SIGINT"));
    process.on("SIGTERM", () => this.shutdown("SIGTERM"));
    process.on("uncaughtException", (err) => {
      console.error("Uncaught exception:", err);
      this.shutdown("uncaughtException");
    });
  }

  private async shutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log(`\nReceived ${signal}. Shutting down gracefully...`);

    // Cancel all open orders
    for (const orderId of this.openOrders) {
      try {
        await this.exchange.cancelOrder(orderId);
        console.log(`Cancelled order: ${orderId}`);
      } catch (err) {
        console.error(`Failed to cancel order ${orderId}:`, err);
      }
    }

    console.log("Shutdown complete.");
    process.exit(0);
  }
}
```

### Nonce management (TypeScript)

```typescript
class NonceManager {
  private currentNonce: number | null = null;
  private mutex = new Mutex();

  constructor(private provider: JsonRpcProvider, private address: string) {}

  async getNextNonce(): Promise<number> {
    return this.mutex.runExclusive(async () => {
      if (this.currentNonce === null) {
        this.currentNonce = await this.provider.getTransactionCount(this.address, "pending");
      } else {
        this.currentNonce++;
      }
      return this.currentNonce;
    });
  }

  // Call when a transaction fails and the nonce was not consumed
  async reset(): Promise<void> {
    return this.mutex.runExclusive(async () => {
      this.currentNonce = null;
    });
  }
}
```

### Gas price spike handling (TypeScript)

```typescript
interface GasConfig {
  maxGasPriceGwei: number;  // Absolute maximum — never exceed
  gasPriceMultiplier: number; // e.g., 1.2 = 20% above base fee
  waitOnSpikeMs: number;     // How long to wait before retrying
}

async function getGasPrice(
  provider: JsonRpcProvider,
  config: GasConfig
): Promise<bigint> {
  const feeData = await provider.getFeeData();
  const baseFee = feeData.gasPrice ?? 0n;
  const adjusted = (baseFee * BigInt(Math.round(config.gasPriceMultiplier * 100))) / 100n;
  const maxWei = BigInt(config.maxGasPriceGwei) * 10n ** 9n;

  if (adjusted > maxWei) {
    console.warn(
      `Gas price ${Number(adjusted / 10n ** 9n)} gwei exceeds max ${config.maxGasPriceGwei} gwei — waiting`
    );
    throw new Error("GAS_PRICE_SPIKE");
  }

  return adjusted;
}
```

### Graceful shutdown (Python)

```python
import signal
import asyncio


class TradingBot:
    def __init__(self):
        self.is_shutting_down = False
        self.open_orders: list[str] = []

        signal.signal(signal.SIGINT, self._handle_signal)
        signal.signal(signal.SIGTERM, self._handle_signal)

    def _handle_signal(self, signum, frame):
        if self.is_shutting_down:
            return
        self.is_shutting_down = True
        print(f"\nReceived signal {signum}. Shutting down gracefully...")
        asyncio.create_task(self._shutdown())

    async def _shutdown(self):
        for order_id in self.open_orders:
            try:
                await self.exchange.cancel_order(order_id)
                print(f"Cancelled order: {order_id}")
            except Exception as e:
                print(f"Failed to cancel order {order_id}: {e}")

        print("Shutdown complete.")
```

---

## 5. Fund Safety

### What to check

- Maximum position size is configured and enforced per trade.
- Daily loss limit (kill switch) automatically halts trading when exceeded.
- Paper trading mode is available for testing strategies with real market data but no real funds.
- Emergency stop mechanism allows instant halt via external signal (API, file flag).
- The bot never trades with the full wallet balance — always keep a gas reserve.

### Why it matters

Bugs in strategy logic, unexpected market conditions, or API errors can cause rapid fund depletion. Without circuit breakers, a bot can lose the entire account in minutes. Paper trading prevents costly mistakes during strategy development.

### Position size limits (TypeScript)

```typescript
interface RiskConfig {
  maxPositionSizeUsd: number;
  maxPositionPct: number;        // Max % of portfolio per position
  dailyLossLimitUsd: number;
  gasReserveEth: number;          // Always keep this much for gas
}

class RiskManager {
  private dailyPnL = 0;

  constructor(private config: RiskConfig) {}

  validateTrade(tradeSizeUsd: number, portfolioValueUsd: number): void {
    if (tradeSizeUsd > this.config.maxPositionSizeUsd) {
      throw new Error(
        `Trade size $${tradeSizeUsd} exceeds max $${this.config.maxPositionSizeUsd}`
      );
    }

    const pctOfPortfolio = (tradeSizeUsd / portfolioValueUsd) * 100;
    if (pctOfPortfolio > this.config.maxPositionPct) {
      throw new Error(
        `Trade is ${pctOfPortfolio.toFixed(1)}% of portfolio, max is ${this.config.maxPositionPct}%`
      );
    }

    if (Math.abs(this.dailyPnL) >= this.config.dailyLossLimitUsd && this.dailyPnL < 0) {
      throw new Error(
        `Daily loss limit reached: $${Math.abs(this.dailyPnL)} / $${this.config.dailyLossLimitUsd}`
      );
    }
  }

  recordPnL(pnl: number): void {
    this.dailyPnL += pnl;
    if (this.dailyPnL <= -this.config.dailyLossLimitUsd) {
      console.error("KILL SWITCH: Daily loss limit exceeded. Halting all trading.");
      process.emit("SIGTERM", "SIGTERM");
    }
  }
}
```

### Paper trading mode (TypeScript)

```typescript
interface TradeExecutor {
  executeTrade(params: TradeParams): Promise<TradeResult>;
}

class LiveExecutor implements TradeExecutor {
  async executeTrade(params: TradeParams): Promise<TradeResult> {
    return this.exchange.createOrder(
      params.symbol, params.side, params.type, params.amount, params.price
    );
  }
}

class PaperExecutor implements TradeExecutor {
  private trades: TradeResult[] = [];

  async executeTrade(params: TradeParams): Promise<TradeResult> {
    const result: TradeResult = {
      id: `paper-${Date.now()}`,
      symbol: params.symbol,
      side: params.side,
      amount: params.amount,
      price: params.price ?? await this.getMarketPrice(params.symbol),
      timestamp: Date.now(),
      simulated: true,
    };
    this.trades.push(result);
    console.log(`[PAPER] ${result.side} ${result.amount} ${result.symbol} @ ${result.price}`);
    return result;
  }
}

// Select executor based on config
const executor: TradeExecutor = config.paperTrading
  ? new PaperExecutor()
  : new LiveExecutor(exchange);
```

### Emergency stop (TypeScript)

```typescript
import { existsSync } from "fs";

class EmergencyStop {
  private readonly stopFilePath = "./EMERGENCY_STOP";

  isTriggered(): boolean {
    // Check for stop file (can be created externally: `touch EMERGENCY_STOP`)
    if (existsSync(this.stopFilePath)) {
      console.error("EMERGENCY STOP: Stop file detected.");
      return true;
    }
    return false;
  }

  // Check before every trade
  guardTrade(): void {
    if (this.isTriggered()) {
      throw new Error("Trading halted by emergency stop");
    }
  }
}
```

---

## 6. Logging & Monitoring

### What to check

- Structured logging with timestamps, levels, and context fields.
- P&L is tracked per trade and aggregated daily.
- Alert thresholds trigger notifications (e.g., drawdown > 5%, failed transactions).
- Transaction receipts are archived for post-mortem analysis.
- Sensitive data (keys, full account balances) is never logged.

### Why it matters

Without structured logging, debugging production issues is impossible. P&L tracking detects strategy degradation before losses compound. Archived transaction receipts are essential for dispute resolution and tax reporting.

### Structured logging (TypeScript)

```typescript
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport:
    process.env.NODE_ENV === "development"
      ? { target: "pino-pretty" }
      : undefined,
  // Redact sensitive fields
  redact: ["privateKey", "apiSecret", "*.secret", "*.password"],
});

// Usage
logger.info({ symbol: "ETH/USDC", side: "buy", amount: 1.5, price: 3200 }, "Order placed");
logger.warn({ dailyPnL: -450, limit: 500 }, "Approaching daily loss limit");
logger.error({ orderId: "abc123", error: err.message }, "Order execution failed");
```

### P&L tracker (TypeScript)

```typescript
interface TradeRecord {
  timestamp: number;
  symbol: string;
  side: "buy" | "sell";
  amount: number;
  price: number;
  fee: number;
  pnl?: number;
}

class PnLTracker {
  private trades: TradeRecord[] = [];
  private positions: Map<string, { amount: number; avgPrice: number }> = new Map();

  recordTrade(trade: TradeRecord): void {
    const position = this.positions.get(trade.symbol);

    if (trade.side === "sell" && position) {
      trade.pnl = (trade.price - position.avgPrice) * trade.amount - trade.fee;
    }

    this.trades.push(trade);
    this.updatePosition(trade);

    logger.info({
      trade: trade.symbol,
      pnl: trade.pnl ?? 0,
      dailyPnl: this.getDailyPnL(),
    }, "Trade recorded");
  }

  getDailyPnL(): number {
    const todayStart = new Date().setHours(0, 0, 0, 0);
    return this.trades
      .filter((t) => t.timestamp >= todayStart && t.pnl !== undefined)
      .reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  }

  private updatePosition(trade: TradeRecord): void {
    // ... update average price and amount
  }
}
```

### Structured logging (Python)

```python
import structlog
import logging

structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    logger_factory=structlog.stdlib.LoggerFactory(),
)

logger = structlog.get_logger()

# Usage
logger.info("order_placed", symbol="ETH/USDC", side="buy", amount=1.5, price=3200)
logger.warning("daily_loss_approaching", daily_pnl=-450, limit=500)
logger.error("order_failed", order_id="abc123", error=str(err))
```

### Transaction receipt archival (TypeScript)

```typescript
import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";

function archiveReceipt(receipt: TransactionReceipt): void {
  const dir = join("logs", "receipts", new Date().toISOString().split("T")[0]);
  mkdirSync(dir, { recursive: true });

  const filePath = join(dir, `${receipt.hash}.json`);
  appendFileSync(filePath, JSON.stringify({
    hash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    status: receipt.status,
    timestamp: Date.now(),
  }, null, 2));
}
```

---

## 7. Configuration

### What to check

- All tunable parameters are in configuration files, not hardcoded in source.
- Environment-specific configurations exist (development, staging, production).
- Configuration is validated on startup — fail fast with clear error messages.
- Defaults are safe (conservative slippage, small position sizes, paper trading mode).

### Why it matters

Hardcoded parameters require code changes and redeployment to adjust. Missing validation causes subtle runtime failures. Unsafe defaults (large positions, no slippage protection) cause losses when a developer forgets to configure properly.

### Configuration file pattern (TypeScript)

```typescript
// config/default.ts — safe defaults
export const defaultConfig = {
  trading: {
    paperMode: true,                 // Default to paper trading
    maxPositionSizeUsd: 100,         // Conservative default
    dailyLossLimitUsd: 50,
    slippageBps: 50,                 // 0.5%
    maxSlippageBps: 300,             // 3% hard cap
    gasReserveEth: 0.05,
  },
  exchange: {
    name: "binance",
    rateLimit: 1200,                 // requests per minute
    wsReconnectDelayMs: 5000,
  },
  monitoring: {
    logLevel: "info",
    alertDrawdownPct: 5,
    archiveReceipts: true,
  },
};
```

```typescript
// config/production.ts — production overrides
import { defaultConfig } from "./default";

export const productionConfig = {
  ...defaultConfig,
  trading: {
    ...defaultConfig.trading,
    paperMode: false,                // Live trading
    maxPositionSizeUsd: 10000,
    dailyLossLimitUsd: 5000,
  },
};
```

### Startup validation (TypeScript)

```typescript
import { z } from "zod";

const configSchema = z.object({
  trading: z.object({
    paperMode: z.boolean(),
    maxPositionSizeUsd: z.number().positive(),
    dailyLossLimitUsd: z.number().positive(),
    slippageBps: z.number().min(1).max(1000),
    maxSlippageBps: z.number().min(1).max(5000),
    gasReserveEth: z.number().min(0.01),
  }),
  exchange: z.object({
    name: z.string().min(1),
    rateLimit: z.number().positive(),
  }),
});

function loadConfig(): Config {
  const env = process.env.NODE_ENV ?? "development";
  const raw = require(`./config/${env}`).default;

  const result = configSchema.safeParse(raw);
  if (!result.success) {
    console.error("Invalid configuration:");
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  console.log(`Loaded ${env} configuration (paper=${result.data.trading.paperMode})`);
  return result.data;
}
```

### Configuration file pattern (Python)

```python
# config/default.py
DEFAULT_CONFIG = {
    "trading": {
        "paper_mode": True,
        "max_position_size_usd": 100,
        "daily_loss_limit_usd": 50,
        "slippage_bps": 50,
        "max_slippage_bps": 300,
        "gas_reserve_eth": 0.05,
    },
    "exchange": {
        "name": "binance",
        "rate_limit": 1200,
        "ws_reconnect_delay_s": 5,
    },
    "monitoring": {
        "log_level": "info",
        "alert_drawdown_pct": 5,
        "archive_receipts": True,
    },
}
```

```python
# config/loader.py
import os
import json
from pydantic import BaseModel, field_validator


class TradingConfig(BaseModel):
    paper_mode: bool = True
    max_position_size_usd: float
    daily_loss_limit_usd: float
    slippage_bps: int
    max_slippage_bps: int

    @field_validator("slippage_bps")
    @classmethod
    def validate_slippage(cls, v):
        if v <= 0 or v > 1000:
            raise ValueError(f"slippage_bps must be between 1 and 1000, got {v}")
        return v


def load_config() -> dict:
    env = os.environ.get("ENV", "development")
    config_path = f"config/{env}.json"

    if not os.path.exists(config_path):
        print(f"Config file {config_path} not found, using defaults")
        from config.default import DEFAULT_CONFIG
        return DEFAULT_CONFIG

    with open(config_path) as f:
        raw = json.load(f)

    # Validate trading section
    TradingConfig(**raw.get("trading", {}))

    print(f"Loaded {env} configuration (paper={raw['trading']['paper_mode']})")
    return raw
```

---

## Quick Reference: Critical Rules

| Rule | Risk if violated |
|------|-----------------|
| Never hardcode private keys | Total fund loss if source is leaked |
| Never set slippage to 100% | MEV bots extract full trade value |
| Always implement kill switch | Unlimited losses on strategy failure |
| Always use paper mode as default | Real fund loss during development |
| Always validate config on startup | Silent misconfiguration causes losses |
| Always implement graceful shutdown | Open orders left on crash |
| Always log trades with P&L | Cannot detect strategy degradation |
