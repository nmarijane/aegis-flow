# DEX Integration Patterns

## Uniswap V2 Pattern

### Router Interaction

```typescript
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseUnits,
  formatUnits,
  type Account,
} from "viem";
import { mainnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const UNISWAP_V2_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" as const;
const UNISWAP_V2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f" as const;

const ROUTER_ABI = parseAbi([
  "function getAmountsOut(uint256 amountIn, address[] calldata path) view returns (uint256[] memory amounts)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) returns (uint256[] memory amounts)",
  "function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) payable returns (uint256[] memory amounts)",
  "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) returns (uint256[] memory amounts)",
  "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
  "function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB)",
]);

const client = createPublicClient({ chain: mainnet, transport: http() });
```

### Pair Discovery via Factory

```typescript
const FACTORY_ABI = parseAbi([
  "function getPair(address tokenA, address tokenB) view returns (address pair)",
  "function allPairsLength() view returns (uint256)",
]);

async function findPair(tokenA: `0x${string}`, tokenB: `0x${string}`): Promise<`0x${string}`> {
  const pair = await client.readContract({
    address: UNISWAP_V2_FACTORY,
    abi: FACTORY_ABI,
    functionName: "getPair",
    args: [tokenA, tokenB],
  });

  if (pair === "0x0000000000000000000000000000000000000000") {
    throw new Error(`No pair exists for ${tokenA} / ${tokenB}`);
  }

  return pair;
}
```

### Price Calculation from Reserves

```typescript
const PAIR_ABI = parseAbi([
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);

async function getSpotPrice(
  pairAddress: `0x${string}`,
  decimals0: number,
  decimals1: number
): Promise<{ price0in1: number; price1in0: number }> {
  const [reserve0, reserve1] = (await client.readContract({
    address: pairAddress,
    abi: PAIR_ABI,
    functionName: "getReserves",
  })) as [bigint, bigint, number];

  const r0 = Number(formatUnits(reserve0, decimals0));
  const r1 = Number(formatUnits(reserve1, decimals1));

  return {
    price0in1: r1 / r0,
    price1in0: r0 / r1,
  };
}

// Alternative: use the router's getAmountsOut for exact output including fees
async function getQuote(
  amountIn: bigint,
  path: `0x${string}`[]
): Promise<bigint> {
  const amounts = await client.readContract({
    address: UNISWAP_V2_ROUTER,
    abi: ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [amountIn, path],
  });
  return amounts[amounts.length - 1];
}
```

### Swap Execution

```typescript
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as const;
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const;

async function swapTokensV2(
  walletClient: ReturnType<typeof createWalletClient>,
  account: Account,
  amountIn: bigint,
  path: `0x${string}`[],
  slippageBps: number = 50 // 0.5%
) {
  // 1. Get expected output
  const amountsOut = await client.readContract({
    address: UNISWAP_V2_ROUTER,
    abi: ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [amountIn, path],
  });

  const expectedOut = amountsOut[amountsOut.length - 1];
  const minOut = expectedOut - (expectedOut * BigInt(slippageBps)) / 10000n;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600); // 10 min

  // 2. Execute swap
  const hash = await walletClient.writeContract({
    address: UNISWAP_V2_ROUTER,
    abi: ROUTER_ABI,
    functionName: "swapExactTokensForTokens",
    args: [amountIn, minOut, path, account.address, deadline],
    account,
    chain: mainnet,
  });

  const receipt = await client.waitForTransactionReceipt({ hash });
  return receipt;
}
```

---

## Uniswap V3 Pattern

### Addresses

| Contract | Address |
| --- | --- |
| SwapRouter02 | `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45` |
| Factory | `0x1F98431c8aD98523631AE4a59f267346ea31F984` |
| Quoter V2 | `0x61fFE014bA17989E743c5F6cB21bF9697530B21e` |
| NonfungiblePositionManager | `0xC36442b4a4522E871399CD717aBDD847Ab11FE88` |

### Tick-Based Pricing

In Uniswap V3, price is expressed as a **tick**. Each tick represents a 0.01% (1 basis point) price change.

```typescript
// Price to tick: tick = log(price) / log(1.0001)
function priceToTick(price: number): number {
  return Math.floor(Math.log(price) / Math.log(1.0001));
}

// Tick to price: price = 1.0001^tick
function tickToPrice(tick: number): number {
  return Math.pow(1.0001, tick);
}

// sqrtPriceX96 to price (used in pool state)
function sqrtPriceX96ToPrice(sqrtPriceX96: bigint, decimals0: number, decimals1: number): number {
  const price = Number(sqrtPriceX96) ** 2 / 2 ** 192;
  return price * 10 ** (decimals0 - decimals1);
}
```

### Quoter Usage for Price Estimation

```typescript
const QUOTER_V2 = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e" as const;

const QUOTER_ABI = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
  "function quoteExactInput(bytes path, uint256 amountIn) returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)",
]);

async function getV3Quote(
  tokenIn: `0x${string}`,
  tokenOut: `0x${string}`,
  amountIn: bigint,
  fee: number = 3000 // 0.3%
): Promise<bigint> {
  // Use simulateContract since quoteExactInputSingle reverts with the result
  const { result } = await client.simulateContract({
    address: QUOTER_V2,
    abi: QUOTER_ABI,
    functionName: "quoteExactInputSingle",
    args: [
      {
        tokenIn,
        tokenOut,
        amountIn,
        fee,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });

  return result[0]; // amountOut
}
```

### Concentrated Liquidity Positions

```typescript
const POSITION_MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88" as const;

const PM_ABI = parseAbi([
  "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
]);

// Fee tiers and tick spacing
const FEE_TIERS = {
  100: { fee: 100, tickSpacing: 1, label: "0.01% — stablecoin pairs" },
  500: { fee: 500, tickSpacing: 10, label: "0.05% — correlated pairs" },
  3000: { fee: 3000, tickSpacing: 60, label: "0.30% — standard pairs" },
  10000: { fee: 10000, tickSpacing: 200, label: "1.00% — exotic pairs" },
};
```

### Swap via SwapRouter02

```typescript
const SWAP_ROUTER = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45" as const;

const SWAP_ROUTER_ABI = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
  "function exactInput((bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum)) external payable returns (uint256 amountOut)",
]);

async function swapV3ExactInput(
  walletClient: ReturnType<typeof createWalletClient>,
  account: Account,
  tokenIn: `0x${string}`,
  tokenOut: `0x${string}`,
  fee: number,
  amountIn: bigint,
  amountOutMin: bigint
) {
  const hash = await walletClient.writeContract({
    address: SWAP_ROUTER,
    abi: SWAP_ROUTER_ABI,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn,
        tokenOut,
        fee,
        recipient: account.address,
        amountIn,
        amountOutMinimum: amountOutMin,
        sqrtPriceLimitX96: 0n, // no price limit
      },
    ],
    account,
    chain: mainnet,
  });

  return client.waitForTransactionReceipt({ hash });
}
```

---

## SushiSwap

SushiSwap uses the same interface as Uniswap V2 with different addresses.

| Contract | Address |
| --- | --- |
| SushiSwap Router | `0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F` |
| SushiSwap Factory | `0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac` |

```typescript
const SUSHI_ROUTER = "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F" as const;

// Same ABI as Uniswap V2 Router — use the same ROUTER_ABI from above
async function swapOnSushi(
  walletClient: ReturnType<typeof createWalletClient>,
  account: Account,
  amountIn: bigint,
  path: `0x${string}`[],
  slippageBps: number = 50
) {
  // Identical flow to Uniswap V2, just use SUSHI_ROUTER address
  const amountsOut = await client.readContract({
    address: SUSHI_ROUTER,
    abi: ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [amountIn, path],
  });

  const expectedOut = amountsOut[amountsOut.length - 1];
  const minOut = expectedOut - (expectedOut * BigInt(slippageBps)) / 10000n;

  return walletClient.writeContract({
    address: SUSHI_ROUTER,
    abi: ROUTER_ABI,
    functionName: "swapExactTokensForTokens",
    args: [amountIn, minOut, path, account.address, BigInt(Math.floor(Date.now() / 1000) + 600)],
    account,
    chain: mainnet,
  });
}
```

---

## Multi-DEX Router

### Aggregation Pattern

Query multiple DEXes and route through the one offering the best price.

```typescript
interface DexQuote {
  dex: string;
  routerAddress: `0x${string}`;
  amountOut: bigint;
  path: `0x${string}`[];
  gasEstimate: bigint;
}

async function getBestDexQuote(
  tokenIn: `0x${string}`,
  tokenOut: `0x${string}`,
  amountIn: bigint
): Promise<DexQuote> {
  const path = [tokenIn, tokenOut];

  const quotes: DexQuote[] = await Promise.allSettled([
    // Uniswap V2
    client.readContract({
      address: UNISWAP_V2_ROUTER,
      abi: ROUTER_ABI,
      functionName: "getAmountsOut",
      args: [amountIn, path],
    }).then((amounts) => ({
      dex: "UniswapV2",
      routerAddress: UNISWAP_V2_ROUTER,
      amountOut: amounts[amounts.length - 1],
      path,
      gasEstimate: 150000n,
    })),

    // SushiSwap
    client.readContract({
      address: SUSHI_ROUTER,
      abi: ROUTER_ABI,
      functionName: "getAmountsOut",
      args: [amountIn, path],
    }).then((amounts) => ({
      dex: "SushiSwap",
      routerAddress: SUSHI_ROUTER,
      amountOut: amounts[amounts.length - 1],
      path,
      gasEstimate: 150000n,
    })),

    // Uniswap V3 (0.3% fee)
    getV3Quote(tokenIn, tokenOut, amountIn, 3000).then((amountOut) => ({
      dex: "UniswapV3",
      routerAddress: SWAP_ROUTER,
      amountOut,
      path,
      gasEstimate: 180000n,
    })),
  ]).then((results) =>
    results
      .filter((r): r is PromiseFulfilledResult<DexQuote> => r.status === "fulfilled")
      .map((r) => r.value)
  );

  if (quotes.length === 0) throw new Error("No DEX returned a quote");

  return quotes.reduce((best, q) => (q.amountOut > best.amountOut ? q : best));
}
```

### Split Routing

For large orders, split across multiple DEXes to reduce price impact.

```typescript
interface SplitRoute {
  dex: string;
  routerAddress: `0x${string}`;
  amountIn: bigint;
  expectedOut: bigint;
}

async function splitRoute(
  tokenIn: `0x${string}`,
  tokenOut: `0x${string}`,
  totalAmountIn: bigint,
  splits: number = 4
): Promise<SplitRoute[]> {
  const chunkSize = totalAmountIn / BigInt(splits);
  const routes: SplitRoute[] = [];

  // Get quotes for each chunk from each DEX and greedily assign
  for (let i = 0; i < splits; i++) {
    const amount = i === splits - 1
      ? totalAmountIn - chunkSize * BigInt(splits - 1) // handle remainder
      : chunkSize;

    const best = await getBestDexQuote(tokenIn, tokenOut, amount);
    routes.push({
      dex: best.dex,
      routerAddress: best.routerAddress,
      amountIn: amount,
      expectedOut: best.amountOut,
    });
  }

  return routes;
}
```

---

## Approval Pattern

### ERC-20 Approve Flow

Before a DEX router can spend your tokens, you must approve it.

```typescript
const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);

async function ensureApproval(
  walletClient: ReturnType<typeof createWalletClient>,
  account: Account,
  token: `0x${string}`,
  spender: `0x${string}`,
  amount: bigint
): Promise<`0x${string}` | null> {
  // Check current allowance
  const currentAllowance = await client.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account.address, spender],
  });

  if (currentAllowance >= amount) return null; // already approved

  // Approve — use max uint256 for "infinite" approval
  const hash = await walletClient.writeContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spender, amount],
    account,
    chain: mainnet,
  });

  await client.waitForTransactionReceipt({ hash });
  return hash;
}
```

### Infinite vs Exact Approval

| Approach | Pros | Cons |
| --- | --- | --- |
| **Infinite** (`type(uint256).max`) | One-time approval, no repeated gas costs | Security risk if contract is compromised |
| **Exact** (`amountIn`) | Minimizes exposure | Extra gas each time |
| **Permit2** | Gasless, time-scoped, amount-scoped | Requires contract to support Permit2 |

### Permit2 Pattern

Uniswap's Permit2 (`0x000000000022D473030F116dDEE9F6B43aC78BA3`) provides a two-step flow:

1. Approve Permit2 contract once (infinite approval).
2. For each swap, sign a typed-data message (off-chain, gasless) that authorizes the router to pull tokens via Permit2.

```typescript
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

// Step 1 — one-time: approve Permit2 to spend your token
async function approvePermit2(
  walletClient: ReturnType<typeof createWalletClient>,
  account: Account,
  token: `0x${string}`
) {
  return walletClient.writeContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [PERMIT2, 2n ** 256n - 1n],
    account,
    chain: mainnet,
  });
}

// Step 2 — for each swap: sign a permit message (off-chain)
// The signature is passed to the router which calls Permit2.permitTransferFrom()
```

---

## Transaction Management

### Gas Estimation with viem

```typescript
async function estimateAndSend(
  walletClient: ReturnType<typeof createWalletClient>,
  account: Account,
  txRequest: {
    to: `0x${string}`;
    data: `0x${string}`;
    value?: bigint;
  }
) {
  // Estimate gas
  const gasEstimate = await client.estimateGas({
    account: account.address,
    to: txRequest.to,
    data: txRequest.data,
    value: txRequest.value,
  });

  // Add 20% buffer
  const gasLimit = (gasEstimate * 120n) / 100n;

  // Get current gas price (EIP-1559)
  const block = await client.getBlock({ blockTag: "latest" });
  const baseFee = block.baseFeePerGas ?? 0n;
  const maxPriorityFee = parseUnits("1.5", 9); // 1.5 gwei tip
  const maxFee = baseFee * 2n + maxPriorityFee;

  const hash = await walletClient.sendTransaction({
    account,
    to: txRequest.to,
    data: txRequest.data,
    value: txRequest.value,
    gas: gasLimit,
    maxFeePerGas: maxFee,
    maxPriorityFeePerGas: maxPriorityFee,
    chain: mainnet,
  });

  return client.waitForTransactionReceipt({ hash });
}
```

### Nonce Management

Prevent nonce collisions when sending multiple transactions concurrently.

```typescript
class NonceManager {
  private currentNonce: number | null = null;
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private client: ReturnType<typeof createPublicClient>,
    private address: `0x${string}`
  ) {}

  async getNextNonce(): Promise<number> {
    // Serialize nonce access
    return new Promise((resolve) => {
      this.pending = this.pending.then(async () => {
        if (this.currentNonce === null) {
          this.currentNonce = await this.client.getTransactionCount({
            address: this.address,
            blockTag: "pending",
          });
        } else {
          this.currentNonce++;
        }
        resolve(this.currentNonce);
      });
    });
  }

  reset() {
    this.currentNonce = null;
  }
}
```

### Deadline Setting

Always set a deadline on DEX swaps. If the transaction is stuck in the mempool and gets mined much later, the price may have moved unfavorably.

```typescript
// Standard: 10-minute deadline
function getDeadline(minutes: number = 10): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + minutes * 60);
}
```

### Slippage Calculation Formula

```typescript
/**
 * Calculate minimum output after slippage.
 *
 * @param expectedOutput - The amount the DEX quotes you will receive.
 * @param slippageBps   - Maximum acceptable slippage in basis points (1 bps = 0.01%).
 * @returns Minimum acceptable output.
 */
function applySlippage(expectedOutput: bigint, slippageBps: number): bigint {
  return expectedOutput - (expectedOutput * BigInt(slippageBps)) / 10000n;
}

// Common slippage settings:
// Stablecoins:   5-10 bps  (0.05%-0.10%)
// Major pairs:   30-50 bps (0.30%-0.50%)
// Low liquidity: 100-300 bps (1%-3%)
// Memecoins:     500-2000 bps (5%-20%)
```

---

## Key Addresses (Ethereum Mainnet)

| Token / Contract | Address |
| --- | --- |
| WETH | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` |
| USDC | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| USDT | `0xdAC17F958D2ee523a2206206994597C13D831ec7` |
| DAI | `0x6B175474E89094C44Da98b954EedeAC495271d0F` |
| WBTC | `0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599` |
| Uniswap V2 Router | `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D` |
| Uniswap V2 Factory | `0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f` |
| Uniswap V3 SwapRouter02 | `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45` |
| Uniswap V3 Factory | `0x1F98431c8aD98523631AE4a59f267346ea31F984` |
| Uniswap V3 QuoterV2 | `0x61fFE014bA17989E743c5F6cB21bF9697530B21e` |
| SushiSwap Router | `0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
