# Market Making Patterns

## Grid Strategy

### Price Grid Calculation

A grid bot places buy orders below the current price and sell orders above it at fixed intervals. When a buy order fills, a new sell order is placed one grid level above (and vice versa).

```typescript
interface GridConfig {
  symbol: string;
  lowerPrice: number;
  upperPrice: number;
  gridCount: number;       // number of grid levels
  totalInvestment: number;  // total USD to allocate
  arithmeticGrid: boolean;  // true = equal spacing, false = geometric (% spacing)
}

function calculateGridLevels(config: GridConfig): number[] {
  const levels: number[] = [];

  if (config.arithmeticGrid) {
    const step = (config.upperPrice - config.lowerPrice) / config.gridCount;
    for (let i = 0; i <= config.gridCount; i++) {
      levels.push(config.lowerPrice + step * i);
    }
  } else {
    // Geometric grid — equal percentage between levels
    const ratio = Math.pow(
      config.upperPrice / config.lowerPrice,
      1 / config.gridCount
    );
    for (let i = 0; i <= config.gridCount; i++) {
      levels.push(config.lowerPrice * Math.pow(ratio, i));
    }
  }

  return levels;
}

// Example: ETH/USDT grid from $2,800 to $3,200 with 10 levels
const levels = calculateGridLevels({
  symbol: "ETH/USDT",
  lowerPrice: 2800,
  upperPrice: 3200,
  gridCount: 10,
  totalInvestment: 10000,
  arithmeticGrid: true,
});
// => [2800, 2840, 2880, 2920, 2960, 3000, 3040, 3080, 3120, 3160, 3200]
```

### Order Placement

```typescript
import ccxt from "ccxt";

interface GridOrder {
  level: number;
  side: "buy" | "sell";
  amount: number;
  orderId?: string;
}

async function placeGridOrders(
  exchange: ccxt.Exchange,
  symbol: string,
  levels: number[],
  currentPrice: number,
  amountPerGrid: number
): Promise<GridOrder[]> {
  const orders: GridOrder[] = [];

  for (const level of levels) {
    const side = level < currentPrice ? "buy" : "sell";

    try {
      const order = await exchange.createOrder(
        symbol,
        "limit",
        side,
        amountPerGrid,
        exchange.priceToPrecision(symbol, level)
      );

      orders.push({
        level,
        side,
        amount: amountPerGrid,
        orderId: order.id,
      });
    } catch (err) {
      console.error(`Failed to place ${side} at ${level}:`, err);
    }
  }

  return orders;
}
```

### Rebalancing Logic

When a grid order fills, place a counter-order on the opposite side at the adjacent grid level.

```typescript
async function handleFill(
  exchange: ccxt.Exchange,
  symbol: string,
  filledOrder: GridOrder,
  levels: number[],
  amountPerGrid: number
): Promise<GridOrder | null> {
  const idx = levels.indexOf(filledOrder.level);
  if (idx === -1) return null;

  // If a buy filled, place a sell one level above
  // If a sell filled, place a buy one level below
  const counterIdx = filledOrder.side === "buy" ? idx + 1 : idx - 1;
  if (counterIdx < 0 || counterIdx >= levels.length) return null;

  const counterSide = filledOrder.side === "buy" ? "sell" : "buy";
  const counterPrice = levels[counterIdx];

  const order = await exchange.createOrder(
    symbol,
    "limit",
    counterSide,
    amountPerGrid,
    exchange.priceToPrecision(symbol, counterPrice)
  );

  return {
    level: counterPrice,
    side: counterSide,
    amount: amountPerGrid,
    orderId: order.id,
  };
}
```

---

## Spread Management

### Dynamic Spread Based on Volatility

Wider spreads during volatile markets protect against adverse selection. Narrow spreads during calm markets capture more trades.

```typescript
interface SpreadConfig {
  baseSpreadBps: number;   // e.g. 10 bps = 0.10%
  volatilityWindow: number; // lookback candles
  volatilityMultiplier: number; // how much to widen per unit of vol
  minSpreadBps: number;
  maxSpreadBps: number;
}

function calculateDynamicSpread(
  recentPrices: number[],
  config: SpreadConfig
): { bidSpreadBps: number; askSpreadBps: number } {
  // Calculate rolling standard deviation
  const mean = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
  const variance =
    recentPrices.reduce((sum, p) => sum + (p - mean) ** 2, 0) /
    recentPrices.length;
  const stdDev = Math.sqrt(variance);
  const volatility = (stdDev / mean) * 10000; // in bps

  let spreadBps =
    config.baseSpreadBps + volatility * config.volatilityMultiplier;
  spreadBps = Math.max(config.minSpreadBps, Math.min(config.maxSpreadBps, spreadBps));

  return {
    bidSpreadBps: spreadBps,
    askSpreadBps: spreadBps,
  };
}

// Example usage
const spread = calculateDynamicSpread(
  [3000, 3010, 2995, 3020, 2985, 3015, 2990],
  {
    baseSpreadBps: 10,
    volatilityWindow: 20,
    volatilityMultiplier: 0.5,
    minSpreadBps: 5,
    maxSpreadBps: 100,
  }
);
```

### Inventory Skew

When the maker accumulates too much of one token, skew the spread to encourage trades that reduce inventory.

```typescript
function skewSpread(
  midPrice: number,
  bidSpreadBps: number,
  askSpreadBps: number,
  inventoryRatio: number // 0 = all in quote, 1 = all in base
): { bidPrice: number; askPrice: number } {
  // Neutral inventory = 0.5. Skew toward selling if > 0.5, buying if < 0.5
  const skewBps = (inventoryRatio - 0.5) * 20; // +-10 bps at extremes

  const adjustedBidBps = bidSpreadBps + skewBps;  // wider bid when long
  const adjustedAskBps = askSpreadBps - skewBps;  // tighter ask when long

  return {
    bidPrice: midPrice * (1 - adjustedBidBps / 10000),
    askPrice: midPrice * (1 + adjustedAskBps / 10000),
  };
}
```

---

## Order Management

### Order Lifecycle

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  PENDING  │───>│   OPEN   │───>│  FILLED  │───>│  SETTLED │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                     │               │
                     │          ┌──────────┐
                     │─────────>│ PARTIALLY │
                     │          │  FILLED   │
                     │          └──────────┘
                     │
                ┌──────────┐
                │ CANCELLED │
                └──────────┘
```

### Order Manager Class

```typescript
import ccxt from "ccxt";

interface ManagedOrder {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  price: number;
  amount: number;
  filled: number;
  status: "open" | "partially_filled" | "filled" | "cancelled";
  createdAt: number;
}

class OrderManager {
  private orders = new Map<string, ManagedOrder>();
  private exchange: ccxt.Exchange;

  constructor(exchange: ccxt.Exchange) {
    this.exchange = exchange;
  }

  async placeOrder(
    symbol: string,
    side: "buy" | "sell",
    amount: number,
    price: number
  ): Promise<ManagedOrder> {
    const order = await this.exchange.createOrder(
      symbol, "limit", side, amount, price
    );

    const managed: ManagedOrder = {
      id: order.id,
      symbol,
      side,
      price,
      amount,
      filled: 0,
      status: "open",
      createdAt: Date.now(),
    };

    this.orders.set(order.id, managed);
    return managed;
  }

  async cancelOrder(id: string): Promise<void> {
    const managed = this.orders.get(id);
    if (!managed || managed.status === "filled") return;

    await this.exchange.cancelOrder(id, managed.symbol);
    managed.status = "cancelled";
  }

  async cancelAll(symbol: string): Promise<void> {
    const openOrders = [...this.orders.values()].filter(
      (o) => o.symbol === symbol && (o.status === "open" || o.status === "partially_filled")
    );

    await Promise.allSettled(
      openOrders.map((o) => this.cancelOrder(o.id))
    );
  }

  async syncOrderStatuses(symbol: string): Promise<void> {
    const openOrders = await this.exchange.fetchOpenOrders(symbol);
    const openIds = new Set(openOrders.map((o) => o.id));

    for (const [id, managed] of this.orders) {
      if (managed.symbol !== symbol) continue;
      if (managed.status === "filled" || managed.status === "cancelled") continue;

      if (!openIds.has(id)) {
        // Order no longer open — check if filled or cancelled
        try {
          const fetched = await this.exchange.fetchOrder(id, symbol);
          managed.filled = fetched.filled ?? managed.filled;
          managed.status = fetched.filled === managed.amount ? "filled" : "cancelled";
        } catch {
          managed.status = "cancelled";
        }
      }
    }
  }

  getOpenOrders(symbol: string): ManagedOrder[] {
    return [...this.orders.values()].filter(
      (o) => o.symbol === symbol && (o.status === "open" || o.status === "partially_filled")
    );
  }
}
```

### Partial Fills Handling

```typescript
async function handlePartialFill(
  exchange: ccxt.Exchange,
  order: ManagedOrder
): Promise<void> {
  const fetched = await exchange.fetchOrder(order.id, order.symbol);
  const remaining = order.amount - (fetched.filled ?? 0);

  if (remaining > 0 && remaining < order.amount * 0.1) {
    // Less than 10% remaining — cancel and consider it filled
    await exchange.cancelOrder(order.id, order.symbol);
    order.status = "filled";
    order.filled = fetched.filled ?? 0;
  }
}
```

---

## Inventory Risk

### Delta-Neutral Strategy

Hedge spot exposure with a perpetual futures short position.

```typescript
interface Position {
  spotAmount: number;   // e.g. 1.5 ETH held on spot
  futuresAmount: number; // e.g. -1.5 ETH short on perps
  netDelta: number;      // should be near 0
}

async function maintainDeltaNeutral(
  spotExchange: ccxt.Exchange,
  futuresExchange: ccxt.Exchange,
  symbol: string,
  spotBalance: number
): Promise<void> {
  // Get current perp position
  const positions = await futuresExchange.fetchPositions([symbol]);
  const perpSize = positions[0]?.contracts ?? 0;
  const perpSide = positions[0]?.side; // "long" or "short"

  const currentShort = perpSide === "short" ? perpSize : -perpSize;
  const targetShort = spotBalance;
  const delta = targetShort - currentShort;

  if (Math.abs(delta) < 0.01) return; // close enough

  if (delta > 0) {
    // Need to short more
    await futuresExchange.createOrder(symbol, "market", "sell", delta);
  } else {
    // Need to reduce short
    await futuresExchange.createOrder(symbol, "market", "buy", Math.abs(delta));
  }
}
```

### Position Limits

```typescript
interface RiskLimits {
  maxPositionUsd: number;       // max notional value per asset
  maxTotalExposureUsd: number;  // max total across all assets
  maxDrawdownPct: number;       // stop-loss if PnL drops below
  maxInventoryImbalance: number; // 0-1, max ratio of base to total
}

function checkRiskLimits(
  positionUsd: number,
  totalExposureUsd: number,
  pnlPct: number,
  inventoryRatio: number,
  limits: RiskLimits
): { allowed: boolean; reason?: string } {
  if (positionUsd > limits.maxPositionUsd) {
    return { allowed: false, reason: `Position $${positionUsd} exceeds max $${limits.maxPositionUsd}` };
  }
  if (totalExposureUsd > limits.maxTotalExposureUsd) {
    return { allowed: false, reason: `Total exposure $${totalExposureUsd} exceeds max` };
  }
  if (pnlPct < -limits.maxDrawdownPct) {
    return { allowed: false, reason: `Drawdown ${pnlPct}% exceeds limit` };
  }
  if (inventoryRatio > limits.maxInventoryImbalance) {
    return { allowed: false, reason: `Inventory imbalance ${inventoryRatio} exceeds max` };
  }
  return { allowed: true };
}
```

---

## CEX Market Making

### Order Book Interaction

```typescript
import ccxt from "ccxt";

async function getOrderBookMidPrice(
  exchange: ccxt.Exchange,
  symbol: string
): Promise<{ mid: number; bestBid: number; bestAsk: number; spread: number }> {
  const book = await exchange.fetchOrderBook(symbol, 5);
  const bestBid = book.bids[0][0];
  const bestAsk = book.asks[0][0];
  const mid = (bestBid + bestAsk) / 2;
  const spread = (bestAsk - bestBid) / mid * 10000; // in bps

  return { mid, bestBid, bestAsk, spread };
}

async function placeQuotes(
  exchange: ccxt.Exchange,
  symbol: string,
  midPrice: number,
  spreadBps: number,
  amount: number
): Promise<{ bid: ccxt.Order; ask: ccxt.Order }> {
  const halfSpread = spreadBps / 2 / 10000;
  const bidPrice = midPrice * (1 - halfSpread);
  const askPrice = midPrice * (1 + halfSpread);

  const [bid, ask] = await Promise.all([
    exchange.createOrder(
      symbol, "limit", "buy", amount,
      exchange.priceToPrecision(symbol, bidPrice),
      { postOnly: true } // ensure maker fee
    ),
    exchange.createOrder(
      symbol, "limit", "sell", amount,
      exchange.priceToPrecision(symbol, askPrice),
      { postOnly: true }
    ),
  ]);

  return { bid, ask };
}
```

### Maker/Taker Fees Optimization

Always use `postOnly` orders to guarantee maker fees. Common fee tiers:

| Exchange | Maker | Taker | VIP Maker |
| --- | --- | --- | --- |
| Binance | 0.10% | 0.10% | 0.02% |
| Coinbase | 0.40% | 0.60% | 0.00% |
| Kraken | 0.16% | 0.26% | 0.00% |
| OKX | 0.08% | 0.10% | -0.005% |

**Post-only** orders are rejected if they would match immediately (rather than becoming taker orders). This guarantees maker fee tier.

---

## DEX Market Making

### Concentrated Liquidity (Uniswap V3)

Provide liquidity in a specific price range for higher capital efficiency.

```typescript
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  encodeFunctionData,
} from "viem";
import { mainnet } from "viem/chains";

// Uniswap V3 NonfungiblePositionManager
const POSITION_MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88" as const;

const POSITION_MANAGER_ABI = parseAbi([
  "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function increaseLiquidity((uint256 tokenId, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) external payable returns (uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function decreaseLiquidity((uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) external payable returns (uint256 amount0, uint256 amount1)",
  "function collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max)) external payable returns (uint256 amount0, uint256 amount1)",
]);

// Convert a price to its nearest valid tick for a given fee tier
function priceToTick(price: number, tickSpacing: number): number {
  const tick = Math.floor(Math.log(price) / Math.log(1.0001));
  return Math.round(tick / tickSpacing) * tickSpacing;
}

// Fee tiers and their tick spacing
// 0.01% -> tickSpacing = 1
// 0.05% -> tickSpacing = 10
// 0.30% -> tickSpacing = 60
// 1.00% -> tickSpacing = 200

interface V3PositionParams {
  token0: `0x${string}`;
  token1: `0x${string}`;
  fee: 100 | 500 | 3000 | 10000;
  lowerPrice: number;
  upperPrice: number;
  amount0: bigint;
  amount1: bigint;
}

function buildMintCalldata(params: V3PositionParams, recipient: `0x${string}`) {
  const tickSpacing = { 100: 1, 500: 10, 3000: 60, 10000: 200 }[params.fee];

  return encodeFunctionData({
    abi: POSITION_MANAGER_ABI,
    functionName: "mint",
    args: [
      {
        token0: params.token0,
        token1: params.token1,
        fee: params.fee,
        tickLower: priceToTick(params.lowerPrice, tickSpacing),
        tickUpper: priceToTick(params.upperPrice, tickSpacing),
        amount0Desired: params.amount0,
        amount1Desired: params.amount1,
        amount0Min: 0n,
        amount1Min: 0n,
        recipient,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 600),
      },
    ],
  });
}
```

### LP Position Management

Strategy: continuously rebalance the position range around the current price.

```typescript
interface LPStrategy {
  tokenId: bigint | null;       // current position NFT ID (null if no position)
  rangeWidthPct: number;         // e.g. 5 = +/- 5% from current price
  rebalanceThresholdPct: number; // rebalance when price moves this far from range center
}

async function shouldRebalance(
  currentPrice: number,
  rangeLower: number,
  rangeUpper: number,
  threshold: number
): Promise<boolean> {
  const center = (rangeLower + rangeUpper) / 2;
  const deviation = Math.abs(currentPrice - center) / center * 100;
  return deviation > threshold;
}

// Rebalance workflow:
// 1. decreaseLiquidity() — remove all liquidity from current position
// 2. collect() — collect the tokens + earned fees
// 3. Swap tokens to achieve desired ratio for new range
// 4. mint() — create new position centered around current price
```

### Impermanent Loss Calculation

```typescript
function calculateImpermanentLoss(
  priceRatio: number // currentPrice / entryPrice (e.g. 1.5 for 50% increase)
): number {
  // IL formula: IL = 2 * sqrt(r) / (1 + r) - 1
  const il = (2 * Math.sqrt(priceRatio)) / (1 + priceRatio) - 1;
  return il; // negative value represents loss
}

// Examples:
// priceRatio = 1.25 (25% up)  -> IL = -0.6%
// priceRatio = 1.50 (50% up)  -> IL = -2.0%
// priceRatio = 2.00 (100% up) -> IL = -5.7%
// priceRatio = 3.00 (200% up) -> IL = -13.4%
// priceRatio = 5.00 (400% up) -> IL = -25.5%
```
