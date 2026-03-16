# Staking Patterns

## Basic Staking

### Stake / Unstake

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title BasicStaking
/// @notice Stake token A, earn rewards distributed per second.
contract BasicStaking {
    using SafeERC20 for IERC20;

    IERC20 public immutable stakingToken;
    IERC20 public immutable rewardToken;

    uint256 public totalStaked;
    mapping(address => uint256) public stakedBalance;

    constructor(address _stakingToken, address _rewardToken) {
        stakingToken = IERC20(_stakingToken);
        rewardToken = IERC20(_rewardToken);
    }

    function stake(uint256 amount) external {
        require(amount > 0, "zero amount");
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        stakedBalance[msg.sender] += amount;
        totalStaked += amount;
    }

    function unstake(uint256 amount) external {
        require(amount > 0 && stakedBalance[msg.sender] >= amount, "bad amount");
        stakedBalance[msg.sender] -= amount;
        totalStaked -= amount;
        stakingToken.safeTransfer(msg.sender, amount);
    }
}
```

---

## Reward Calculation

### Synthetix StakingRewards Pattern

The standard pattern used across DeFi. Rewards accrue per token staked, tracked via `rewardPerTokenStored`.

```
rewardPerToken = rewardPerTokenStored + (
    (lastTimeRewardApplicable - lastUpdateTime) * rewardRate * 1e18 / totalStaked
)

earned(user) = stakedBalance[user] * (rewardPerToken - userRewardPerTokenPaid[user]) / 1e18
               + rewards[user]
```

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title StakingRewards
/// @notice Synthetix-style staking rewards with per-second distribution.
contract StakingRewards {
    using SafeERC20 for IERC20;

    IERC20 public immutable stakingToken;
    IERC20 public immutable rewardToken;
    address public owner;

    // Reward state
    uint256 public rewardRate;            // rewards per second
    uint256 public rewardPerTokenStored;  // accumulated rewards per staked token
    uint256 public lastUpdateTime;
    uint256 public periodFinish;          // when current reward period ends

    // Staking state
    uint256 public totalStaked;
    mapping(address => uint256) public stakedBalance;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event RewardAdded(uint256 reward, uint256 duration);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    constructor(address _stakingToken, address _rewardToken) {
        stakingToken = IERC20(_stakingToken);
        rewardToken = IERC20(_rewardToken);
        owner = msg.sender;
    }

    // ── Views ──────────────────────────────────────────────

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function rewardPerToken() public view returns (uint256) {
        if (totalStaked == 0) return rewardPerTokenStored;
        return rewardPerTokenStored + (
            (lastTimeRewardApplicable() - lastUpdateTime) * rewardRate * 1e18 / totalStaked
        );
    }

    function earned(address account) public view returns (uint256) {
        return (
            stakedBalance[account] *
            (rewardPerToken() - userRewardPerTokenPaid[account]) / 1e18
        ) + rewards[account];
    }

    // ── User Actions ───────────────────────────────────────

    function stake(uint256 amount) external updateReward(msg.sender) {
        require(amount > 0, "zero amount");
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        stakedBalance[msg.sender] += amount;
        totalStaked += amount;
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external updateReward(msg.sender) {
        require(amount > 0 && stakedBalance[msg.sender] >= amount, "bad amount");
        stakedBalance[msg.sender] -= amount;
        totalStaked -= amount;
        stakingToken.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    function claimReward() external updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            rewardToken.safeTransfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    // ── Admin ──────────────────────────────────────────────

    /// @notice Set reward rate for a given duration.
    /// @param reward Total reward tokens to distribute.
    /// @param duration Duration in seconds.
    function notifyRewardAmount(uint256 reward, uint256 duration)
        external onlyOwner updateReward(address(0))
    {
        require(duration > 0, "zero duration");

        rewardToken.safeTransferFrom(msg.sender, address(this), reward);

        if (block.timestamp >= periodFinish) {
            rewardRate = reward / duration;
        } else {
            uint256 remaining = periodFinish - block.timestamp;
            uint256 leftover = remaining * rewardRate;
            rewardRate = (leftover + reward) / duration;
        }

        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + duration;

        emit RewardAdded(reward, duration);
    }
}
```

---

## Timelock

### Minimum Staking Period

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract TimelockStaking {
    using SafeERC20 for IERC20;

    IERC20 public immutable stakingToken;

    uint256 public constant MIN_LOCK_DURATION = 7 days;
    uint256 public constant EARLY_UNSTAKE_PENALTY_BPS = 1000; // 10%
    address public penaltyReceiver;

    struct StakeInfo {
        uint256 amount;
        uint256 stakedAt;
        uint256 lockUntil;
    }

    mapping(address => StakeInfo) public stakes;
    uint256 public totalStaked;

    event Staked(address indexed user, uint256 amount, uint256 lockUntil);
    event Unstaked(address indexed user, uint256 amount, uint256 penalty);

    constructor(address _stakingToken, address _penaltyReceiver) {
        stakingToken = IERC20(_stakingToken);
        penaltyReceiver = _penaltyReceiver;
    }

    function stake(uint256 amount, uint256 lockDuration) external {
        require(amount > 0, "zero amount");
        require(lockDuration >= MIN_LOCK_DURATION, "lock too short");
        require(stakes[msg.sender].amount == 0, "already staked");

        stakingToken.safeTransferFrom(msg.sender, address(this), amount);

        stakes[msg.sender] = StakeInfo({
            amount: amount,
            stakedAt: block.timestamp,
            lockUntil: block.timestamp + lockDuration
        });
        totalStaked += amount;

        emit Staked(msg.sender, amount, block.timestamp + lockDuration);
    }

    function unstake() external {
        StakeInfo storage info = stakes[msg.sender];
        require(info.amount > 0, "nothing staked");

        uint256 amount = info.amount;
        uint256 penalty = 0;

        if (block.timestamp < info.lockUntil) {
            // Early unstake — apply penalty
            penalty = (amount * EARLY_UNSTAKE_PENALTY_BPS) / 10000;
            stakingToken.safeTransfer(penaltyReceiver, penalty);
        }

        totalStaked -= amount;
        delete stakes[msg.sender];

        stakingToken.safeTransfer(msg.sender, amount - penalty);

        emit Unstaked(msg.sender, amount - penalty, penalty);
    }

    function timeUntilUnlock(address user) external view returns (uint256) {
        if (block.timestamp >= stakes[user].lockUntil) return 0;
        return stakes[user].lockUntil - block.timestamp;
    }
}
```

### Withdrawal Delay

Alternative: allow unstake anytime, but tokens are only claimable after a cooldown.

```solidity
uint256 public constant COOLDOWN_PERIOD = 3 days;

mapping(address => uint256) public unstakeRequestedAt;
mapping(address => uint256) public pendingWithdrawal;

function requestUnstake(uint256 amount) external {
    require(stakedBalance[msg.sender] >= amount, "insufficient");
    stakedBalance[msg.sender] -= amount;
    totalStaked -= amount;
    pendingWithdrawal[msg.sender] += amount;
    unstakeRequestedAt[msg.sender] = block.timestamp;
}

function completeUnstake() external {
    require(pendingWithdrawal[msg.sender] > 0, "no pending");
    require(
        block.timestamp >= unstakeRequestedAt[msg.sender] + COOLDOWN_PERIOD,
        "cooldown active"
    );

    uint256 amount = pendingWithdrawal[msg.sender];
    pendingWithdrawal[msg.sender] = 0;
    stakingToken.safeTransfer(msg.sender, amount);
}
```

---

## Multi-Token Staking

### Stake Token A, Earn Token B

The Synthetix StakingRewards pattern (above) already supports this — just deploy with different `stakingToken` and `rewardToken` addresses.

### Stake Token A, Earn Multiple Reward Tokens

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title MultiRewardStaking
/// @notice Stake one token, earn multiple reward tokens simultaneously.
contract MultiRewardStaking {
    using SafeERC20 for IERC20;

    IERC20 public immutable stakingToken;
    address public owner;

    uint256 public totalStaked;
    mapping(address => uint256) public stakedBalance;

    struct RewardInfo {
        IERC20 token;
        uint256 rewardRate;
        uint256 rewardPerTokenStored;
        uint256 lastUpdateTime;
        uint256 periodFinish;
    }

    RewardInfo[] public rewardInfos;
    // rewardIndex -> user -> paid amount
    mapping(uint256 => mapping(address => uint256)) public userRewardPerTokenPaid;
    mapping(uint256 => mapping(address => uint256)) public rewards;

    constructor(address _stakingToken) {
        stakingToken = IERC20(_stakingToken);
        owner = msg.sender;
    }

    function addRewardToken(address token) external {
        require(msg.sender == owner, "not owner");
        rewardInfos.push(RewardInfo({
            token: IERC20(token),
            rewardRate: 0,
            rewardPerTokenStored: 0,
            lastUpdateTime: block.timestamp,
            periodFinish: block.timestamp
        }));
    }

    modifier updateAllRewards(address account) {
        for (uint256 i = 0; i < rewardInfos.length; i++) {
            RewardInfo storage info = rewardInfos[i];
            info.rewardPerTokenStored = _rewardPerToken(i);
            info.lastUpdateTime = _lastTimeApplicable(i);
            if (account != address(0)) {
                rewards[i][account] = _earned(i, account);
                userRewardPerTokenPaid[i][account] = info.rewardPerTokenStored;
            }
        }
        _;
    }

    function stake(uint256 amount) external updateAllRewards(msg.sender) {
        require(amount > 0, "zero");
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        stakedBalance[msg.sender] += amount;
        totalStaked += amount;
    }

    function unstake(uint256 amount) external updateAllRewards(msg.sender) {
        require(stakedBalance[msg.sender] >= amount, "insufficient");
        stakedBalance[msg.sender] -= amount;
        totalStaked -= amount;
        stakingToken.safeTransfer(msg.sender, amount);
    }

    function claimAll() external updateAllRewards(msg.sender) {
        for (uint256 i = 0; i < rewardInfos.length; i++) {
            uint256 reward = rewards[i][msg.sender];
            if (reward > 0) {
                rewards[i][msg.sender] = 0;
                rewardInfos[i].token.safeTransfer(msg.sender, reward);
            }
        }
    }

    function _lastTimeApplicable(uint256 idx) internal view returns (uint256) {
        return block.timestamp < rewardInfos[idx].periodFinish
            ? block.timestamp
            : rewardInfos[idx].periodFinish;
    }

    function _rewardPerToken(uint256 idx) internal view returns (uint256) {
        if (totalStaked == 0) return rewardInfos[idx].rewardPerTokenStored;
        return rewardInfos[idx].rewardPerTokenStored + (
            (_lastTimeApplicable(idx) - rewardInfos[idx].lastUpdateTime)
            * rewardInfos[idx].rewardRate * 1e18 / totalStaked
        );
    }

    function _earned(uint256 idx, address account) internal view returns (uint256) {
        return (
            stakedBalance[account]
            * (_rewardPerToken(idx) - userRewardPerTokenPaid[idx][account])
            / 1e18
        ) + rewards[idx][account];
    }
}
```

---

## Compounding

### Auto-Compound via Restake

When the reward token is the same as the staking token, users (or a keeper) can call `compound()` to claim rewards and immediately restake them.

```solidity
/// @notice Claim accrued rewards and restake them (only when staking token == reward token).
function compound() external updateReward(msg.sender) {
    require(address(stakingToken) == address(rewardToken), "tokens differ");

    uint256 reward = rewards[msg.sender];
    require(reward > 0, "nothing to compound");

    rewards[msg.sender] = 0;

    // Instead of transferring out and back, just increase staked balance
    stakedBalance[msg.sender] += reward;
    totalStaked += reward;

    emit Staked(msg.sender, reward);
    emit RewardPaid(msg.sender, reward);
}
```

### Keeper-Based Auto-Compound

```typescript
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const STAKING_ABI = parseAbi([
  "function earned(address account) view returns (uint256)",
  "function compound() external",
]);

async function autoCompound(
  stakingAddress: `0x${string}`,
  users: `0x${string}`[],
  minRewardThreshold: bigint
) {
  const client = createPublicClient({ chain: mainnet, transport: http() });
  const account = privateKeyToAccount(process.env.KEEPER_KEY as `0x${string}`);
  const wallet = createWalletClient({ account, chain: mainnet, transport: http() });

  for (const user of users) {
    const earned = await client.readContract({
      address: stakingAddress,
      abi: STAKING_ABI,
      functionName: "earned",
      args: [user],
    });

    if (earned >= minRewardThreshold) {
      // In practice, the user would need to have authorized the keeper
      // or the contract would have a compoundFor(address) function
      console.log(`Compounding ${earned} for ${user}`);
    }
  }
}
```

---

## Vault (ERC-4626)

### Tokenized Vault Standard

ERC-4626 standardizes yield-bearing vaults with a share-based accounting system.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title StakingVault
/// @notice ERC-4626 vault that stakes deposited tokens and distributes rewards.
contract StakingVault is ERC4626 {
    address public owner;
    uint256 public totalRewards; // track rewards added by owner

    constructor(IERC20 asset)
        ERC4626(asset)
        ERC20("Staking Vault Share", "svSHARE")
    {
        owner = msg.sender;
    }

    /// @notice Owner adds rewards to increase share value.
    function addRewards(uint256 amount) external {
        require(msg.sender == owner, "not owner");
        IERC20(asset()).transferFrom(msg.sender, address(this), amount);
        totalRewards += amount;
        // Share price automatically increases because totalAssets() grows
        // while totalSupply() stays the same
    }

    /// @notice Total assets = deposits + rewards.
    function totalAssets() public view override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }
}
```

### Share-Based Accounting

```
shares = deposit * totalShares / totalAssets
assets = redeem * totalAssets / totalShares

Example:
  Initial: Alice deposits 1000 USDC, gets 1000 shares
  Owner adds 100 USDC rewards -> totalAssets = 1100, totalShares = 1000
  Alice's shares are worth: 1000 * 1100 / 1000 = 1100 USDC (10% profit)
  Bob deposits 1100 USDC, gets: 1100 * 1000 / 1100 = 1000 shares
```

### ERC-4626 Operations

```solidity
// deposit: user sends assets, receives shares
uint256 shares = vault.deposit(1000e18, msg.sender);

// mint: user specifies shares wanted, sends exact assets needed
uint256 assetsNeeded = vault.mint(500e18, msg.sender);

// withdraw: user specifies assets wanted, burns required shares
uint256 sharesBurned = vault.withdraw(1000e18, msg.sender, msg.sender);

// redeem: user sends shares, receives proportional assets
uint256 assetsReceived = vault.redeem(500e18, msg.sender, msg.sender);

// Preview functions (view-only, show expected results):
vault.previewDeposit(1000e18);   // -> shares you'd receive
vault.previewMint(500e18);       // -> assets you'd need
vault.previewWithdraw(1000e18);  // -> shares that would burn
vault.previewRedeem(500e18);     // -> assets you'd receive
```

### TypeScript Integration

```typescript
import { createPublicClient, http, parseAbi, formatUnits, parseUnits } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });

const VAULT_ABI = parseAbi([
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function previewDeposit(uint256 assets) view returns (uint256)",
  "function previewRedeem(uint256 shares) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function deposit(uint256 assets, address receiver) returns (uint256)",
  "function redeem(uint256 shares, address receiver, address owner) returns (uint256)",
]);

async function getVaultAPY(vaultAddress: `0x${string}`): Promise<number> {
  const [totalAssets, totalSupply] = await Promise.all([
    client.readContract({ address: vaultAddress, abi: VAULT_ABI, functionName: "totalAssets" }),
    client.readContract({ address: vaultAddress, abi: VAULT_ABI, functionName: "totalSupply" }),
  ]);

  if (totalSupply === 0n) return 0;

  // Share price = totalAssets / totalSupply
  const sharePrice = Number(totalAssets) / Number(totalSupply);

  // APY would require tracking share price over time
  // sharePrice > 1.0 means the vault has earned yield
  return (sharePrice - 1) * 100; // simplified — real APY needs time component
}

async function getUserPosition(
  vaultAddress: `0x${string}`,
  user: `0x${string}`
): Promise<{ shares: bigint; underlyingValue: bigint }> {
  const shares = await client.readContract({
    address: vaultAddress,
    abi: VAULT_ABI,
    functionName: "balanceOf",
    args: [user],
  });

  const underlyingValue = await client.readContract({
    address: vaultAddress,
    abi: VAULT_ABI,
    functionName: "previewRedeem",
    args: [shares],
  });

  return { shares, underlyingValue };
}
```

---

## Complete Template

Staking contract with Foundry tests.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/StakingRewards.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract StakingRewardsTest is Test {
    StakingRewards staking;
    MockToken stakingToken;
    MockToken rewardToken;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address owner = address(this);

    uint256 constant REWARD_AMOUNT = 100_000e18;
    uint256 constant REWARD_DURATION = 30 days;

    function setUp() public {
        stakingToken = new MockToken("Stake Token", "STK");
        rewardToken = new MockToken("Reward Token", "RWD");

        staking = new StakingRewards(address(stakingToken), address(rewardToken));

        // Fund users
        stakingToken.mint(alice, 1000e18);
        stakingToken.mint(bob, 1000e18);

        // Fund rewards
        rewardToken.mint(owner, REWARD_AMOUNT);
        rewardToken.approve(address(staking), REWARD_AMOUNT);
        staking.notifyRewardAmount(REWARD_AMOUNT, REWARD_DURATION);
    }

    function test_Stake() public {
        vm.startPrank(alice);
        stakingToken.approve(address(staking), 100e18);
        staking.stake(100e18);
        vm.stopPrank();

        assertEq(staking.stakedBalance(alice), 100e18);
        assertEq(staking.totalStaked(), 100e18);
    }

    function test_EarnRewards() public {
        vm.startPrank(alice);
        stakingToken.approve(address(staking), 100e18);
        staking.stake(100e18);
        vm.stopPrank();

        // Advance 1 day
        vm.warp(block.timestamp + 1 days);

        uint256 earned = staking.earned(alice);
        // Expected: 100_000 / 30 = ~3,333 tokens per day
        assertGt(earned, 3300e18);
        assertLt(earned, 3400e18);
    }

    function test_ClaimReward() public {
        vm.startPrank(alice);
        stakingToken.approve(address(staking), 100e18);
        staking.stake(100e18);
        vm.stopPrank();

        vm.warp(block.timestamp + 1 days);

        vm.prank(alice);
        staking.claimReward();

        assertGt(rewardToken.balanceOf(alice), 3300e18);
        assertEq(staking.earned(alice), 0);
    }

    function test_ProportionalRewards() public {
        // Alice stakes 300, Bob stakes 100 -> Alice gets 75%, Bob gets 25%
        vm.startPrank(alice);
        stakingToken.approve(address(staking), 300e18);
        staking.stake(300e18);
        vm.stopPrank();

        vm.startPrank(bob);
        stakingToken.approve(address(staking), 100e18);
        staking.stake(100e18);
        vm.stopPrank();

        vm.warp(block.timestamp + 1 days);

        uint256 aliceEarned = staking.earned(alice);
        uint256 bobEarned = staking.earned(bob);

        // Alice should earn ~3x Bob
        assertApproxEqRel(aliceEarned, bobEarned * 3, 0.01e18); // 1% tolerance
    }

    function test_Unstake() public {
        vm.startPrank(alice);
        stakingToken.approve(address(staking), 100e18);
        staking.stake(100e18);

        vm.warp(block.timestamp + 1 days);

        staking.unstake(50e18);
        vm.stopPrank();

        assertEq(staking.stakedBalance(alice), 50e18);
        assertEq(stakingToken.balanceOf(alice), 950e18); // 1000 - 100 + 50
    }

    function test_RewardRateChangesWithNewNotify() public {
        vm.startPrank(alice);
        stakingToken.approve(address(staking), 100e18);
        staking.stake(100e18);
        vm.stopPrank();

        // Halfway through the period, add more rewards
        vm.warp(block.timestamp + 15 days);

        rewardToken.mint(owner, REWARD_AMOUNT);
        rewardToken.approve(address(staking), REWARD_AMOUNT);
        staking.notifyRewardAmount(REWARD_AMOUNT, REWARD_DURATION);

        // Rate should have increased (remaining old + new, spread over 30 days)
        assertGt(staking.rewardRate(), REWARD_AMOUNT / REWARD_DURATION);
    }

    function test_NoRewardsAfterPeriodEnds() public {
        vm.startPrank(alice);
        stakingToken.approve(address(staking), 100e18);
        staking.stake(100e18);
        vm.stopPrank();

        // Warp past the reward period
        vm.warp(block.timestamp + 31 days);

        uint256 earnedAtEnd = staking.earned(alice);

        // Warp another 30 days
        vm.warp(block.timestamp + 30 days);

        // Earned should not have changed
        assertEq(staking.earned(alice), earnedAtEnd);
    }
}
```
