# AMM Patterns

## Constant Product

### x * y = k Formula

The constant product invariant: the product of the two reserve balances must remain constant (minus fees) after every swap.

```
reserveIn * reserveOut = k
(reserveIn + amountIn) * (reserveOut - amountOut) = k
```

### Price Impact Calculation

```typescript
/**
 * Calculate the output amount for a swap on a constant-product AMM.
 *
 * Formula (with 0.3% fee):
 *   amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
 */
function getAmountOut(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feeBps: number = 30 // 0.3%
): bigint {
  const feeMultiplier = BigInt(10000 - feeBps);
  const numerator = amountIn * feeMultiplier * reserveOut;
  const denominator = reserveIn * 10000n + amountIn * feeMultiplier;
  return numerator / denominator;
}

/**
 * Calculate price impact as a percentage.
 */
function priceImpact(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint
): number {
  const spotPrice = Number(reserveOut) / Number(reserveIn);
  const amountOut = getAmountOut(amountIn, reserveIn, reserveOut);
  const executionPrice = Number(amountOut) / Number(amountIn);
  return ((spotPrice - executionPrice) / spotPrice) * 100;
}

// Example:
// reserves: 1000 ETH, 3,000,000 USDC
// swap 10 ETH -> ~29,672 USDC (spot would be 30,000)
// price impact: ~1.09%
```

### Slippage Math

```typescript
/**
 * Minimum output = expected * (1 - slippage).
 * Slippage protects against front-running and price movement between
 * transaction submission and execution.
 */
function minAmountOut(expectedOut: bigint, slippageBps: number): bigint {
  return expectedOut - (expectedOut * BigInt(slippageBps)) / 10000n;
}
```

---

## Pool Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/// @title SimpleAMMPool
/// @notice Constant-product AMM pool with 0.3% swap fee.
contract SimpleAMMPool is ERC20 {
    IERC20 public immutable token0;
    IERC20 public immutable token1;

    uint256 public reserve0;
    uint256 public reserve1;

    uint256 private constant FEE_BPS = 30; // 0.3%
    uint256 private constant BPS = 10000;

    event Mint(address indexed sender, uint256 amount0, uint256 amount1, uint256 liquidity);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, uint256 liquidity);
    event Swap(address indexed sender, uint256 amountIn, uint256 amountOut, bool zeroForOne);
    event Sync(uint256 reserve0, uint256 reserve1);

    constructor(address _token0, address _token1)
        ERC20("AMM-LP", "ALP")
    {
        require(_token0 != _token1, "identical tokens");
        token0 = IERC20(_token0);
        token1 = IERC20(_token1);
    }

    // ── Add Liquidity ──────────────────────────────────────
    function addLiquidity(uint256 amount0, uint256 amount1)
        external returns (uint256 liquidity)
    {
        token0.transferFrom(msg.sender, address(this), amount0);
        token1.transferFrom(msg.sender, address(this), amount1);

        if (totalSupply() == 0) {
            // First deposit — liquidity = sqrt(amount0 * amount1)
            liquidity = Math.sqrt(amount0 * amount1);
            require(liquidity > 0, "insufficient initial liquidity");
        } else {
            // Subsequent deposits — proportional to existing reserves
            uint256 liq0 = (amount0 * totalSupply()) / reserve0;
            uint256 liq1 = (amount1 * totalSupply()) / reserve1;
            liquidity = liq0 < liq1 ? liq0 : liq1;
        }

        require(liquidity > 0, "zero liquidity");
        _mint(msg.sender, liquidity);
        _sync();

        emit Mint(msg.sender, amount0, amount1, liquidity);
    }

    // ── Remove Liquidity ───────────────────────────────────
    function removeLiquidity(uint256 liquidity)
        external returns (uint256 amount0, uint256 amount1)
    {
        require(liquidity > 0, "zero liquidity");

        amount0 = (liquidity * reserve0) / totalSupply();
        amount1 = (liquidity * reserve1) / totalSupply();
        require(amount0 > 0 && amount1 > 0, "insufficient liquidity burned");

        _burn(msg.sender, liquidity);

        token0.transfer(msg.sender, amount0);
        token1.transfer(msg.sender, amount1);
        _sync();

        emit Burn(msg.sender, amount0, amount1, liquidity);
    }

    // ── Swap ───────────────────────────────────────────────
    function swap(uint256 amountIn, bool zeroForOne, uint256 amountOutMin)
        external returns (uint256 amountOut)
    {
        require(amountIn > 0, "zero input");

        (IERC20 tokenIn, IERC20 tokenOut, uint256 resIn, uint256 resOut) =
            zeroForOne
                ? (token0, token1, reserve0, reserve1)
                : (token1, token0, reserve1, reserve0);

        tokenIn.transferFrom(msg.sender, address(this), amountIn);

        // amountOut = (amountIn * (BPS - FEE) * resOut) / (resIn * BPS + amountIn * (BPS - FEE))
        uint256 amountInWithFee = amountIn * (BPS - FEE_BPS);
        amountOut = (amountInWithFee * resOut) / (resIn * BPS + amountInWithFee);

        require(amountOut >= amountOutMin, "slippage exceeded");
        require(amountOut < resOut, "insufficient liquidity");

        tokenOut.transfer(msg.sender, amountOut);
        _sync();

        emit Swap(msg.sender, amountIn, amountOut, zeroForOne);
    }

    // ── Internal ───────────────────────────────────────────
    function _sync() private {
        reserve0 = token0.balanceOf(address(this));
        reserve1 = token1.balanceOf(address(this));
        emit Sync(reserve0, reserve1);
    }

    function getReserves() external view returns (uint256, uint256) {
        return (reserve0, reserve1);
    }
}
```

---

## Router Contract

A router wraps pool interactions with multi-hop swaps, WETH wrapping, and liquidity helpers.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./SimpleAMMPool.sol";

interface IWETH {
    function deposit() external payable;
    function withdraw(uint256) external;
    function transfer(address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}

/// @title SimpleAMMRouter
/// @notice Routes swaps through pools, handles WETH wrapping.
contract SimpleAMMRouter {
    address public immutable factory;
    address public immutable WETH;

    // factory -> getPool(tokenA, tokenB) mapping
    mapping(bytes32 => address) public pools;

    constructor(address _factory, address _weth) {
        factory = _factory;
        WETH = _weth;
    }

    // ── Swap Exact Tokens for Tokens ───────────────────────
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256 amountOut) {
        require(block.timestamp <= deadline, "expired");
        require(path.length >= 2, "invalid path");

        amountOut = amountIn;

        for (uint256 i = 0; i < path.length - 1; i++) {
            address pool = _getPool(path[i], path[i + 1]);
            bool zeroForOne = path[i] < path[i + 1];

            // Transfer input to this contract, approve pool, swap
            if (i == 0) {
                IERC20(path[i]).transferFrom(msg.sender, address(this), amountOut);
            }
            IERC20(path[i]).approve(pool, amountOut);

            amountOut = SimpleAMMPool(pool).swap(amountOut, zeroForOne, 0);
        }

        require(amountOut >= amountOutMin, "insufficient output");
        IERC20(path[path.length - 1]).transfer(to, amountOut);
    }

    // ── Swap Exact ETH for Tokens ──────────────────────────
    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountOut) {
        require(block.timestamp <= deadline, "expired");
        require(path[0] == WETH, "first must be WETH");

        IWETH(WETH).deposit{value: msg.value}();
        IWETH(WETH).approve(_getPool(path[0], path[1]), msg.value);

        // ... same swap loop as above, starting with msg.value
        // (abbreviated for clarity)
        amountOut = msg.value; // placeholder
    }

    // ── Add Liquidity ──────────────────────────────────────
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        address to,
        uint256 deadline
    ) external returns (uint256 liquidity) {
        require(block.timestamp <= deadline, "expired");
        address pool = _getPool(tokenA, tokenB);

        IERC20(tokenA).transferFrom(msg.sender, address(this), amountA);
        IERC20(tokenB).transferFrom(msg.sender, address(this), amountB);
        IERC20(tokenA).approve(pool, amountA);
        IERC20(tokenB).approve(pool, amountB);

        liquidity = SimpleAMMPool(pool).addLiquidity(amountA, amountB);
        // Transfer LP tokens to recipient
        IERC20(pool).transfer(to, liquidity);
    }

    // ── Remove Liquidity ───────────────────────────────────
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB) {
        require(block.timestamp <= deadline, "expired");
        address pool = _getPool(tokenA, tokenB);

        IERC20(pool).transferFrom(msg.sender, address(this), liquidity);
        (amountA, amountB) = SimpleAMMPool(pool).removeLiquidity(liquidity);

        IERC20(tokenA).transfer(to, amountA);
        IERC20(tokenB).transfer(to, amountB);
    }

    function _getPool(address tokenA, address tokenB) internal view returns (address) {
        bytes32 key = keccak256(abi.encodePacked(
            tokenA < tokenB ? tokenA : tokenB,
            tokenA < tokenB ? tokenB : tokenA
        ));
        address pool = pools[key];
        require(pool != address(0), "pool not found");
        return pool;
    }

    receive() external payable {}
}
```

---

## Factory Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SimpleAMMPool.sol";

contract AMMFactory {
    mapping(address => mapping(address => address)) public getPool;
    address[] public allPools;
    uint256 public feeBps = 30; // default 0.3%
    address public feeAdmin;

    event PoolCreated(address indexed token0, address indexed token1, address pool);

    constructor() {
        feeAdmin = msg.sender;
    }

    function createPool(address tokenA, address tokenB) external returns (address pool) {
        require(tokenA != tokenB, "identical tokens");
        (address t0, address t1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);
        require(getPool[t0][t1] == address(0), "pool exists");

        pool = address(new SimpleAMMPool(t0, t1));
        getPool[t0][t1] = pool;
        getPool[t1][t0] = pool;
        allPools.push(pool);

        emit PoolCreated(t0, t1, pool);
    }

    function allPoolsLength() external view returns (uint256) {
        return allPools.length;
    }

    function setFeeBps(uint256 _feeBps) external {
        require(msg.sender == feeAdmin, "not admin");
        require(_feeBps <= 100, "fee too high"); // max 1%
        feeBps = _feeBps;
    }
}
```

---

## Concentrated Liquidity

### Tick-Based Pricing (Uniswap V3 Style)

In concentrated liquidity, LPs provide liquidity within a specific price range defined by two ticks.

```
Price = 1.0001^tick

Tick spacing varies by fee tier:
  0.01% fee -> tick spacing = 1
  0.05% fee -> tick spacing = 10
  0.30% fee -> tick spacing = 60
  1.00% fee -> tick spacing = 200
```

### Range Orders

A position that provides liquidity in a narrow range effectively becomes a limit order:

```
Provide liquidity for ETH/USDC from $3,000 to $3,001:
  - If price crosses $3,001 upward, your ETH is fully converted to USDC
  - Acts like a limit sell of ETH at ~$3,000
```

### Simplified Concentrated Liquidity Pool

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Simplified illustration of concentrated liquidity concepts.
/// Production implementations (Uniswap V3) are significantly more complex.
contract ConcentratedLiquidityPool {
    struct Position {
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
    }

    mapping(bytes32 => Position) public positions;
    int24 public currentTick;

    function positionKey(address owner, int24 tickLower, int24 tickUpper)
        public pure returns (bytes32)
    {
        return keccak256(abi.encodePacked(owner, tickLower, tickUpper));
    }

    // The core idea: liquidity is only active when currentTick is within
    // the position's [tickLower, tickUpper) range.
    function isPositionActive(bytes32 key) public view returns (bool) {
        Position memory pos = positions[key];
        return currentTick >= pos.tickLower && currentTick < pos.tickUpper;
    }
}
```

---

## Oracle

### TWAP Calculation

Time-Weighted Average Price protects against single-block manipulation.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Simplified TWAP oracle for a constant-product pool.
contract TWAPOracle {
    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;
    uint32 public blockTimestampLast;
    uint256 public reserve0;
    uint256 public reserve1;

    struct Observation {
        uint32 timestamp;
        uint256 price0Cumulative;
        uint256 price1Cumulative;
    }

    Observation[] public observations;

    /// @notice Called after every swap/mint/burn to update cumulative prices.
    function _updateCumulativePrices() internal {
        uint32 timeElapsed = uint32(block.timestamp) - blockTimestampLast;

        if (timeElapsed > 0 && reserve0 > 0 && reserve1 > 0) {
            // price0 = reserve1 / reserve0 (price of token0 in token1)
            // Multiply by timeElapsed to make it time-weighted
            price0CumulativeLast += (reserve1 * 1e18 / reserve0) * timeElapsed;
            price1CumulativeLast += (reserve0 * 1e18 / reserve1) * timeElapsed;
        }

        blockTimestampLast = uint32(block.timestamp);

        observations.push(Observation({
            timestamp: uint32(block.timestamp),
            price0Cumulative: price0CumulativeLast,
            price1Cumulative: price1CumulativeLast
        }));
    }

    /// @notice Compute TWAP over a time window.
    /// @param secondsAgo How far back to look (e.g. 1800 for 30 min).
    function consultTWAP(uint32 secondsAgo) external view returns (uint256 twap) {
        require(observations.length > 0, "no observations");

        uint32 targetTimestamp = uint32(block.timestamp) - secondsAgo;
        Observation memory oldest = observations[0];

        // Find the observation closest to targetTimestamp
        for (uint256 i = observations.length - 1; i > 0; i--) {
            if (observations[i].timestamp <= targetTimestamp) {
                oldest = observations[i];
                break;
            }
        }

        Observation memory newest = observations[observations.length - 1];
        uint32 timeElapsed = newest.timestamp - oldest.timestamp;
        require(timeElapsed > 0, "no elapsed time");

        twap = (newest.price0Cumulative - oldest.price0Cumulative) / timeElapsed;
    }
}
```

---

## Complete Template

A basic AMM pool + router with Foundry tests.

### Foundry Test

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/SimpleAMMPool.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract SimpleAMMPoolTest is Test {
    SimpleAMMPool pool;
    MockERC20 tokenA;
    MockERC20 tokenB;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        tokenA = new MockERC20("Token A", "TKA");
        tokenB = new MockERC20("Token B", "TKB");

        // Ensure token0 < token1
        if (address(tokenA) > address(tokenB)) {
            (tokenA, tokenB) = (tokenB, tokenA);
        }

        pool = new SimpleAMMPool(address(tokenA), address(tokenB));

        // Fund alice for liquidity
        tokenA.mint(alice, 1000e18);
        tokenB.mint(alice, 3_000_000e18);

        // Fund bob for swaps
        tokenA.mint(bob, 100e18);
    }

    function test_AddLiquidity() public {
        vm.startPrank(alice);
        tokenA.approve(address(pool), 1000e18);
        tokenB.approve(address(pool), 3_000_000e18);

        uint256 liquidity = pool.addLiquidity(1000e18, 3_000_000e18);
        vm.stopPrank();

        assertGt(liquidity, 0);
        assertEq(pool.reserve0(), 1000e18);
        assertEq(pool.reserve1(), 3_000_000e18);
        assertEq(pool.balanceOf(alice), liquidity);
    }

    function test_Swap() public {
        // Add liquidity first
        vm.startPrank(alice);
        tokenA.approve(address(pool), 1000e18);
        tokenB.approve(address(pool), 3_000_000e18);
        pool.addLiquidity(1000e18, 3_000_000e18);
        vm.stopPrank();

        // Bob swaps 10 tokenA for tokenB
        vm.startPrank(bob);
        tokenA.approve(address(pool), 10e18);
        uint256 amountOut = pool.swap(10e18, true, 0);
        vm.stopPrank();

        assertGt(amountOut, 0);
        assertEq(tokenA.balanceOf(bob), 90e18);
        assertEq(tokenB.balanceOf(bob), amountOut);

        // Price impact check: should get less than spot price (3000 per token)
        // 10 * 3000 = 30000, but with 0.3% fee and impact, should be less
        assertLt(amountOut, 30000e18);
        assertGt(amountOut, 29000e18); // but not too much less for 1% of pool
    }

    function test_RemoveLiquidity() public {
        vm.startPrank(alice);
        tokenA.approve(address(pool), 1000e18);
        tokenB.approve(address(pool), 3_000_000e18);
        uint256 liquidity = pool.addLiquidity(1000e18, 3_000_000e18);

        (uint256 amount0, uint256 amount1) = pool.removeLiquidity(liquidity);
        vm.stopPrank();

        assertEq(amount0, 1000e18);
        assertEq(amount1, 3_000_000e18);
        assertEq(pool.totalSupply(), 0);
    }

    function test_ConstantProductInvariant() public {
        vm.startPrank(alice);
        tokenA.approve(address(pool), 1000e18);
        tokenB.approve(address(pool), 3_000_000e18);
        pool.addLiquidity(1000e18, 3_000_000e18);
        vm.stopPrank();

        uint256 kBefore = pool.reserve0() * pool.reserve1();

        vm.startPrank(bob);
        tokenA.approve(address(pool), 10e18);
        pool.swap(10e18, true, 0);
        vm.stopPrank();

        uint256 kAfter = pool.reserve0() * pool.reserve1();

        // k should increase (fees collected) or stay the same
        assertGe(kAfter, kBefore);
    }
}
```
