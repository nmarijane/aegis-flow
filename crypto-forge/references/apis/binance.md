# Binance API Integration Guide

## REST API

### Base URLs

| Environment | URL                            |
| ----------- | ------------------------------ |
| Production  | `https://api.binance.com`      |
| Backup      | `https://api1.binance.com`     |
| Testnet     | `https://testnet.binance.vision` |

### Authentication

Every signed request requires three headers / query parameters:

1. **X-MBX-APIKEY** header — your API key.
2. **signature** query param — HMAC-SHA256 of the query string using your secret.
3. **timestamp** query param — server time in ms (`Date.now()`).

```typescript
import crypto from "crypto";

function signQuery(queryString: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(queryString)
    .digest("hex");
}
```

### Common Endpoints

#### Get Price

```
GET /api/v3/ticker/price?symbol=BTCUSDT
```

Response:

```json
{ "symbol": "BTCUSDT", "price": "67432.10000000" }
```

#### Place Order

```
POST /api/v3/order
```

Required params: `symbol`, `side`, `type`, `timeInForce`, `quantity`, `price`, `timestamp`, `signature`.

#### Klines (Candlesticks)

```
GET /api/v3/klines?symbol=BTCUSDT&interval=1h&limit=100
```

Returns an array of arrays: `[openTime, open, high, low, close, volume, closeTime, ...]`.

#### Account Info

```
GET /api/v3/account?timestamp={ts}&signature={sig}
```

Returns balances, permissions, and commission rates.

---

## WebSocket Streams

### Base URL

```
wss://stream.binance.com:9443/ws/<streamName>
```

### Trade Stream

Subscribe to real-time trades:

```
wss://stream.binance.com:9443/ws/btcusdt@trade
```

Payload fields: `e` (event type), `s` (symbol), `p` (price), `q` (quantity), `T` (trade time).

### Depth Stream (Order Book)

```
wss://stream.binance.com:9443/ws/btcusdt@depth20@100ms
```

Levels: `@depth5`, `@depth10`, `@depth20`. Update speed: `@100ms` or `@1000ms`.

### User Data Stream

1. Create a listen key: `POST /api/v3/userDataStream` (returns `{ "listenKey": "..." }`).
2. Connect: `wss://stream.binance.com:9443/ws/<listenKey>`.
3. Keepalive every 30 min: `PUT /api/v3/userDataStream?listenKey=...`.

Events: `executionReport` (order updates), `outboundAccountPosition` (balance changes).

### Keepalive / Ping

The server sends a ping frame every 3 minutes. Respond with pong. If no pong is received the connection is dropped after 10 minutes.

---

## Rate Limits

| Limit Type       | Value          | Notes                                    |
| ---------------- | -------------- | ---------------------------------------- |
| Request weight   | 1200 / min     | Each endpoint has a weight (most = 1)    |
| Order rate       | 10 / sec       | Applies to order creation/cancellation   |
| Order rate       | 100,000 / day  | Hard daily cap                           |
| WebSocket conns  | 5 per IP       | Combined stream (`/stream?streams=...`)  |
| WS messages in   | 5 / sec        | Subscribe/unsubscribe messages           |

Check current usage via response headers:

- `X-MBX-USED-WEIGHT-1M` — weight consumed in current minute.
- `X-MBX-ORDER-COUNT-1S` — orders placed in current second.

When a limit is hit the API returns `429`. Back off exponentially.

---

## ccxt Integration

### Setup

```typescript
import ccxt from "ccxt";

const exchange = new ccxt.binance({
  apiKey: process.env.BINANCE_API_KEY,
  secret: process.env.BINANCE_SECRET,
  // Use testnet:
  // sandbox: true,
  options: {
    defaultType: "spot", // or "future" for USDT-M futures
  },
});
```

### Common Operations

```typescript
// Fetch ticker
const ticker = await exchange.fetchTicker("BTC/USDT");
console.log(ticker.last, ticker.bid, ticker.ask);

// Place a limit buy order
const order = await exchange.createOrder(
  "BTC/USDT", // symbol
  "limit",     // type
  "buy",       // side
  0.001,       // amount in BTC
  67000        // price in USDT
);

// Fetch balances
const balance = await exchange.fetchBalance();
console.log(balance.USDT.free, balance.BTC.free);

// Fetch OHLCV candles
const candles = await exchange.fetchOHLCV("BTC/USDT", "1h", undefined, 100);
// Each candle: [timestamp, open, high, low, close, volume]
```

### Error Handling

```typescript
try {
  await exchange.createOrder("BTC/USDT", "limit", "buy", 0.001, 67000);
} catch (e) {
  if (e instanceof ccxt.InsufficientFunds) {
    console.error("Not enough USDT balance");
  } else if (e instanceof ccxt.RateLimitExceeded) {
    console.error("Rate limited — back off");
  } else if (e instanceof ccxt.InvalidOrder) {
    console.error("Order rejected:", e.message);
  } else {
    throw e;
  }
}
```

---

## Code Examples

### TypeScript — Get Price and Place Order

```typescript
import ccxt from "ccxt";

async function main() {
  const exchange = new ccxt.binance({
    apiKey: process.env.BINANCE_API_KEY!,
    secret: process.env.BINANCE_SECRET!,
  });

  // 1. Get current price
  const ticker = await exchange.fetchTicker("ETH/USDT");
  const currentPrice = ticker.last!;
  console.log(`ETH/USDT price: ${currentPrice}`);

  // 2. Place a limit buy 2% below market
  const buyPrice = currentPrice * 0.98;
  const order = await exchange.createOrder(
    "ETH/USDT",
    "limit",
    "buy",
    0.05, // 0.05 ETH
    exchange.priceToPrecision("ETH/USDT", buyPrice)
  );
  console.log(`Order placed: ${order.id} at ${order.price}`);
}

main().catch(console.error);
```

### Python — Get Price and Place Order

```python
import ccxt
import os

exchange = ccxt.binance({
    "apiKey": os.environ["BINANCE_API_KEY"],
    "secret": os.environ["BINANCE_SECRET"],
})

# 1. Get current price
ticker = exchange.fetch_ticker("ETH/USDT")
current_price = ticker["last"]
print(f"ETH/USDT price: {current_price}")

# 2. Place limit buy 2% below market
buy_price = current_price * 0.98
order = exchange.create_order(
    symbol="ETH/USDT",
    type="limit",
    side="buy",
    amount=0.05,
    price=exchange.price_to_precision("ETH/USDT", buy_price),
)
print(f"Order placed: {order['id']} at {order['price']}")
```

### TypeScript — Stream Trades via WebSocket

```typescript
import WebSocket from "ws";

const ws = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@trade");

ws.on("message", (data: WebSocket.Data) => {
  const trade = JSON.parse(data.toString());
  console.log(
    `${trade.s} | price: ${trade.p} | qty: ${trade.q} | ${trade.m ? "SELL" : "BUY"}`
  );
});

ws.on("ping", () => ws.pong());

ws.on("error", (err) => {
  console.error("WebSocket error:", err.message);
});
```

### Python — Stream Trades via WebSocket

```python
import json
import websocket

def on_message(ws, message):
    trade = json.loads(message)
    side = "SELL" if trade["m"] else "BUY"
    print(f"{trade['s']} | price: {trade['p']} | qty: {trade['q']} | {side}")

def on_error(ws, error):
    print(f"Error: {error}")

ws = websocket.WebSocketApp(
    "wss://stream.binance.com:9443/ws/btcusdt@trade",
    on_message=on_message,
    on_error=on_error,
)
ws.run_forever()
```
