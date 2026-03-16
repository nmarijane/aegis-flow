# Uniswap Integration Guide

## V2 Contracts

### Deployed Addresses (Ethereum Mainnet)

| Contract     | Address                                      |
| ------------ | -------------------------------------------- |
| Factory      | `0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f` |
| Router02     | `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D` |

### Router02 Key Functions

#### swapExactTokensForTokens

Swap an exact amount of input tokens for as many output tokens as possible.

```solidity
function swapExactTokensForTokens(
    uint amountIn,
    uint amountOutMin,
    address[] calldata path,
    address to,
    uint deadline
) external returns (uint[] memory amounts);
```

- `path` — token route, e.g. `[WETH, USDC]` for WETH -> USDC.
- `amountOutMin` — minimum output to accept (slippage protection).
- `deadline` — unix timestamp after which the tx reverts.

#### addLiquidity

```solidity
function addLiquidity(
    address tokenA,
    address tokenB,
    uint amountADesired,
    uint amountBDesired,
    uint amountAMin,
    uint amountBMin,
    address to,
    uint deadline
) external returns (uint amountA, uint amountB, uint liquidity);
```

#### getAmountsOut

Preview swap output without executing:

```solidity
function getAmountsOut(
    uint amountIn,
    address[] calldata path
) external view returns (uint[] memory amounts);
```

### Pair Contract

Each pair is an ERC-20 LP token. Key view functions:

- `getReserves()` — returns `(reserve0, reserve1, blockTimestampLast)`.
- `token0()` / `token1()` — sorted token addresses.
- `price0CumulativeLast()` / `price1CumulativeLast()` — for TWAP oracles.

---

## V3 Contracts

### Deployed Addresses (Ethereum Mainnet)

| Contract                      | Address                                      |
| ----------------------------- | -------------------------------------------- |
| SwapRouter                    | `0xE592427A0AEce92De3Edee1F18E0157C05861564` |
| SwapRouter02                  | `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45` |
| NonfungiblePositionManager    | `0xC36442b4a4522E871399CD717aBDD847Ab11FE88` |
| QuoterV2                      | `0x61fFE014bA17989E743c5F6cB21bF9697530B21e` |
| Factory                       | `0x1F98431c8aD98523631AE4a59f267346ea31F984` |

### SwapRouter — exactInputSingle

The most common swap function for single-pool swaps:

```solidity
struct ExactInputSingleParams {
    address tokenIn;
    address tokenOut;
    uint24 fee;           // 500 (0.05%), 3000 (0.3%), 10000 (1%)
    address recipient;
    uint256 deadline;
    uint256 amountIn;
    uint256 amountOutMinimum;
    uint160 sqrtPriceLimitX96; // 0 for no limit
}

function exactInputSingle(
    ExactInputSingleParams calldata params
) external payable returns (uint256 amountOut);
```

Fee tiers: `100` (0.01%), `500` (0.05%), `3000` (0.3%), `10000` (1%).

### Tick Math Basics

V3 uses **concentrated liquidity** with discrete ticks:

- Price at tick `i`: `price = 1.0001^i`
- `tickSpacing` depends on fee tier: 1 (0.01%), 10 (0.05%), 60 (0.3%), 200 (1%).
- Liquidity providers choose a `[tickLower, tickUpper]` range.
- `sqrtPriceX96 = sqrt(price) * 2^96` — the internal price representation.

### NonfungiblePositionManager

Used to create and manage liquidity positions (each position is an NFT):

```solidity
function mint(MintParams calldata params) external payable
    returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);

function increaseLiquidity(IncreaseLiquidityParams calldata params) external payable
    returns (uint128 liquidity, uint256 amount0, uint256 amount1);

function decreaseLiquidity(DecreaseLiquidityParams calldata params) external payable
    returns (uint256 amount0, uint256 amount1);

function collect(CollectParams calldata params) external payable
    returns (uint256 amount0, uint256 amount1);
```

---

## SDK Usage

### @uniswap/v3-sdk

```bash
npm install @uniswap/v3-sdk @uniswap/sdk-core ethers
```

#### Route Computation

```typescript
import { Token, CurrencyAmount, TradeType, Percent } from "@uniswap/sdk-core";
import { Pool, Route, Trade, SwapRouter, FeeAmount } from "@uniswap/v3-sdk";
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

const WETH = new Token(1, "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", 18, "WETH");
const USDC = new Token(1, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 6, "USDC");

// Fetch pool state from on-chain
const poolAddress = Pool.getAddress(WETH, USDC, FeeAmount.MEDIUM);
const poolContract = new ethers.Contract(
  poolAddress,
  [
    "function slot0() view returns (uint160, int24, uint16, uint16, uint16, uint8, bool)",
    "function liquidity() view returns (uint128)",
  ],
  provider
);

const [slot0, liquidity] = await Promise.all([
  poolContract.slot0(),
  poolContract.liquidity(),
]);

const pool = new Pool(
  WETH,
  USDC,
  FeeAmount.MEDIUM,
  slot0[0].toString(),  // sqrtPriceX96
  liquidity.toString(),
  Number(slot0[1])       // tick
);

// Build route and trade
const route = new Route([pool], WETH, USDC);
const amountIn = CurrencyAmount.fromRawAmount(WETH, ethers.parseEther("1").toString());

const trade = Trade.createUncheckedTrade({
  route,
  inputAmount: amountIn,
  outputAmount: CurrencyAmount.fromRawAmount(
    USDC,
    route.midPrice.quote(amountIn).quotient
  ),
  tradeType: TradeType.EXACT_INPUT,
});

console.log(`Price impact: ${trade.priceImpact.toSignificant(4)}%`);
```

#### Price Impact

- `trade.priceImpact` — percentage difference between mid price and execution price.
- Warn users if impact > 1%. Block if > 5% unless explicitly overridden.

---

## Direct Contract Interaction

### ethers.js — Swap on V2

```typescript
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

const ROUTER_V2 = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const ROUTER_ABI = [
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[] amounts)",
  "function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)",
];

const router = new ethers.Contract(ROUTER_V2, ROUTER_ABI, wallet);

const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const amountIn = ethers.parseEther("0.1");

// 1. Preview output
const amounts = await router.getAmountsOut(amountIn, [WETH, USDC]);
const expectedOut = amounts[1];

// 2. Set 1% slippage
const amountOutMin = (expectedOut * 99n) / 100n;

// 3. Approve router to spend WETH
const weth = new ethers.Contract(
  WETH,
  ["function approve(address, uint256) returns (bool)"],
  wallet
);
await (await weth.approve(ROUTER_V2, amountIn)).wait();

// 4. Execute swap
const deadline = Math.floor(Date.now() / 1000) + 600; // 10 min
const tx = await router.swapExactTokensForTokens(
  amountIn,
  amountOutMin,
  [WETH, USDC],
  wallet.address,
  deadline
);
const receipt = await tx.wait();
console.log(`Swap tx: ${receipt.hash}`);
```

### viem — Swap on V3

```typescript
import { createWalletClient, http, parseEther, encodeFunctionData } from "viem";
import { mainnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

const client = createWalletClient({
  account,
  chain: mainnet,
  transport: http(process.env.RPC_URL),
});

const SWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564" as const;
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as const;
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const;

const swapRouterAbi = [
  {
    name: "exactInputSingle",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

const hash = await client.writeContract({
  address: SWAP_ROUTER,
  abi: swapRouterAbi,
  functionName: "exactInputSingle",
  args: [
    {
      tokenIn: WETH,
      tokenOut: USDC,
      fee: 3000,
      recipient: account.address,
      deadline,
      amountIn: parseEther("0.1"),
      amountOutMinimum: 0n, // Set proper slippage in production!
      sqrtPriceLimitX96: 0n,
    },
  ],
});

console.log(`Swap tx: ${hash}`);
```

---

## Flash Swaps and Flash Loans

### V2 Flash Swaps

In V2, any swap can be a flash swap. Borrow tokens from the pair, use them, and repay within the same transaction.

```solidity
// In your contract, implement the callback:
interface IUniswapV2Callee {
    function uniswapV2Call(
        address sender,
        uint amount0,
        uint amount1,
        bytes calldata data
    ) external;
}

// Initiate flash swap from the Pair contract:
// pair.swap(amountOut0, amountOut1, to, data)
// When data.length > 0, the Pair calls uniswapV2Call on `to`
// You must repay amountIn + 0.3% fee before the callback returns
```

### V3 Flash Callback

V3 pools have a dedicated `flash` function:

```solidity
// Initiate:
// pool.flash(recipient, amount0, amount1, data)

// Implement callback:
interface IUniswapV3FlashCallback {
    function uniswapV3FlashCallback(
        uint256 fee0,
        uint256 fee1,
        bytes calldata data
    ) external;
}

// Inside the callback, repay: amount0 + fee0 and amount1 + fee1
// Fee = amount * pool.fee / 1_000_000
```

---

## Deployed Addresses by Chain

### V3

| Chain            | Factory                                      | SwapRouter                                   | SwapRouter02                                 | NonfungiblePositionManager                   |
| ---------------- | -------------------------------------------- | -------------------------------------------- | -------------------------------------------- | -------------------------------------------- |
| Ethereum Mainnet | `0x1F98431c8aD98523631AE4a59f267346ea31F984` | `0xE592427A0AEce92De3Edee1F18E0157C05861564` | `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45` | `0xC36442b4a4522E871399CD717aBDD847Ab11FE88` |
| Polygon          | `0x1F98431c8aD98523631AE4a59f267346ea31F984` | `0xE592427A0AEce92De3Edee1F18E0157C05861564` | `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45` | `0xC36442b4a4522E871399CD717aBDD847Ab11FE88` |
| Arbitrum         | `0x1F98431c8aD98523631AE4a59f267346ea31F984` | `0xE592427A0AEce92De3Edee1F18E0157C05861564` | `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45` | `0xC36442b4a4522E871399CD717aBDD847Ab11FE88` |
| Base             | `0x33128a8fC17869897dcE68Ed026d694621f6FDfD` | —                                            | `0x2626664c2603336E57B271c5C0b26F421741e481` | `0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1` |

### V2

| Chain            | Factory                                      | Router02                                     |
| ---------------- | -------------------------------------------- | -------------------------------------------- |
| Ethereum Mainnet | `0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f` | `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D` |

### Common Token Addresses (Ethereum Mainnet)

| Token | Address                                      |
| ----- | -------------------------------------------- |
| WETH  | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` |
| USDC  | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| USDT  | `0xdAC17F958D2ee523a2206206994597C13D831ec7` |
| DAI   | `0x6B175474E89094C44Da98b954EedeAC495271d0F` |
| WBTC  | `0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599` |
