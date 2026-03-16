# Coinbase Advanced Trade API Guide

## Authentication

### API Key + Secret (Legacy)

Coinbase Pro / Advanced Trade legacy auth uses `CB-ACCESS-KEY`, `CB-ACCESS-SIGN`, `CB-ACCESS-TIMESTAMP`, and `CB-ACCESS-PASSPHRASE` headers.

### JWT-Based Auth (Advanced Trade — Current)

Advanced Trade uses **Cloud API keys** that generate short-lived JWTs.

1. Create an API key at https://www.coinbase.com/settings/api (select "Advanced Trade" permissions).
2. You receive a **key name** (`organizations/{org_id}/apiKeys/{key_id}`) and a **private key** (EC PEM).

```typescript
import jwt from "jsonwebtoken";
import crypto from "crypto";

function buildJwt(
  keyName: string,
  privateKey: string,
  method: string,
  path: string
): string {
  const now = Math.floor(Date.now() / 1000);
  const uri = `${method} ${path}`;

  const payload = {
    sub: keyName,
    iss: "cdp",
    aud: ["retail_rest_api_proxy"],
    nbf: now,
    exp: now + 120,
    uris: [uri],
  };

  const header = {
    alg: "ES256",
    kid: keyName,
    nonce: crypto.randomBytes(16).toString("hex"),
    typ: "JWT",
  };

  return jwt.sign(payload, privateKey, {
    algorithm: "ES256",
    header,
  });
}
```

Attach the token as `Authorization: Bearer <jwt>` on every request.

---

## REST Endpoints

### Base URL

```
https://api.coinbase.com
```

### List Accounts

```
GET /api/v3/brokerage/accounts
```

Response includes `uuid`, `name`, `currency`, `available_balance`, `hold`.

### List Products (Markets)

```
GET /api/v3/brokerage/products
```

Returns all trading pairs with `product_id`, `price`, `quote_min_size`, `base_min_size`.

### Get Product Candles

```
GET /api/v3/brokerage/products/{product_id}/candles?start={unix}&end={unix}&granularity=ONE_HOUR
```

Granularity options: `ONE_MINUTE`, `FIVE_MINUTE`, `FIFTEEN_MINUTE`, `THIRTY_MINUTE`, `ONE_HOUR`, `TWO_HOUR`, `SIX_HOUR`, `ONE_DAY`.

### Place Order

```
POST /api/v3/brokerage/orders
```

Body:

```json
{
  "client_order_id": "uuid-string",
  "product_id": "BTC-USD",
  "side": "BUY",
  "order_configuration": {
    "limit_limit_gtc": {
      "base_size": "0.001",
      "limit_price": "67000",
      "post_only": false
    }
  }
}
```

Order types: `limit_limit_gtc`, `limit_limit_gtd`, `limit_limit_fok`, `market_market_ioc`, `stop_limit_stop_limit_gtc`, `stop_limit_stop_limit_gtd`.

### List Orders

```
GET /api/v3/brokerage/orders/historical/batch?product_id=BTC-USD&order_status=OPEN
```

### Get Market Data (Best Bid/Ask)

```
GET /api/v3/brokerage/best_bid_ask?product_ids=BTC-USD&product_ids=ETH-USD
```

---

## WebSocket

### Endpoint

```
wss://advanced-trade-ws.coinbase.com
```

### Subscribe

Send a JSON message after connecting:

```json
{
  "type": "subscribe",
  "product_ids": ["BTC-USD", "ETH-USD"],
  "channel": "market_trades",
  "jwt": "<your-jwt>",
  "timestamp": "1234567890"
}
```

### Channels

| Channel         | Description                          | Auth Required |
| --------------- | ------------------------------------ | ------------- |
| `market_trades` | Real-time trades                     | No            |
| `level2`        | Order book updates (diff)            | No            |
| `ticker`        | Price ticker updates                 | No            |
| `ticker_batch`  | Batched ticker (less frequent)       | No            |
| `candles`       | OHLCV candle updates                 | No            |
| `user`          | Order fills, account updates         | Yes           |
| `heartbeats`    | Connection keepalive                 | No            |

### Heartbeat

Subscribe to the `heartbeats` channel. If no heartbeat is received within 5 seconds, reconnect.

---

## Rate Limits

| Tier         | Requests / sec |
| ------------ | -------------- |
| Free         | 10             |
| Advanced     | 30             |
| Rate headers | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` |

The API returns `429 Too Many Requests` when exceeded. Implement exponential backoff.

---

## ccxt Integration

### Setup

```typescript
import ccxt from "ccxt";

const exchange = new ccxt.coinbase({
  apiKey: process.env.COINBASE_API_KEY!,    // key name
  secret: process.env.COINBASE_PRIVATE_KEY!, // PEM private key
});
```

### Common Operations

```typescript
// Fetch ticker
const ticker = await exchange.fetchTicker("BTC/USD");
console.log(`BTC/USD: ${ticker.last}`);

// Fetch order book
const book = await exchange.fetchOrderBook("BTC/USD", 10);
console.log(`Best bid: ${book.bids[0][0]}, Best ask: ${book.asks[0][0]}`);

// Place limit order
const order = await exchange.createOrder(
  "BTC/USD",
  "limit",
  "buy",
  0.001,
  67000
);
console.log(`Order ID: ${order.id}`);

// Fetch balances
const balance = await exchange.fetchBalance();
console.log(`USD: ${balance.USD.free}, BTC: ${balance.BTC.free}`);

// Fetch OHLCV
const candles = await exchange.fetchOHLCV("BTC/USD", "1h", undefined, 100);
```

### Error Handling

```typescript
try {
  await exchange.createOrder("BTC/USD", "limit", "buy", 0.001, 67000);
} catch (e) {
  if (e instanceof ccxt.InsufficientFunds) {
    console.error("Not enough USD");
  } else if (e instanceof ccxt.InvalidOrder) {
    console.error("Invalid order params:", e.message);
  } else if (e instanceof ccxt.AuthenticationError) {
    console.error("Bad credentials or expired JWT");
  } else {
    throw e;
  }
}
```

---

## Code Examples

### TypeScript — Fetch Price and Place Order

```typescript
import ccxt from "ccxt";

async function main() {
  const exchange = new ccxt.coinbase({
    apiKey: process.env.COINBASE_API_KEY!,
    secret: process.env.COINBASE_PRIVATE_KEY!,
  });

  // Get current price
  const ticker = await exchange.fetchTicker("ETH/USD");
  console.log(`ETH/USD: ${ticker.last}`);

  // Place a limit buy 1.5% below market
  const buyPrice = ticker.last! * 0.985;
  const order = await exchange.createOrder(
    "ETH/USD",
    "limit",
    "buy",
    0.05,
    exchange.priceToPrecision("ETH/USD", buyPrice)
  );
  console.log(`Order ${order.id} placed at ${order.price}`);
}

main().catch(console.error);
```

### Python — Fetch Price and Place Order

```python
import ccxt
import os

exchange = ccxt.coinbase({
    "apiKey": os.environ["COINBASE_API_KEY"],
    "secret": os.environ["COINBASE_PRIVATE_KEY"],
})

# Get current price
ticker = exchange.fetch_ticker("ETH/USD")
print(f"ETH/USD: {ticker['last']}")

# Place a limit buy 1.5% below market
buy_price = ticker["last"] * 0.985
order = exchange.create_order(
    symbol="ETH/USD",
    type="limit",
    side="buy",
    amount=0.05,
    price=exchange.price_to_precision("ETH/USD", buy_price),
)
print(f"Order {order['id']} placed at {order['price']}")
```

### TypeScript — WebSocket Market Trades

```typescript
import WebSocket from "ws";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const keyName = process.env.COINBASE_API_KEY!;
const privateKey = process.env.COINBASE_PRIVATE_KEY!;

function buildWsJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: keyName,
      iss: "cdp",
      aud: ["retail_rest_api_proxy"],
      nbf: now,
      exp: now + 120,
    },
    privateKey,
    {
      algorithm: "ES256",
      header: {
        alg: "ES256",
        kid: keyName,
        nonce: crypto.randomBytes(16).toString("hex"),
        typ: "JWT",
      },
    }
  );
}

const ws = new WebSocket("wss://advanced-trade-ws.coinbase.com");

ws.on("open", () => {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  ws.send(
    JSON.stringify({
      type: "subscribe",
      product_ids: ["BTC-USD"],
      channel: "market_trades",
      jwt: buildWsJwt(),
      timestamp,
    })
  );
});

ws.on("message", (data: WebSocket.Data) => {
  const msg = JSON.parse(data.toString());
  if (msg.channel === "market_trades" && msg.events) {
    for (const event of msg.events) {
      for (const trade of event.trades || []) {
        console.log(
          `${trade.product_id} | ${trade.side} | ${trade.price} x ${trade.size}`
        );
      }
    }
  }
});
```

### Python — WebSocket Market Trades

```python
import json
import time
import os
import jwt as pyjwt
import secrets
import websocket

KEY_NAME = os.environ["COINBASE_API_KEY"]
PRIVATE_KEY = os.environ["COINBASE_PRIVATE_KEY"]


def build_ws_jwt() -> str:
    now = int(time.time())
    payload = {
        "sub": KEY_NAME,
        "iss": "cdp",
        "aud": ["retail_rest_api_proxy"],
        "nbf": now,
        "exp": now + 120,
    }
    headers = {
        "kid": KEY_NAME,
        "nonce": secrets.token_hex(16),
        "typ": "JWT",
    }
    return pyjwt.encode(payload, PRIVATE_KEY, algorithm="ES256", headers=headers)


def on_open(ws):
    ws.send(json.dumps({
        "type": "subscribe",
        "product_ids": ["BTC-USD"],
        "channel": "market_trades",
        "jwt": build_ws_jwt(),
        "timestamp": str(int(time.time())),
    }))


def on_message(ws, message):
    msg = json.loads(message)
    if msg.get("channel") == "market_trades":
        for event in msg.get("events", []):
            for trade in event.get("trades", []):
                print(f"{trade['product_id']} | {trade['side']} | {trade['price']} x {trade['size']}")


ws = websocket.WebSocketApp(
    "wss://advanced-trade-ws.coinbase.com",
    on_open=on_open,
    on_message=on_message,
)
ws.run_forever()
```
