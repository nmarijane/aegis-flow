# CEX Integration Patterns

## ccxt Unified API

### Initialization

```typescript
import ccxt from "ccxt";

// Binance
const binance = new ccxt.binance({
  apiKey: process.env.BINANCE_API_KEY,
  secret: process.env.BINANCE_SECRET,
  options: { defaultType: "spot" }, // "spot" | "future" | "swap"
});

// Coinbase
const coinbase = new ccxt.coinbase({
  apiKey: process.env.COINBASE_API_KEY,
  secret: process.env.COINBASE_SECRET,
});

// Kraken
const kraken = new ccxt.kraken({
  apiKey: process.env.KRAKEN_API_KEY,
  secret: process.env.KRAKEN_SECRET,
});

// OKX
const okx = new ccxt.okx({
  apiKey: process.env.OKX_API_KEY,
  secret: process.env.OKX_SECRET,
  password: process.env.OKX_PASSPHRASE, // OKX requires a passphrase
});

// Enable sandbox / testnet mode
const binanceTestnet = new ccxt.binance({
  apiKey: process.env.BINANCE_TESTNET_KEY,
  secret: process.env.BINANCE_TESTNET_SECRET,
  sandbox: true,
});
```

### Common Operations

#### Fetch Ticker

```typescript
const ticker = await binance.fetchTicker("BTC/USDT");
// {
//   symbol: "BTC/USDT",
//   last: 67432.10,
//   bid: 67430.00,
//   ask: 67435.20,
//   high: 68100.00,
//   low: 66800.00,
//   volume: 23456.789,
//   timestamp: 1710590400000,
// }
```

#### Create Order

```typescript
// Market buy
const marketBuy = await binance.createOrder(
  "ETH/USDT", "market", "buy", 0.5 // 0.5 ETH
);

// Limit sell
const limitSell = await binance.createOrder(
  "ETH/USDT", "limit", "sell",
  0.5,    // amount
  3500    // price
);

// With exchange-specific params
const postOnly = await binance.createOrder(
  "ETH/USDT", "limit", "buy", 0.5, 3000,
  { timeInForce: "GTX" } // GTX = post-only on Binance
);
```

#### Fetch Balance

```typescript
const balance = await binance.fetchBalance();
// Access specific currency
console.log(balance.USDT);
// { free: 5000.00, used: 1200.00, total: 6200.00 }

// All non-zero balances
const nonZero = Object.entries(balance.total)
  .filter(([_, v]) => (v as number) > 0);
```

#### Fetch OHLCV

```typescript
const candles = await binance.fetchOHLCV(
  "BTC/USDT",
  "1h",         // timeframe: 1m, 5m, 15m, 1h, 4h, 1d, 1w
  undefined,    // since (timestamp ms) — omit for latest
  100           // limit
);

// Each candle: [timestamp, open, high, low, close, volume]
for (const [ts, o, h, l, c, v] of candles) {
  console.log(`${new Date(ts).toISOString()} O:${o} H:${h} L:${l} C:${c} V:${v}`);
}
```

#### Fetch Open Orders & Cancel

```typescript
const openOrders = await binance.fetchOpenOrders("ETH/USDT");

// Cancel a specific order
await binance.cancelOrder(openOrders[0].id, "ETH/USDT");

// Cancel all open orders for a symbol
await binance.cancelAllOrders("ETH/USDT");
```

---

## WebSocket Feeds

### Real-Time Order Book

```typescript
import WebSocket from "ws";

interface OrderBookEntry {
  price: number;
  quantity: number;
}

class BinanceOrderBook {
  bids: OrderBookEntry[] = [];
  asks: OrderBookEntry[] = [];
  private ws: WebSocket | null = null;

  connect(symbol: string, depth: number = 20) {
    const stream = `${symbol.toLowerCase().replace("/", "")}@depth${depth}@100ms`;
    this.ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`);

    this.ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      this.bids = msg.bids.map(([p, q]: string[]) => ({
        price: parseFloat(p),
        quantity: parseFloat(q),
      }));
      this.asks = msg.asks.map(([p, q]: string[]) => ({
        price: parseFloat(p),
        quantity: parseFloat(q),
      }));
    });

    this.ws.on("ping", () => this.ws?.pong());

    this.ws.on("close", () => {
      console.log("OrderBook WS closed, reconnecting in 5s...");
      setTimeout(() => this.connect(symbol, depth), 5000);
    });

    this.ws.on("error", (err) => {
      console.error("OrderBook WS error:", err.message);
    });
  }

  getBestBid(): OrderBookEntry | undefined {
    return this.bids[0];
  }

  getBestAsk(): OrderBookEntry | undefined {
    return this.asks[0];
  }

  getMidPrice(): number | undefined {
    const bid = this.getBestBid();
    const ask = this.getBestAsk();
    if (!bid || !ask) return undefined;
    return (bid.price + ask.price) / 2;
  }

  disconnect() {
    this.ws?.close();
  }
}
```

### Trade Stream

```typescript
interface Trade {
  symbol: string;
  price: number;
  quantity: number;
  side: "buy" | "sell";
  timestamp: number;
}

class TradeStream {
  private ws: WebSocket | null = null;
  private handlers: ((trade: Trade) => void)[] = [];

  onTrade(handler: (trade: Trade) => void) {
    this.handlers.push(handler);
  }

  connect(symbol: string) {
    const stream = `${symbol.toLowerCase().replace("/", "")}@trade`;
    this.ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`);

    this.ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      const trade: Trade = {
        symbol: msg.s,
        price: parseFloat(msg.p),
        quantity: parseFloat(msg.q),
        side: msg.m ? "sell" : "buy", // m = true means buyer is maker = market sell
        timestamp: msg.T,
      };
      for (const handler of this.handlers) handler(trade);
    });

    this.ws.on("ping", () => this.ws?.pong());
    this.ws.on("close", () => setTimeout(() => this.connect(symbol), 5000));
  }

  disconnect() {
    this.ws?.close();
  }
}
```

### Balance Updates (User Data Stream)

```typescript
import ccxt from "ccxt";

async function startUserDataStream(exchange: ccxt.binance) {
  // Step 1 — create listen key
  const response = await exchange.publicPostUserDataStream();
  const listenKey = response.listenKey;

  // Step 2 — connect to user data stream
  const ws = new WebSocket(
    `wss://stream.binance.com:9443/ws/${listenKey}`
  );

  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());

    switch (msg.e) {
      case "outboundAccountPosition":
        // Balance change
        for (const balance of msg.B) {
          console.log(`${balance.a}: free=${balance.f}, locked=${balance.l}`);
        }
        break;

      case "executionReport":
        // Order update
        console.log(
          `Order ${msg.i}: ${msg.S} ${msg.o} ${msg.s} — status: ${msg.X}, filled: ${msg.z}/${msg.q}`
        );
        break;
    }
  });

  // Step 3 — keepalive every 30 minutes
  const keepaliveInterval = setInterval(async () => {
    try {
      await exchange.publicPutUserDataStream({ listenKey });
    } catch (err) {
      console.error("Keepalive failed:", err);
    }
  }, 30 * 60 * 1000);

  ws.on("close", () => clearInterval(keepaliveInterval));

  return { ws, listenKey };
}
```

### Reconnection Pattern

```typescript
class ReconnectingWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private messageHandler: (data: string) => void;
  private shouldReconnect = true;

  constructor(url: string, onMessage: (data: string) => void) {
    this.url = url;
    this.messageHandler = onMessage;
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.on("open", () => {
      console.log(`Connected to ${this.url}`);
      this.reconnectDelay = 1000; // reset on successful connect
    });

    this.ws.on("message", (data) => {
      this.messageHandler(data.toString());
    });

    this.ws.on("ping", () => this.ws?.pong());

    this.ws.on("close", () => {
      if (!this.shouldReconnect) return;
      console.log(`Disconnected. Reconnecting in ${this.reconnectDelay}ms...`);
      setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 2,
        this.maxReconnectDelay
      );
    });

    this.ws.on("error", (err) => {
      console.error("WS error:", err.message);
      this.ws?.close();
    });
  }

  disconnect() {
    this.shouldReconnect = false;
    this.ws?.close();
  }
}
```

---

## Order Types

### Market Order

```typescript
// Buy 0.1 ETH at current market price
const order = await exchange.createOrder("ETH/USDT", "market", "buy", 0.1);
```

### Limit Order

```typescript
// Buy 0.1 ETH at $3,000
const order = await exchange.createOrder("ETH/USDT", "limit", "buy", 0.1, 3000);
```

### Stop-Loss

```typescript
// Binance stop-loss: sell when price drops to $2,800
const stopLoss = await exchange.createOrder(
  "ETH/USDT", "STOP_LOSS_LIMIT", "sell", 0.1, 2790,
  { stopPrice: 2800 }
);

// ccxt unified stop-loss (exchange-agnostic)
const stop = await exchange.createOrder(
  "ETH/USDT", "limit", "sell", 0.1, 2790,
  { stopLossPrice: 2800 }
);
```

### Trailing Stop

```typescript
// Binance trailing stop: trail by 2%
const trailing = await exchange.createOrder(
  "ETH/USDT", "TRAILING_STOP_MARKET", "sell", 0.1,
  undefined,
  { callbackRate: 2 } // 2% trailing distance
);
```

### OCO (One-Cancels-the-Other)

```typescript
// Binance OCO: take profit at $3,500, stop-loss at $2,800
const oco = await (exchange as any).privatePostOrderOco({
  symbol: "ETHUSDT",
  side: "SELL",
  quantity: 0.1,
  price: 3500,           // limit price (take profit)
  stopPrice: 2800,       // trigger price for stop
  stopLimitPrice: 2790,  // stop limit price
  stopLimitTimeInForce: "GTC",
});
```

---

## Authentication

### API Key Management

```typescript
// Store keys in environment variables — NEVER in code
const config = {
  apiKey: process.env.EXCHANGE_API_KEY!,
  secret: process.env.EXCHANGE_SECRET!,
  password: process.env.EXCHANGE_PASSPHRASE, // OKX, KuCoin
};

// Validate keys are present at startup
function validateConfig(keys: Record<string, string | undefined>) {
  for (const [name, value] of Object.entries(keys)) {
    if (!value) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
  }
}

validateConfig({
  EXCHANGE_API_KEY: process.env.EXCHANGE_API_KEY,
  EXCHANGE_SECRET: process.env.EXCHANGE_SECRET,
});
```

### API Key Permission Best Practices

| Permission | Market Making | Arbitrage | Read-Only |
| --- | --- | --- | --- |
| Read | Yes | Yes | Yes |
| Spot Trade | Yes | Yes | No |
| Futures Trade | Optional | Optional | No |
| Withdrawal | No | No | No |
| IP Whitelist | Required | Required | Recommended |

**Always**: enable IP whitelisting, disable withdrawals on trading keys, and use separate keys for different bots/strategies.

---

## Error Handling

### Common Error Codes

```typescript
import ccxt from "ccxt";

async function safeOrder(
  exchange: ccxt.Exchange,
  symbol: string,
  type: string,
  side: "buy" | "sell",
  amount: number,
  price?: number,
  retries: number = 3
): Promise<ccxt.Order | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await exchange.createOrder(symbol, type, side, amount, price);
    } catch (err) {
      if (err instanceof ccxt.InsufficientFunds) {
        console.error(`Insufficient funds for ${side} ${amount} ${symbol}`);
        return null; // do not retry
      }

      if (err instanceof ccxt.InvalidOrder) {
        console.error(`Invalid order: ${(err as Error).message}`);
        return null; // do not retry — fix the order params
      }

      if (err instanceof ccxt.RateLimitExceeded) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`Rate limited. Waiting ${delay}ms (attempt ${attempt}/${retries})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (err instanceof ccxt.NetworkError) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`Network error. Retrying in ${delay}ms (attempt ${attempt}/${retries})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (err instanceof ccxt.ExchangeNotAvailable) {
        console.error("Exchange unavailable. Pausing operations.");
        await new Promise((r) => setTimeout(r, 30000));
        continue;
      }

      if (err instanceof ccxt.AuthenticationError) {
        console.error("Authentication failed — check API keys");
        return null; // do not retry
      }

      // Unknown error
      console.error(`Unexpected error (attempt ${attempt}):`, err);
      if (attempt === retries) throw err;
    }
  }
  return null;
}
```

### Rate Limit Handling

```typescript
class RateLimiter {
  private timestamps: number[] = [];
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);

    if (this.timestamps.length >= this.maxRequests) {
      const oldestInWindow = this.timestamps[0];
      const waitMs = this.windowMs - (now - oldestInWindow) + 10;
      await new Promise((r) => setTimeout(r, waitMs));
    }

    this.timestamps.push(Date.now());
  }
}

// Binance: 1200 requests per minute
const limiter = new RateLimiter(1200, 60000);

async function rateLimitedFetch(exchange: ccxt.Exchange, symbol: string) {
  await limiter.waitForSlot();
  return exchange.fetchTicker(symbol);
}
```

---

## Multi-Exchange

### Abstract Exchange Interface

```typescript
interface UnifiedExchange {
  name: string;
  fetchPrice(symbol: string): Promise<number>;
  placeLimitOrder(
    symbol: string,
    side: "buy" | "sell",
    amount: number,
    price: number
  ): Promise<string>; // returns order ID
  cancelOrder(orderId: string, symbol: string): Promise<void>;
  getBalance(currency: string): Promise<{ free: number; used: number; total: number }>;
}

class CcxtExchange implements UnifiedExchange {
  name: string;
  private exchange: ccxt.Exchange;

  constructor(name: string, exchange: ccxt.Exchange) {
    this.name = name;
    this.exchange = exchange;
  }

  async fetchPrice(symbol: string): Promise<number> {
    const ticker = await this.exchange.fetchTicker(symbol);
    return ticker.last!;
  }

  async placeLimitOrder(
    symbol: string,
    side: "buy" | "sell",
    amount: number,
    price: number
  ): Promise<string> {
    const order = await this.exchange.createOrder(symbol, "limit", side, amount, price);
    return order.id;
  }

  async cancelOrder(orderId: string, symbol: string): Promise<void> {
    await this.exchange.cancelOrder(orderId, symbol);
  }

  async getBalance(currency: string): Promise<{ free: number; used: number; total: number }> {
    const balance = await this.exchange.fetchBalance();
    return {
      free: balance[currency]?.free ?? 0,
      used: balance[currency]?.used ?? 0,
      total: balance[currency]?.total ?? 0,
    };
  }
}
```

### Exchange Factory

```typescript
type ExchangeId = "binance" | "coinbase" | "kraken" | "okx";

function createExchange(id: ExchangeId): UnifiedExchange {
  const configs: Record<ExchangeId, () => ccxt.Exchange> = {
    binance: () =>
      new ccxt.binance({
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_SECRET,
      }),
    coinbase: () =>
      new ccxt.coinbase({
        apiKey: process.env.COINBASE_API_KEY,
        secret: process.env.COINBASE_SECRET,
      }),
    kraken: () =>
      new ccxt.kraken({
        apiKey: process.env.KRAKEN_API_KEY,
        secret: process.env.KRAKEN_SECRET,
      }),
    okx: () =>
      new ccxt.okx({
        apiKey: process.env.OKX_API_KEY,
        secret: process.env.OKX_SECRET,
        password: process.env.OKX_PASSPHRASE,
      }),
  };

  const factory = configs[id];
  if (!factory) throw new Error(`Unsupported exchange: ${id}`);
  return new CcxtExchange(id, factory());
}

// Usage: aggregate prices across all exchanges
async function getBestPrice(
  symbol: string,
  exchanges: UnifiedExchange[]
): Promise<{ exchange: string; price: number }> {
  const prices = await Promise.all(
    exchanges.map(async (ex) => ({
      exchange: ex.name,
      price: await ex.fetchPrice(symbol),
    }))
  );
  return prices.reduce((best, current) =>
    current.price < best.price ? current : best
  );
}
```
