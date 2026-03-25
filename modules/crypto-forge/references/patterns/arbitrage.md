# Arbitrage Patterns

## DEX-to-DEX Arbitrage

### Price Monitoring

Poll multiple DEX pools for the same token pair and compute the spread.

```typescript
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });

const UNISWAP_V2_PAIR_ABI = parseAbi([
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);

interface PoolPrice {
  dex: string;
  pairAddress: `0x${string}`;
  priceAinB: number;
  priceBinA: number;
  reserve0: bigint;
  reserve1: bigint;
}

async function getV2PoolPrice(
  dex: string,
  pairAddress: `0x${string}`,
  decimals0: number,
  decimals1: number
): Promise<PoolPrice> {
  const [reserve0, reserve1] = await client.readContract({
    address: pairAddress,
    abi: UNISWAP_V2_PAIR_ABI,
    functionName: "getReserves",
  }) as [bigint, bigint, number];

  const r0 = Number(formatUnits(reserve0, decimals0));
  const r1 = Number(formatUnits(reserve1, decimals1));

  return {
    dex,
    pairAddress,
    priceAinB: r1 / r0, // price of token0 in terms of token1
    priceBinA: r0 / r1,
    reserve0,
    reserve1,
  };
}

async function findDexDexArb(
  pools: { dex: string; pair: `0x${string}`; dec0: number; dec1: number }[]
): Promise<{ buyOn: string; sellOn: string; spreadPct: number } | null> {
  const prices = await Promise.all(
    pools.map((p) => getV2PoolPrice(p.dex, p.pair, p.dec0, p.dec1))
  );

  let best: { buyOn: string; sellOn: string; spreadPct: number } | null = null;

  for (let i = 0; i < prices.length; i++) {
    for (let j = i + 1; j < prices.length; j++) {
      // Buy where price is low, sell where price is high
      const [low, high] =
        prices[i].priceAinB < prices[j].priceAinB
          ? [prices[i], prices[j]]
          : [prices[j], prices[i]];

      const spreadPct =
        ((high.priceAinB - low.priceAinB) / low.priceAinB) * 100;

      if (!best || spreadPct > best.spreadPct) {
        best = { buyOn: low.dex, sellOn: high.dex, spreadPct };
      }
    }
  }

  return best;
}
```

### Atomic Execution via Smart Contract

Execute a buy-sell in a single transaction so the arb is risk-free (reverts if unprofitable).

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract DexDexArbitrage {
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice Buy tokenB on routerA, sell tokenB on routerB, keep profit in tokenA.
    /// @param amountIn  Amount of tokenA to spend on routerA.
    /// @param minProfit  Minimum profit in tokenA after the round-trip; reverts if not met.
    function executeDexDexArb(
        address routerA,
        address routerB,
        address tokenA,
        address tokenB,
        uint256 amountIn,
        uint256 minProfit
    ) external onlyOwner {
        // Transfer tokenA in from owner
        IERC20(tokenA).transferFrom(msg.sender, address(this), amountIn);

        // Step 1 — buy tokenB on routerA
        IERC20(tokenA).approve(routerA, amountIn);
        address[] memory pathBuy = new address[](2);
        pathBuy[0] = tokenA;
        pathBuy[1] = tokenB;

        uint256[] memory amountsBuy = IUniswapV2Router02(routerA)
            .swapExactTokensForTokens(
                amountIn,
                0, // accept any amount of tokenB
                pathBuy,
                address(this),
                block.timestamp
            );

        uint256 tokenBReceived = amountsBuy[amountsBuy.length - 1];

        // Step 2 — sell tokenB on routerB
        IERC20(tokenB).approve(routerB, tokenBReceived);
        address[] memory pathSell = new address[](2);
        pathSell[0] = tokenB;
        pathSell[1] = tokenA;

        uint256[] memory amountsSell = IUniswapV2Router02(routerB)
            .swapExactTokensForTokens(
                tokenBReceived,
                0,
                pathSell,
                address(this),
                block.timestamp
            );

        uint256 tokenAReceived = amountsSell[amountsSell.length - 1];

        // Profit check — reverts entire tx if unprofitable
        require(tokenAReceived >= amountIn + minProfit, "arb unprofitable");

        // Send everything back to owner
        IERC20(tokenA).transfer(owner, IERC20(tokenA).balanceOf(address(this)));
    }

    /// @notice Withdraw any stuck tokens.
    function withdraw(address token) external onlyOwner {
        IERC20(token).transfer(owner, IERC20(token).balanceOf(address(this)));
    }

    receive() external payable {}
}
```

### Gas Cost vs Profit Calculation

```typescript
import { formatEther, parseEther } from "viem";

interface ArbOpportunity {
  grossProfitUsd: number;
  estimatedGasUnits: bigint;
  gasPriceWei: bigint;
  ethPriceUsd: number;
}

function isProfitable(opp: ArbOpportunity): {
  profitable: boolean;
  netProfitUsd: number;
  gasCostUsd: number;
} {
  const gasCostWei = opp.estimatedGasUnits * opp.gasPriceWei;
  const gasCostEth = Number(formatEther(gasCostWei));
  const gasCostUsd = gasCostEth * opp.ethPriceUsd;

  // Apply a safety margin of 20%
  const netProfitUsd = opp.grossProfitUsd - gasCostUsd * 1.2;

  return {
    profitable: netProfitUsd > 0,
    netProfitUsd,
    gasCostUsd,
  };
}
```

**Profitability threshold rule of thumb**: On Ethereum mainnet, a DEX-to-DEX arb typically costs 150k-300k gas. At 30 gwei and ETH at $3,000, that is roughly $13.50-$27.00. The gross profit must exceed this by a comfortable margin (20%+ recommended) to account for gas estimation variance and potential revert costs.

---

## CEX-to-DEX Arbitrage

### Price Delta Detection

```typescript
import ccxt from "ccxt";
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });

const cex = new ccxt.binance({
  apiKey: process.env.BINANCE_API_KEY,
  secret: process.env.BINANCE_SECRET,
});

async function detectCexDexDelta(
  symbol: string,       // e.g. "ETH/USDT"
  dexPair: `0x${string}`,
  dec0: number,
  dec1: number
): Promise<{ cexPrice: number; dexPrice: number; deltaPct: number }> {
  const PAIR_ABI = parseAbi([
    "function getReserves() view returns (uint112, uint112, uint32)",
  ]);

  const [ticker, reserves] = await Promise.all([
    cex.fetchTicker(symbol),
    client.readContract({
      address: dexPair,
      abi: PAIR_ABI,
      functionName: "getReserves",
    }),
  ]);

  const cexPrice = ticker.last!;
  const [r0, r1] = reserves as [bigint, bigint, number];
  const dexPrice =
    Number(formatUnits(r1, dec1)) / Number(formatUnits(r0, dec0));

  const deltaPct = ((cexPrice - dexPrice) / dexPrice) * 100;

  return { cexPrice, dexPrice, deltaPct };
}
```

### Execution Timing

CEX-to-DEX arbs are **not atomic**: you execute on one venue, then the other. Key timing concerns:

| Factor | Mitigation |
| --- | --- |
| CEX order fills instantly but DEX tx takes 12 s (1 block) | Execute DEX side first (slower), hedge on CEX immediately after tx is mined |
| Price may move during execution | Use limit orders on CEX; set tight slippage on DEX |
| CEX withdrawal to on-chain takes minutes/hours | Pre-fund both sides (inventory model) |

### Inventory Management

```typescript
interface Inventory {
  cexUsdBalance: number;
  cexTokenBalance: number;
  dexUsdBalance: number;
  dexTokenBalance: number;
}

function shouldRebalance(inv: Inventory, threshold: number = 0.3): boolean {
  const totalUsd = inv.cexUsdBalance + inv.dexUsdBalance;
  const cexRatio = inv.cexUsdBalance / totalUsd;
  // Rebalance when one side holds less than 30% of the total
  return cexRatio < threshold || cexRatio > 1 - threshold;
}
```

---

## Flashloan Arbitrage

### Aave V3 Flashloan Pattern

Borrow tokens with zero collateral, execute arb, repay loan + premium in the same transaction. If the final repayment fails, the entire transaction reverts.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@aave/v3-core/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import "@aave/v3-core/contracts/interfaces/IPoolAddressesProvider.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

/// @title FlashloanArbitrage
/// @notice Borrows from Aave V3, swaps on two DEXes, repays with profit.
contract FlashloanArbitrage is FlashLoanSimpleReceiverBase {
    address public owner;

    // Aave V3 PoolAddressesProvider on Ethereum mainnet
    // 0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e
    constructor(IPoolAddressesProvider provider)
        FlashLoanSimpleReceiverBase(provider)
    {
        owner = msg.sender;
    }

    struct ArbParams {
        address routerBuy;
        address routerSell;
        address tokenIntermediate;
    }

    /// @notice Entry point — request flashloan from Aave V3.
    function requestFlashloan(
        address token,
        uint256 amount,
        address routerBuy,
        address routerSell,
        address tokenIntermediate
    ) external {
        require(msg.sender == owner, "not owner");
        bytes memory params = abi.encode(
            ArbParams(routerBuy, routerSell, tokenIntermediate)
        );
        POOL.flashLoanSimple(address(this), token, amount, params, 0);
    }

    /// @notice Called by Aave after funds are received.
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address /* initiator */,
        bytes calldata params
    ) external override returns (bool) {
        require(msg.sender == address(POOL), "caller must be pool");

        ArbParams memory arb = abi.decode(params, (ArbParams));

        // Step 1 — buy intermediate token on routerBuy
        IERC20(asset).approve(arb.routerBuy, amount);
        address[] memory pathBuy = new address[](2);
        pathBuy[0] = asset;
        pathBuy[1] = arb.tokenIntermediate;

        uint256[] memory amountsBuy = IUniswapV2Router02(arb.routerBuy)
            .swapExactTokensForTokens(
                amount, 0, pathBuy, address(this), block.timestamp
            );

        uint256 intermediateAmount = amountsBuy[1];

        // Step 2 — sell intermediate token on routerSell
        IERC20(arb.tokenIntermediate).approve(arb.routerSell, intermediateAmount);
        address[] memory pathSell = new address[](2);
        pathSell[0] = arb.tokenIntermediate;
        pathSell[1] = asset;

        IUniswapV2Router02(arb.routerSell).swapExactTokensForTokens(
            intermediateAmount, 0, pathSell, address(this), block.timestamp
        );

        // Step 3 — repay Aave (amount + premium)
        uint256 totalOwed = amount + premium;
        require(
            IERC20(asset).balanceOf(address(this)) >= totalOwed,
            "arb not profitable after premium"
        );
        IERC20(asset).approve(address(POOL), totalOwed);

        // Profit stays in contract; owner can withdraw
        return true;
    }

    function withdraw(address token) external {
        require(msg.sender == owner, "not owner");
        IERC20(token).transfer(owner, IERC20(token).balanceOf(address(this)));
    }

    receive() external payable {}
}
```

**Aave V3 mainnet addresses**:

| Contract | Address |
| --- | --- |
| PoolAddressesProvider | `0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e` |
| Pool (proxy) | `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2` |

**Premium**: 0.05% (5 bps) of the borrowed amount on most assets.

### Uniswap V2 Flash Swap

Instead of Aave, use Uniswap V2's built-in flash swap. Call `swap()` on a pair, receive tokens first, execute your logic in `uniswapV2Call`, then repay.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Callee.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract FlashSwapArb is IUniswapV2Callee {
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    /// @notice Initiate flash swap: borrow `amount0Out` of token0 (or amount1Out of token1).
    function startFlashSwap(
        address pair,
        uint256 amount0Out,
        uint256 amount1Out,
        bytes calldata data
    ) external {
        require(msg.sender == owner, "not owner");
        IUniswapV2Pair(pair).swap(amount0Out, amount1Out, address(this), data);
    }

    /// @notice Callback — Uniswap sends tokens, we arb, we repay.
    function uniswapV2Call(
        address /* sender */,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external override {
        // Decode which router/token to arb on
        (address router, address tokenIn, address tokenOut) =
            abi.decode(data, (address, address, address));

        uint256 amountBorrowed = amount0 > 0 ? amount0 : amount1;

        // Execute arb on the other DEX ...
        // (swap tokenIn -> tokenOut on `router`)

        // Repay: Uniswap V2 requires returning borrowed + 0.3% fee
        uint256 repayAmount = (amountBorrowed * 1000) / 997 + 1;
        IERC20(amount0 > 0 ? IUniswapV2Pair(msg.sender).token0() : IUniswapV2Pair(msg.sender).token1())
            .transfer(msg.sender, repayAmount);
    }
}
```

---

## Triangle Arbitrage

### Multi-Hop Path Detection

Triangle arb exploits pricing inconsistencies across three pairs: A -> B -> C -> A. If the round-trip yields more A than you started with, there is an arb.

```typescript
interface Edge {
  from: string;
  to: string;
  dex: string;
  pairAddress: `0x${string}`;
  rate: number; // how much `to` you get per 1 `from`
}

function findTriangleArbs(
  edges: Edge[],
  startToken: string,
  minProfitPct: number = 0.5
): { path: Edge[]; profitPct: number }[] {
  const results: { path: Edge[]; profitPct: number }[] = [];

  // Build adjacency list
  const adj = new Map<string, Edge[]>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e);
  }

  const firstHops = adj.get(startToken) || [];
  for (const hop1 of firstHops) {
    const secondHops = adj.get(hop1.to) || [];
    for (const hop2 of secondHops) {
      if (hop2.to === startToken) continue; // only 2 hops, not a triangle
      const thirdHops = adj.get(hop2.to) || [];
      for (const hop3 of thirdHops) {
        if (hop3.to !== startToken) continue; // must return to start

        const roundTripRate = hop1.rate * hop2.rate * hop3.rate;
        const profitPct = (roundTripRate - 1) * 100;

        if (profitPct >= minProfitPct) {
          results.push({ path: [hop1, hop2, hop3], profitPct });
        }
      }
    }
  }

  return results.sort((a, b) => b.profitPct - a.profitPct);
}
```

### Optimal Routing

For the optimal input amount on a constant-product AMM triangle, the closed-form solution maximizes profit given reserves. In practice, use binary search:

```typescript
function findOptimalAmount(
  reserves: { r0: bigint; r1: bigint }[], // reserves for each hop
  fee: number = 0.003
): bigint {
  // Binary search between 0 and a reasonable upper bound
  let lo = 0n;
  let hi = reserves[0].r0 / 10n; // never trade more than 10% of the first pool
  let bestAmount = 0n;
  let bestProfit = 0n;

  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2n;
    const profit = simulateTriangle(mid, reserves, fee);
    if (profit > bestProfit) {
      bestProfit = profit;
      bestAmount = mid;
    }
    // Check gradient direction
    const profitPlus = simulateTriangle(mid + 1n, reserves, fee);
    if (profitPlus > profit) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return bestAmount;
}

function simulateTriangle(
  amountIn: bigint,
  reserves: { r0: bigint; r1: bigint }[],
  fee: number
): bigint {
  let current = amountIn;
  for (const { r0, r1 } of reserves) {
    const amountInWithFee = current * BigInt(Math.floor((1 - fee) * 10000)) / 10000n;
    current = (amountInWithFee * r1) / (r0 + amountInWithFee);
  }
  return current - amountIn; // profit
}
```

---

## Bot Architecture

### Event Loop Pattern

```
┌──────────────────────────────────────────────────────────────┐
│                      Arbitrage Bot                           │
│                                                              │
│  ┌─────────────┐   ┌──────────────┐   ┌─────────────────┐   │
│  │  Price Feed  │──>│   Strategy   │──>│    Execution    │   │
│  │  Aggregator  │   │    Engine    │   │     Engine      │   │
│  └─────────────┘   └──────────────┘   └─────────────────┘   │
│        │                  │                     │            │
│        │                  │                     │            │
│  ┌─────────────┐   ┌──────────────┐   ┌─────────────────┐   │
│  │  DEX Pools   │   │  Profit Calc │   │  Profit Tracker │   │
│  │  CEX WS      │   │  Gas Estimator│   │  (DB / Logs)   │   │
│  └─────────────┘   └──────────────┘   └─────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### Full Bot Skeleton (TypeScript)

```typescript
import { createPublicClient, webSocket, parseAbi, type Log } from "viem";
import { mainnet } from "viem/chains";
import ccxt from "ccxt";

// ── Config ──────────────────────────────────────────────────
const MIN_PROFIT_USD = 10;
const POLL_INTERVAL_MS = 2_000;
const MAX_GAS_GWEI = 50n;

// ── Clients ─────────────────────────────────────────────────
const viemClient = createPublicClient({
  chain: mainnet,
  transport: webSocket(process.env.ETH_WS_URL!),
});

const binance = new ccxt.binance({
  apiKey: process.env.BINANCE_API_KEY!,
  secret: process.env.BINANCE_SECRET!,
});

// ── Price Feed Aggregator ───────────────────────────────────
interface PriceFeed {
  source: string;
  pair: string;
  price: number;
  timestamp: number;
}

const latestPrices = new Map<string, PriceFeed[]>();

async function pollCexPrices(symbols: string[]) {
  for (const symbol of symbols) {
    const ticker = await binance.fetchTicker(symbol);
    const key = symbol.replace("/", "_");
    if (!latestPrices.has(key)) latestPrices.set(key, []);
    latestPrices.get(key)!.push({
      source: "binance",
      pair: symbol,
      price: ticker.last!,
      timestamp: Date.now(),
    });
  }
}

// ── Strategy Engine ─────────────────────────────────────────
interface ArbSignal {
  buySource: string;
  sellSource: string;
  pair: string;
  spreadPct: number;
  estimatedProfitUsd: number;
}

function evaluateOpportunities(): ArbSignal[] {
  const signals: ArbSignal[] = [];
  for (const [pair, feeds] of latestPrices) {
    if (feeds.length < 2) continue;
    // Compare each pair of price sources
    for (let i = 0; i < feeds.length; i++) {
      for (let j = i + 1; j < feeds.length; j++) {
        const spread = Math.abs(feeds[i].price - feeds[j].price);
        const spreadPct = (spread / Math.min(feeds[i].price, feeds[j].price)) * 100;
        if (spreadPct > 0.3) { // minimum threshold
          const [buy, sell] = feeds[i].price < feeds[j].price
            ? [feeds[i], feeds[j]]
            : [feeds[j], feeds[i]];
          signals.push({
            buySource: buy.source,
            sellSource: sell.source,
            pair,
            spreadPct,
            estimatedProfitUsd: spread * 1, // multiply by position size
          });
        }
      }
    }
  }
  return signals.filter((s) => s.estimatedProfitUsd >= MIN_PROFIT_USD);
}

// ── Execution Engine ────────────────────────────────────────
async function executeArb(signal: ArbSignal) {
  console.log(`[EXEC] ${signal.pair} — buy on ${signal.buySource}, sell on ${signal.sellSource}`);
  // Check gas price before executing
  const gasPrice = await viemClient.getGasPrice();
  if (gasPrice > MAX_GAS_GWEI * 1_000_000_000n) {
    console.log(`[SKIP] Gas too high: ${gasPrice}`);
    return;
  }
  // ... execute swap transactions or send to arb contract
}

// ── Profit Tracker ──────────────────────────────────────────
const profitLog: { timestamp: number; pair: string; profitUsd: number }[] = [];

function logProfit(pair: string, profitUsd: number) {
  profitLog.push({ timestamp: Date.now(), pair, profitUsd });
  const total = profitLog.reduce((sum, e) => sum + e.profitUsd, 0);
  console.log(`[PROFIT] ${pair}: $${profitUsd.toFixed(2)} | Total: $${total.toFixed(2)}`);
}

// ── Main Loop ───────────────────────────────────────────────
async function main() {
  console.log("Starting arbitrage bot...");

  // Continuous polling loop
  while (true) {
    try {
      await pollCexPrices(["ETH/USDT", "BTC/USDT"]);
      // Also poll DEX prices here (via getReserves)

      const signals = evaluateOpportunities();
      for (const signal of signals) {
        await executeArb(signal);
      }

      // Clear stale prices
      for (const [key, feeds] of latestPrices) {
        latestPrices.set(
          key,
          feeds.filter((f) => Date.now() - f.timestamp < 10_000)
        );
      }
    } catch (err) {
      console.error("[ERROR]", err);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main();
```

---

## Key Contract Addresses (Ethereum Mainnet)

| Contract | Address |
| --- | --- |
| Uniswap V2 Router | `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D` |
| Uniswap V2 Factory | `0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f` |
| Uniswap V3 Router (SwapRouter02) | `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45` |
| Uniswap V3 Factory | `0x1F98431c8aD98523631AE4a59f267346ea31F984` |
| SushiSwap Router | `0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F` |
| SushiSwap Factory | `0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac` |
| Aave V3 Pool | `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2` |
| WETH | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` |
| USDC | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| USDT | `0xdAC17F958D2ee523a2206206994597C13D831ec7` |
