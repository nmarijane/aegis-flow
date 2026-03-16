# Lending Protocol Patterns

## Pool Architecture

### Lifecycle

```
┌─────────┐     ┌───────────┐     ┌──────────┐     ┌─────────┐
│ Deposit  │────>│  Earn     │────>│ Withdraw │────>│  Claim  │
│ (supply) │     │  Interest │     │ (redeem) │     │  Yield  │
└─────────┘     └───────────┘     └──────────┘     └─────────┘
                     │
                     v
┌─────────┐     ┌───────────┐     ┌──────────┐
│ Borrow  │<────│ Collateral│────>│  Repay   │
│          │     │  Lock     │     │          │
└─────────┘     └───────────┘     └──────────┘
                                       │
                                  ┌──────────┐
                                  │Liquidation│ (if health < 1)
                                  └──────────┘
```

### Core Pool Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/// @title SimpleLendingPool
/// @notice Basic lending pool with deposit, withdraw, borrow, and repay.
contract SimpleLendingPool is ERC20 {
    IERC20 public immutable asset; // the token being lent/borrowed

    // Accounting
    uint256 public totalBorrowed;
    uint256 public totalReserves;

    // Per-user borrow tracking
    mapping(address => uint256) public borrowBalance;
    mapping(address => uint256) public borrowIndex; // snapshot of global index at borrow time

    // Collateral tracking (separate collateral token for simplicity)
    IERC20 public immutable collateralToken;
    mapping(address => uint256) public collateralBalance;

    // Parameters
    uint256 public collateralFactorBps = 7500;  // 75% — max borrow = collateral * 75%
    uint256 public liquidationThresholdBps = 8000; // 80%
    uint256 public liquidationBonusBps = 500;   // 5% bonus for liquidators

    // Interest rate model
    uint256 public baseRateBps = 200;     // 2% base
    uint256 public slopeBeforeKink = 1000; // 10% at kink
    uint256 public slopeAfterKink = 10000; // 100% above kink
    uint256 public kinkUtilizationBps = 8000; // 80% utilization

    uint256 public lastAccrualTimestamp;
    uint256 public borrowIndexGlobal = 1e18; // starts at 1

    event Deposit(address indexed user, uint256 amount, uint256 shares);
    event Withdraw(address indexed user, uint256 amount, uint256 shares);
    event Borrow(address indexed user, uint256 amount);
    event Repay(address indexed user, uint256 amount);
    event Liquidate(address indexed liquidator, address indexed borrower, uint256 repayAmount, uint256 collateralSeized);

    constructor(address _asset, address _collateral)
        ERC20("Lending Pool Share", "lpSHARE")
    {
        asset = IERC20(_asset);
        collateralToken = IERC20(_collateral);
        lastAccrualTimestamp = block.timestamp;
    }

    // ── Deposit ────────────────────────────────────────────
    function deposit(uint256 amount) external returns (uint256 shares) {
        accrueInterest();

        uint256 totalAssets = asset.balanceOf(address(this)) + totalBorrowed;
        shares = totalSupply() == 0
            ? amount
            : (amount * totalSupply()) / totalAssets;

        require(shares > 0, "zero shares");
        asset.transferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, shares);

        emit Deposit(msg.sender, amount, shares);
    }

    // ── Withdraw ───────────────────────────────────────────
    function withdraw(uint256 shares) external returns (uint256 amount) {
        accrueInterest();

        uint256 totalAssets = asset.balanceOf(address(this)) + totalBorrowed;
        amount = (shares * totalAssets) / totalSupply();

        require(amount > 0, "zero amount");
        require(asset.balanceOf(address(this)) >= amount, "insufficient liquidity");

        _burn(msg.sender, shares);
        asset.transfer(msg.sender, amount);

        emit Withdraw(msg.sender, amount, shares);
    }

    // ── Deposit Collateral ─────────────────────────────────
    function depositCollateral(uint256 amount) external {
        collateralToken.transferFrom(msg.sender, address(this), amount);
        collateralBalance[msg.sender] += amount;
    }

    function withdrawCollateral(uint256 amount) external {
        accrueInterest();
        collateralBalance[msg.sender] -= amount;
        require(_healthFactor(msg.sender) >= 1e18, "unhealthy");
        collateralToken.transfer(msg.sender, amount);
    }

    // ── Borrow ─────────────────────────────────────────────
    function borrow(uint256 amount) external {
        accrueInterest();

        // Update user's borrow with accrued interest
        _settleBorrow(msg.sender);

        borrowBalance[msg.sender] += amount;
        totalBorrowed += amount;
        borrowIndex[msg.sender] = borrowIndexGlobal;

        require(_healthFactor(msg.sender) >= 1e18, "undercollateralized");
        require(asset.balanceOf(address(this)) >= amount, "insufficient liquidity");

        asset.transfer(msg.sender, amount);

        emit Borrow(msg.sender, amount);
    }

    // ── Repay ──────────────────────────────────────────────
    function repay(uint256 amount) external {
        accrueInterest();
        _settleBorrow(msg.sender);

        uint256 repayAmount = amount > borrowBalance[msg.sender]
            ? borrowBalance[msg.sender]
            : amount;

        asset.transferFrom(msg.sender, address(this), repayAmount);
        borrowBalance[msg.sender] -= repayAmount;
        totalBorrowed -= repayAmount;

        emit Repay(msg.sender, repayAmount);
    }

    // ── Liquidation ────────────────────────────────────────
    function liquidate(address borrower, uint256 repayAmount) external {
        accrueInterest();
        _settleBorrow(borrower);

        require(_healthFactor(borrower) < 1e18, "healthy position");

        // Liquidator repays part of the debt
        uint256 maxRepay = borrowBalance[borrower] / 2; // max 50% close factor
        repayAmount = repayAmount > maxRepay ? maxRepay : repayAmount;

        asset.transferFrom(msg.sender, address(this), repayAmount);
        borrowBalance[borrower] -= repayAmount;
        totalBorrowed -= repayAmount;

        // Liquidator receives collateral + bonus
        uint256 collateralToSeize = (repayAmount * (BPS + liquidationBonusBps)) / BPS;
        // In production, convert via oracle price. Simplified here: 1:1 ratio.
        require(collateralBalance[borrower] >= collateralToSeize, "not enough collateral");

        collateralBalance[borrower] -= collateralToSeize;
        collateralToken.transfer(msg.sender, collateralToSeize);

        emit Liquidate(msg.sender, borrower, repayAmount, collateralToSeize);
    }

    // ── Interest Rate Model ────────────────────────────────
    function accrueInterest() public {
        uint256 timeElapsed = block.timestamp - lastAccrualTimestamp;
        if (timeElapsed == 0) return;

        uint256 utilizationBps = _utilization();
        uint256 annualRateBps = _getInterestRate(utilizationBps);

        // Simple interest: borrowIndex *= (1 + rate * timeElapsed / year)
        uint256 interestFactor = (annualRateBps * timeElapsed * 1e18) / (BPS * 365 days);
        borrowIndexGlobal += (borrowIndexGlobal * interestFactor) / 1e18;

        uint256 interestAccrued = (totalBorrowed * interestFactor) / 1e18;
        totalBorrowed += interestAccrued;
        totalReserves += interestAccrued / 10; // 10% of interest goes to reserves

        lastAccrualTimestamp = block.timestamp;
    }

    function _getInterestRate(uint256 utilizationBps) internal view returns (uint256) {
        if (utilizationBps <= kinkUtilizationBps) {
            return baseRateBps + (utilizationBps * slopeBeforeKink) / BPS;
        } else {
            uint256 rateAtKink = baseRateBps + (kinkUtilizationBps * slopeBeforeKink) / BPS;
            uint256 excessUtilization = utilizationBps - kinkUtilizationBps;
            return rateAtKink + (excessUtilization * slopeAfterKink) / BPS;
        }
    }

    function _utilization() internal view returns (uint256) {
        uint256 totalAssets = asset.balanceOf(address(this)) + totalBorrowed;
        if (totalAssets == 0) return 0;
        return (totalBorrowed * BPS) / totalAssets;
    }

    // ── Health Factor ──────────────────────────────────────
    function _healthFactor(address user) internal view returns (uint256) {
        if (borrowBalance[user] == 0) return type(uint256).max;

        uint256 collateralValue = collateralBalance[user]; // simplified: 1:1 price
        uint256 maxBorrow = (collateralValue * liquidationThresholdBps) / BPS;

        return (maxBorrow * 1e18) / borrowBalance[user];
    }

    function healthFactor(address user) external view returns (uint256) {
        return _healthFactor(user);
    }

    function _settleBorrow(address user) internal {
        if (borrowBalance[user] > 0 && borrowIndex[user] > 0) {
            borrowBalance[user] = (borrowBalance[user] * borrowIndexGlobal) / borrowIndex[user];
        }
        borrowIndex[user] = borrowIndexGlobal;
    }

    uint256 private constant BPS = 10000;
}
```

---

## Interest Rate Model

### Kink Model (Compound-style)

```
Interest Rate
     ^
     |                          /
     |                        /
     |                      /    <- slope2 (steep after kink)
     |                    /
     |              ----/  <- kink (e.g. 80% utilization)
     |          ---/
     |      ---/           <- slope1 (gentle before kink)
     |  ---/
     |--/  <- base rate
     +────────────────────────> Utilization %
     0%                  100%
```

```solidity
/// @notice Pure interest rate model — no state, just math.
library InterestRateModel {
    uint256 constant BPS = 10000;

    /// @param utilization Current utilization in BPS (0-10000).
    /// @return Annual interest rate in BPS.
    function getRate(
        uint256 utilization,
        uint256 baseRate,
        uint256 slope1,
        uint256 slope2,
        uint256 kink
    ) internal pure returns (uint256) {
        if (utilization <= kink) {
            return baseRate + (utilization * slope1) / BPS;
        } else {
            uint256 rateAtKink = baseRate + (kink * slope1) / BPS;
            return rateAtKink + ((utilization - kink) * slope2) / BPS;
        }
    }
}
```

### Example Rates

| Utilization | Rate (base=2%, slope1=10%, slope2=100%, kink=80%) |
| --- | --- |
| 0% | 2.0% |
| 40% | 6.0% |
| 80% (kink) | 10.0% |
| 90% | 20.0% |
| 100% | 30.0% |

---

## Collateral

### Collateral Factor

The maximum LTV (loan-to-value) ratio for a given collateral type.

```
maxBorrow = collateralValue * collateralFactor

Example: deposit $10,000 ETH with 75% collateral factor
  -> can borrow up to $7,500 worth of USDC
```

### Health Factor Calculation

```
                   sum(collateral_i * price_i * liquidationThreshold_i)
healthFactor = ──────────────────────────────────────────────────────────
                              sum(borrow_j * price_j)

healthFactor >= 1.0  -> safe
healthFactor <  1.0  -> liquidatable
```

```typescript
interface Position {
  collaterals: { token: string; amount: number; price: number; liqThreshold: number }[];
  borrows: { token: string; amount: number; price: number }[];
}

function healthFactor(position: Position): number {
  const collateralValue = position.collaterals.reduce(
    (sum, c) => sum + c.amount * c.price * c.liqThreshold,
    0
  );

  const borrowValue = position.borrows.reduce(
    (sum, b) => sum + b.amount * b.price,
    0
  );

  if (borrowValue === 0) return Infinity;
  return collateralValue / borrowValue;
}
```

---

## Liquidation

### Mechanics

When `healthFactor < 1.0`:

1. A liquidator calls `liquidate(borrower, repayAmount)`.
2. Liquidator repays up to 50% of the borrower's debt (close factor).
3. Liquidator receives equivalent collateral + bonus (typically 5-10%).
4. Borrower's debt decreases; collateral decreases.

### Liquidation Bot Pattern

```typescript
import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });

const POOL_ABI = parseAbi([
  "function healthFactor(address user) view returns (uint256)",
  "function borrowBalance(address user) view returns (uint256)",
  "function liquidate(address borrower, uint256 repayAmount) external",
]);

interface LiquidatablePosition {
  borrower: `0x${string}`;
  healthFactor: number;
  borrowBalance: bigint;
}

async function findLiquidatablePositions(
  poolAddress: `0x${string}`,
  borrowers: `0x${string}`[]
): Promise<LiquidatablePosition[]> {
  const results: LiquidatablePosition[] = [];

  for (const borrower of borrowers) {
    const [hf, balance] = await Promise.all([
      client.readContract({
        address: poolAddress,
        abi: POOL_ABI,
        functionName: "healthFactor",
        args: [borrower],
      }),
      client.readContract({
        address: poolAddress,
        abi: POOL_ABI,
        functionName: "borrowBalance",
        args: [borrower],
      }),
    ]);

    const healthFactor = Number(hf) / 1e18;

    if (healthFactor < 1.0) {
      results.push({ borrower, healthFactor, borrowBalance: balance });
    }
  }

  return results.sort((a, b) => a.healthFactor - b.healthFactor);
}
```

---

## Oracle Integration

### Chainlink AggregatorV3Interface

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract PriceOracle {
    mapping(address => address) public priceFeeds; // token -> Chainlink feed

    // Well-known Chainlink feeds on Ethereum mainnet:
    // ETH/USD: 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419
    // BTC/USD: 0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c
    // USDC/USD: 0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6
    // DAI/USD: 0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9

    function setFeed(address token, address feed) external {
        priceFeeds[token] = feed;
    }

    /// @notice Get latest price with staleness check.
    function getPrice(address token) public view returns (uint256 price, uint8 decimals) {
        address feed = priceFeeds[token];
        require(feed != address(0), "no feed");

        AggregatorV3Interface oracle = AggregatorV3Interface(feed);
        (
            /* uint80 roundId */,
            int256 answer,
            /* uint256 startedAt */,
            uint256 updatedAt,
            /* uint80 answeredInRound */
        ) = oracle.latestRoundData();

        require(answer > 0, "negative price");
        require(block.timestamp - updatedAt < 3600, "stale price"); // 1 hour max

        return (uint256(answer), oracle.decimals());
    }

    /// @notice Get price normalized to 18 decimals.
    function getPriceNormalized(address token) external view returns (uint256) {
        (uint256 price, uint8 decimals) = getPrice(token);
        if (decimals < 18) {
            return price * 10 ** (18 - decimals);
        } else {
            return price / 10 ** (decimals - 18);
        }
    }
}
```

### Fallback Oracle Pattern

```solidity
contract FallbackOracle {
    AggregatorV3Interface public primaryOracle;
    AggregatorV3Interface public fallbackOracle;
    uint256 public stalenessThreshold = 3600; // 1 hour
    uint256 public maxDeviationBps = 500; // 5% max deviation between oracles

    function getPrice() external view returns (uint256) {
        (bool primaryOk, uint256 primaryPrice) = _tryGetPrice(primaryOracle);
        (bool fallbackOk, uint256 fallbackPrice) = _tryGetPrice(fallbackOracle);

        if (primaryOk && fallbackOk) {
            // Cross-check: ensure they don't deviate too much
            uint256 deviation = primaryPrice > fallbackPrice
                ? ((primaryPrice - fallbackPrice) * 10000) / primaryPrice
                : ((fallbackPrice - primaryPrice) * 10000) / fallbackPrice;

            require(deviation <= maxDeviationBps, "oracle deviation too high");
            return primaryPrice;
        }

        if (primaryOk) return primaryPrice;
        if (fallbackOk) return fallbackPrice;

        revert("all oracles failed");
    }

    function _tryGetPrice(AggregatorV3Interface oracle)
        internal view returns (bool, uint256)
    {
        try oracle.latestRoundData() returns (
            uint80, int256 answer, uint256, uint256 updatedAt, uint80
        ) {
            if (answer <= 0) return (false, 0);
            if (block.timestamp - updatedAt > stalenessThreshold) return (false, 0);
            return (true, uint256(answer));
        } catch {
            return (false, 0);
        }
    }
}
```

---

## Flash Loans

### Single-Transaction Borrow/Repay

```solidity
/// @notice Flash loan function — lend tokens for the duration of one transaction.
function flashLoan(
    address receiver,
    uint256 amount,
    bytes calldata data
) external {
    uint256 balanceBefore = asset.balanceOf(address(this));
    require(balanceBefore >= amount, "insufficient liquidity");

    uint256 fee = (amount * 5) / 10000; // 0.05% fee

    asset.transfer(receiver, amount);

    // Callback — receiver must repay amount + fee
    IFlashLoanReceiver(receiver).executeOperation(
        address(asset),
        amount,
        fee,
        msg.sender,
        data
    );

    uint256 balanceAfter = asset.balanceOf(address(this));
    require(balanceAfter >= balanceBefore + fee, "flash loan not repaid");

    totalReserves += fee;
}

interface IFlashLoanReceiver {
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 fee,
        address initiator,
        bytes calldata data
    ) external returns (bool);
}
```

---

## Complete Template

### Foundry Test

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/SimpleLendingPool.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract SimpleLendingPoolTest is Test {
    SimpleLendingPool pool;
    MockERC20 asset;     // USDC-like
    MockERC20 collateral; // ETH-like

    address alice = makeAddr("alice");   // depositor
    address bob = makeAddr("bob");       // borrower
    address charlie = makeAddr("charlie"); // liquidator

    function setUp() public {
        asset = new MockERC20("USD Coin", "USDC");
        collateral = new MockERC20("Wrapped Ether", "WETH");

        pool = new SimpleLendingPool(address(asset), address(collateral));

        // Fund accounts
        asset.mint(alice, 1_000_000e18);
        asset.mint(charlie, 100_000e18);
        collateral.mint(bob, 100e18);
    }

    function test_DepositAndWithdraw() public {
        vm.startPrank(alice);
        asset.approve(address(pool), 100_000e18);
        uint256 shares = pool.deposit(100_000e18);

        assertGt(shares, 0);
        assertEq(pool.balanceOf(alice), shares);

        uint256 withdrawn = pool.withdraw(shares);
        assertEq(withdrawn, 100_000e18);
        assertEq(pool.balanceOf(alice), 0);
        vm.stopPrank();
    }

    function test_BorrowAndRepay() public {
        // Alice deposits USDC
        vm.startPrank(alice);
        asset.approve(address(pool), 500_000e18);
        pool.deposit(500_000e18);
        vm.stopPrank();

        // Bob deposits collateral and borrows
        vm.startPrank(bob);
        collateral.approve(address(pool), 10e18);
        pool.depositCollateral(10e18);

        // With 75% collateral factor, can borrow up to 7.5 (simplified 1:1 pricing)
        pool.borrow(7e18);
        assertEq(asset.balanceOf(bob), 7e18);

        // Repay
        asset.approve(address(pool), 7e18);
        pool.repay(7e18);
        assertEq(pool.borrowBalance(bob), 0);
        vm.stopPrank();
    }

    function test_CannotBorrowOverLimit() public {
        vm.startPrank(alice);
        asset.approve(address(pool), 500_000e18);
        pool.deposit(500_000e18);
        vm.stopPrank();

        vm.startPrank(bob);
        collateral.approve(address(pool), 10e18);
        pool.depositCollateral(10e18);

        // Try to borrow more than collateral allows
        vm.expectRevert("undercollateralized");
        pool.borrow(8e18); // 80% > 75% collateral factor
        vm.stopPrank();
    }

    function test_HealthFactor() public {
        vm.startPrank(alice);
        asset.approve(address(pool), 500_000e18);
        pool.deposit(500_000e18);
        vm.stopPrank();

        vm.startPrank(bob);
        collateral.approve(address(pool), 10e18);
        pool.depositCollateral(10e18);
        pool.borrow(5e18);
        vm.stopPrank();

        uint256 hf = pool.healthFactor(bob);
        // health = (10 * 0.80) / 5 = 1.6 -> 1.6e18
        assertEq(hf, 1.6e18);
    }

    function test_InterestAccrual() public {
        vm.startPrank(alice);
        asset.approve(address(pool), 500_000e18);
        pool.deposit(500_000e18);
        vm.stopPrank();

        vm.startPrank(bob);
        collateral.approve(address(pool), 100e18);
        pool.depositCollateral(100e18);
        pool.borrow(50e18);
        vm.stopPrank();

        // Advance 1 year
        vm.warp(block.timestamp + 365 days);
        pool.accrueInterest();

        // Borrow balance should have increased due to interest
        // The exact amount depends on the interest rate model
        assertGt(pool.totalBorrowed(), 50e18);
    }
}
```
