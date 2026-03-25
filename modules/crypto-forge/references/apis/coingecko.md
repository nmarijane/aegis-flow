# CoinGecko API Guide

## Base URL

| Tier | Base URL                               |
| ---- | -------------------------------------- |
| Free | `https://api.coingecko.com/api/v3`     |
| Pro  | `https://pro-api.coingecko.com/api/v3` |

Pro tier requires the `x-cg-pro-api-key` header or `?x_cg_pro_api_key=` query param.

Free tier requires the `x-cg-demo-api-key` header (since early 2024).

---

## Rate Limits

| Tier  | Limit           | Notes                               |
| ----- | --------------- | ----------------------------------- |
| Demo  | 30 calls / min  | Requires free API key               |
| Analyst | 500 calls / min | Paid plan                          |
| Lite  | 500 calls / min | Paid plan                           |
| Pro   | 1000 calls / min | Paid plan                          |

When rate-limited the API returns `429 Too Many Requests`. Implement exponential backoff with jitter.

---

## Endpoints

### Simple Price

Get current price for one or more coins in one or more currencies.

```
GET /simple/price?ids=bitcoin,ethereum&vs_currencies=usd,eur&include_24hr_change=true&include_market_cap=true
```

Response:

```json
{
  "bitcoin": {
    "usd": 67432.0,
    "eur": 62100.0,
    "usd_24h_change": 2.45,
    "usd_market_cap": 1327000000000
  },
  "ethereum": {
    "usd": 3521.0,
    "eur": 3243.0,
    "usd_24h_change": 1.12,
    "usd_market_cap": 423000000000
  }
}
```

Optional params: `include_24hr_vol`, `include_last_updated_at`, `precision`.

### Coin Detail

```
GET /coins/{id}?localization=false&tickers=false&community_data=false&developer_data=false
```

Returns comprehensive data: description, links, market data, image, genesis date, categories, platforms (contract addresses per chain).

### Market Chart (Historical)

```
GET /coins/{id}/market_chart?vs_currency=usd&days=30&interval=daily
```

- `days` — `1`, `7`, `14`, `30`, `90`, `180`, `365`, `max`.
- `interval` — `5m` (1 day only), `hourly` (up to 90 days), `daily`.

Response:

```json
{
  "prices": [[1705000000000, 67432.0], [1705086400000, 67891.0]],
  "market_caps": [[1705000000000, 1327000000000], ...],
  "total_volumes": [[1705000000000, 28000000000], ...]
}
```

Each entry is `[unix_timestamp_ms, value]`.

### Coins List

Get all supported coins (useful for building a local ID lookup cache).

```
GET /coins/list?include_platform=true
```

Response:

```json
[
  {
    "id": "bitcoin",
    "symbol": "btc",
    "name": "Bitcoin",
    "platforms": {}
  },
  {
    "id": "ethereum",
    "symbol": "eth",
    "name": "Ethereum",
    "platforms": {}
  },
  {
    "id": "usd-coin",
    "symbol": "usdc",
    "name": "USDC",
    "platforms": {
      "ethereum": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      "polygon-pos": "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
      "arbitrum-one": "0xaf88d065e77c8cc2239327c5edb3a432268e5831"
    }
  }
]
```

### Coin by Contract Address

Look up a coin using its on-chain contract address.

```
GET /coins/{platform_id}/contract/{contract_address}
```

Platform IDs: `ethereum`, `polygon-pos`, `arbitrum-one`, `base`, `binance-smart-chain`, `optimistic-ethereum`.

Example:

```
GET /coins/ethereum/contract/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
```

Returns the same structure as `/coins/{id}`.

### Market Chart by Contract

```
GET /coins/{platform_id}/contract/{contract_address}/market_chart?vs_currency=usd&days=30
```

---

## Token ID Mapping

CoinGecko uses string IDs (e.g., `bitcoin`, `ethereum`, `usd-coin`) that do not always match the ticker symbol.

### Strategy 1: Local Cache

Fetch `/coins/list` once and cache locally. Search by `symbol` or `name`.

```typescript
interface CoinListEntry {
  id: string;
  symbol: string;
  name: string;
  platforms: Record<string, string>;
}

let coinListCache: CoinListEntry[] | null = null;

async function getCoinList(apiKey: string): Promise<CoinListEntry[]> {
  if (coinListCache) return coinListCache;

  const res = await fetch(
    "https://api.coingecko.com/api/v3/coins/list?include_platform=true",
    { headers: { "x-cg-demo-api-key": apiKey } }
  );
  coinListCache = await res.json();
  return coinListCache!;
}

async function findCoinId(symbol: string, apiKey: string): Promise<string | undefined> {
  const list = await getCoinList(apiKey);
  const match = list.find(
    (c) => c.symbol.toLowerCase() === symbol.toLowerCase()
  );
  return match?.id;
}
```

### Strategy 2: Contract Address Lookup

When you have the on-chain address, use the contract endpoint directly. This is the most reliable method for ERC-20 tokens.

```typescript
async function getCoinByContract(
  chain: string,
  address: string,
  apiKey: string
): Promise<any> {
  const res = await fetch(
    `https://api.coingecko.com/api/v3/coins/${chain}/contract/${address}`,
    { headers: { "x-cg-demo-api-key": apiKey } }
  );
  if (!res.ok) throw new Error(`CoinGecko: ${res.status}`);
  return res.json();
}
```

---

## Code Examples

### TypeScript — Fetch Price

```typescript
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY!;
const BASE_URL = "https://api.coingecko.com/api/v3";

interface PriceResponse {
  [coinId: string]: {
    usd: number;
    usd_24h_change?: number;
    usd_market_cap?: number;
  };
}

async function getPrice(coinIds: string[]): Promise<PriceResponse> {
  const ids = coinIds.join(",");
  const url = `${BASE_URL}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`;

  const res = await fetch(url, {
    headers: { "x-cg-demo-api-key": COINGECKO_API_KEY },
  });

  if (!res.ok) {
    if (res.status === 429) {
      throw new Error("Rate limited — back off and retry");
    }
    throw new Error(`CoinGecko API error: ${res.status}`);
  }

  return res.json();
}

// Usage
const prices = await getPrice(["bitcoin", "ethereum", "solana"]);
console.log(`BTC: $${prices.bitcoin.usd} (${prices.bitcoin.usd_24h_change?.toFixed(2)}%)`);
console.log(`ETH: $${prices.ethereum.usd}`);
console.log(`SOL: $${prices.solana.usd}`);
```

### TypeScript — Historical Data

```typescript
interface MarketChartResponse {
  prices: [number, number][];
  market_caps: [number, number][];
  total_volumes: [number, number][];
}

async function getHistoricalPrices(
  coinId: string,
  days: number | "max",
  interval: "5m" | "hourly" | "daily" = "daily"
): Promise<MarketChartResponse> {
  const url = `${BASE_URL}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=${interval}`;

  const res = await fetch(url, {
    headers: { "x-cg-demo-api-key": COINGECKO_API_KEY },
  });

  if (!res.ok) throw new Error(`CoinGecko API error: ${res.status}`);
  return res.json();
}

// Usage — get 30 days of daily BTC prices
const chart = await getHistoricalPrices("bitcoin", 30);
for (const [timestamp, price] of chart.prices) {
  const date = new Date(timestamp).toISOString().split("T")[0];
  console.log(`${date}: $${price.toFixed(2)}`);
}
```

### TypeScript — Market Cap Rankings

```typescript
interface CoinMarket {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  price_change_percentage_24h: number;
}

async function getTopCoins(limit: number = 20): Promise<CoinMarket[]> {
  const url = `${BASE_URL}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false`;

  const res = await fetch(url, {
    headers: { "x-cg-demo-api-key": COINGECKO_API_KEY },
  });

  if (!res.ok) throw new Error(`CoinGecko API error: ${res.status}`);
  return res.json();
}

const top = await getTopCoins(10);
for (const coin of top) {
  console.log(
    `#${coin.market_cap_rank} ${coin.symbol.toUpperCase()} — $${coin.current_price} (${coin.price_change_percentage_24h.toFixed(2)}%)`
  );
}
```

### Python — Fetch Price

```python
import os
import requests

API_KEY = os.environ["COINGECKO_API_KEY"]
BASE_URL = "https://api.coingecko.com/api/v3"
HEADERS = {"x-cg-demo-api-key": API_KEY}


def get_price(coin_ids: list[str]) -> dict:
    resp = requests.get(
        f"{BASE_URL}/simple/price",
        params={
            "ids": ",".join(coin_ids),
            "vs_currencies": "usd",
            "include_24hr_change": "true",
            "include_market_cap": "true",
        },
        headers=HEADERS,
    )
    resp.raise_for_status()
    return resp.json()


prices = get_price(["bitcoin", "ethereum", "solana"])
for coin_id, data in prices.items():
    change = data.get("usd_24h_change", 0)
    print(f"{coin_id}: ${data['usd']:,.2f} ({change:+.2f}%)")
```

### Python — Historical Data

```python
def get_historical(coin_id: str, days: int = 30, interval: str = "daily") -> dict:
    resp = requests.get(
        f"{BASE_URL}/coins/{coin_id}/market_chart",
        params={
            "vs_currency": "usd",
            "days": days,
            "interval": interval,
        },
        headers=HEADERS,
    )
    resp.raise_for_status()
    return resp.json()


chart = get_historical("bitcoin", days=30)
for timestamp_ms, price in chart["prices"]:
    from datetime import datetime
    date = datetime.fromtimestamp(timestamp_ms / 1000).strftime("%Y-%m-%d")
    print(f"{date}: ${price:,.2f}")
```

### Python — Contract Address Lookup

```python
def get_coin_by_contract(platform: str, address: str) -> dict:
    """Look up a token on CoinGecko by its on-chain contract address.

    Platform IDs: ethereum, polygon-pos, arbitrum-one, base,
    binance-smart-chain, optimistic-ethereum.
    """
    resp = requests.get(
        f"{BASE_URL}/coins/{platform}/contract/{address}",
        headers=HEADERS,
    )
    resp.raise_for_status()
    return resp.json()


# Look up USDC on Ethereum
usdc = get_coin_by_contract("ethereum", "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48")
print(f"{usdc['name']} ({usdc['symbol'].upper()})")
print(f"Price: ${usdc['market_data']['current_price']['usd']}")
print(f"Market cap rank: #{usdc['market_cap_rank']}")
```
