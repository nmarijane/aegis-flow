# Solidity Security Checklist

Comprehensive security checklist for smart contract development. Referenced by the `auditor` agent during security audits and by `contract-builder` and `dapp-builder` during code generation.

---

## 1. Reentrancy

### What to check

- External calls are made **after** all state changes (checks-effects-interactions pattern).
- Functions that transfer ETH or call external contracts use `ReentrancyGuard`.
- View functions that read from external contracts are not vulnerable to read-only reentrancy.
- Cross-contract reentrancy vectors exist when multiple contracts share state.

### Why it matters

Reentrancy allows an attacker to re-enter a function before the first invocation completes, draining funds by repeatedly executing a withdrawal before the balance is updated. The DAO hack (2016) exploited exactly this pattern.

### Correct pattern: checks-effects-interactions

```solidity
// WRONG: external call before state update
function withdraw(uint256 amount) external {
    require(balances[msg.sender] >= amount, "Insufficient");
    (bool success, ) = msg.sender.call{value: amount}("");
    require(success, "Transfer failed");
    balances[msg.sender] -= amount; // State update AFTER call — vulnerable
}

// CORRECT: checks-effects-interactions
function withdraw(uint256 amount) external {
    require(balances[msg.sender] >= amount, "Insufficient");  // Check
    balances[msg.sender] -= amount;                            // Effect
    (bool success, ) = msg.sender.call{value: amount}("");     // Interaction
    require(success, "Transfer failed");
}
```

### ReentrancyGuard

```solidity
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Vault is ReentrancyGuard {
    function withdraw(uint256 amount) external nonReentrant {
        require(balances[msg.sender] >= amount, "Insufficient");
        balances[msg.sender] -= amount;
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
    }
}
```

### Read-only reentrancy

When a view function reads state from an external contract mid-execution, the returned value may be stale. This commonly occurs with LP token pricing in lending protocols.

```solidity
// Vulnerable: reads pool reserves during a callback that occurs mid-swap
function getCollateralValue(address pool) public view returns (uint256) {
    // If called during a reentrancy window, reserves may be inconsistent
    (uint112 reserve0, uint112 reserve1, ) = IUniswapV2Pair(pool).getReserves();
    return calculateValue(reserve0, reserve1);
}

// Mitigation: use a TWAP oracle instead of spot reserves,
// or check a reentrancy lock on the external contract
```

### Cross-contract reentrancy

When contract A calls contract B, and B calls back into contract A (or contract C that shares state with A), the shared state may be inconsistent.

```solidity
// Mitigation: use a shared reentrancy lock across related contracts
// or complete all state updates before any external call in the entire call chain
```

---

## 2. Access Control

### What to check

- Administrative functions are protected with `onlyOwner` or role-based access.
- Initializer functions in upgradeable contracts can only be called once.
- Ownership transfer uses two-step pattern to prevent accidental loss.
- Default roles and permissions are explicitly set in the constructor/initializer.

### Why it matters

Missing access control allows anyone to call privileged functions: minting tokens, pausing the protocol, upgrading contracts, or draining admin-controlled funds.

### onlyOwner (OpenZeppelin Ownable)

```solidity
import "@openzeppelin/contracts/access/Ownable.sol";

contract Token is ERC20, Ownable {
    constructor() ERC20("Token", "TKN") Ownable(msg.sender) {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
```

### Role-based access (OpenZeppelin AccessControl)

```solidity
import "@openzeppelin/contracts/access/AccessControl.sol";

contract Treasury is AccessControl {
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant WITHDRAWER_ROLE = keccak256("WITHDRAWER_ROLE");

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MANAGER_ROLE, msg.sender);
    }

    function withdraw(address to, uint256 amount) external onlyRole(WITHDRAWER_ROLE) {
        payable(to).transfer(amount);
    }
}
```

### Two-step ownership transfer

```solidity
import "@openzeppelin/contracts/access/Ownable2Step.sol";

contract SafeOwnership is Ownable2Step {
    constructor() Ownable(msg.sender) {}

    // Step 1: current owner calls transferOwnership(newOwner)
    // Step 2: new owner calls acceptOwnership()
    // This prevents transferring ownership to a wrong address
}
```

### Initializer guards (upgradeable contracts)

```solidity
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract VaultV1 is Initializable {
    address public owner;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers(); // Prevent initialization on implementation contract
    }

    function initialize(address _owner) external initializer {
        owner = _owner;
    }
}
```

---

## 3. Integer Overflow / Underflow

### What to check

- Solidity version is >= 0.8.0 (built-in overflow/underflow checks).
- `unchecked` blocks are used only when overflow is mathematically impossible, with a comment explaining why.
- Contracts targeting Solidity < 0.8 use SafeMath.
- Casting between types (e.g., `uint256` to `uint128`) is checked.

### Why it matters

Integer overflow wraps around: `type(uint256).max + 1 == 0`. Before Solidity 0.8, this was silent. Even with 0.8+, `unchecked` blocks reintroduce the risk. Incorrect downcasting can silently truncate values.

### Solidity >= 0.8 default behavior

```solidity
// Solidity 0.8+ reverts automatically on overflow
uint256 a = type(uint256).max;
uint256 b = a + 1; // Reverts with panic code 0x11
```

### Unchecked blocks — use with care

```solidity
// ONLY use unchecked when overflow is mathematically impossible
function increment(uint256 i) internal pure returns (uint256) {
    unchecked {
        // Safe: loop counter bounded by array length which fits in uint256
        return i + 1;
    }
}
```

### Safe downcasting

```solidity
// WRONG: silent truncation
uint128 small = uint128(largeUint256); // Truncates if > type(uint128).max

// CORRECT: use OpenZeppelin SafeCast
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

uint128 small = SafeCast.toUint128(largeUint256); // Reverts if too large
```

### SafeMath (Solidity < 0.8 only)

```solidity
// For legacy contracts on Solidity < 0.8
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

using SafeMath for uint256;

uint256 result = a.add(b); // Reverts on overflow
```

---

## 4. Flash Loan Attacks

### What to check

- Price oracles do not rely on spot prices from a single DEX pool.
- TWAP (time-weighted average price) oracles are used or Chainlink feeds with staleness checks.
- Functions that depend on token balances or reserves are not callable within a single transaction that can manipulate those values.
- Multi-oracle patterns provide fallback and cross-validation.

### Why it matters

Flash loans allow borrowing unlimited capital for a single transaction at zero cost. An attacker can manipulate a DEX pool's spot price, use the manipulated price in a lending protocol, and profit — all atomically. This is the most common DeFi exploit vector.

### Vulnerable: spot price oracle

```solidity
// WRONG: reads spot price from a single pool — flash-loan manipulable
function getPrice() public view returns (uint256) {
    (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
    return (uint256(reserve1) * 1e18) / uint256(reserve0);
}
```

### Chainlink oracle with staleness check

```solidity
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

function getChainlinkPrice(address feed) public view returns (uint256) {
    AggregatorV3Interface priceFeed = AggregatorV3Interface(feed);
    (
        uint80 roundId,
        int256 price,
        ,
        uint256 updatedAt,
        uint80 answeredInRound
    ) = priceFeed.latestRoundData();

    require(price > 0, "Invalid price");
    require(updatedAt > block.timestamp - 3600, "Stale price"); // 1 hour max
    require(answeredInRound >= roundId, "Stale round");

    return uint256(price);
}
```

### TWAP oracle (Uniswap V3)

```solidity
function getTWAP(address pool, uint32 twapInterval) public view returns (int24) {
    uint32[] memory secondsAgos = new uint32[](2);
    secondsAgos[0] = twapInterval; // e.g., 1800 for 30 minutes
    secondsAgos[1] = 0;

    (int56[] memory tickCumulatives, ) = IUniswapV3Pool(pool).observe(secondsAgos);

    int24 avgTick = int24(
        (tickCumulatives[1] - tickCumulatives[0]) / int56(uint56(twapInterval))
    );
    return avgTick;
}
```

### Multi-oracle pattern

```solidity
function getPrice() public view returns (uint256) {
    uint256 chainlinkPrice = getChainlinkPrice(chainlinkFeed);
    uint256 twapPrice = getTWAPPrice(uniswapPool);

    // Require prices to be within 5% of each other
    uint256 diff = chainlinkPrice > twapPrice
        ? chainlinkPrice - twapPrice
        : twapPrice - chainlinkPrice;
    require(diff * 100 / chainlinkPrice <= 5, "Price deviation too high");

    return chainlinkPrice; // Primary source
}
```

---

## 5. Front-running / MEV

### What to check

- Swap functions include a `minAmountOut` (slippage) parameter set by the caller.
- Time-sensitive operations include a `deadline` parameter.
- Commit-reveal schemes are used for auctions, governance votes, or NFT reveals.
- No transaction ordering dependency without protection.

### Why it matters

Transactions in the public mempool are visible before inclusion in a block. Attackers (or MEV bots) can front-run, back-run, or sandwich transactions to extract value. A swap without slippage protection can be sandwiched for 100% of its value.

### Slippage protection

```solidity
function swap(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 minAmountOut,  // Caller-specified minimum output
    uint256 deadline        // Caller-specified deadline
) external {
    require(block.timestamp <= deadline, "Transaction expired");

    uint256 amountOut = _executeSwap(tokenIn, tokenOut, amountIn);
    require(amountOut >= minAmountOut, "Slippage exceeded");

    IERC20(tokenOut).transfer(msg.sender, amountOut);
}
```

### Commit-reveal scheme

```solidity
contract CommitReveal {
    mapping(address => bytes32) public commits;
    mapping(address => uint256) public commitTimestamps;
    uint256 public constant REVEAL_DELAY = 2; // blocks

    // Step 1: commit a hashed bid
    function commit(bytes32 hash) external {
        commits[msg.sender] = hash;
        commitTimestamps[msg.sender] = block.number;
    }

    // Step 2: reveal after delay
    function reveal(uint256 bid, bytes32 salt) external {
        require(
            block.number >= commitTimestamps[msg.sender] + REVEAL_DELAY,
            "Too early"
        );
        require(
            keccak256(abi.encodePacked(bid, salt, msg.sender)) == commits[msg.sender],
            "Invalid reveal"
        );
        delete commits[msg.sender];
        _processBid(msg.sender, bid);
    }
}
```

### Deadline parameter

```solidity
modifier checkDeadline(uint256 deadline) {
    require(block.timestamp <= deadline, "Transaction too old");
    _;
}

function addLiquidity(
    uint256 amountA,
    uint256 amountB,
    uint256 deadline
) external checkDeadline(deadline) {
    // ...
}
```

---

## 6. Gas Optimization

### What to check

- No unbounded loops that iterate over growing arrays or mappings.
- Function parameters use `calldata` instead of `memory` for read-only external function inputs.
- Struct fields are packed to minimize storage slots.
- Boolean checks use short-circuit evaluation.
- State variables that are read multiple times in a function are cached in local variables.

### Why it matters

Gas costs directly affect protocol usability and user costs. Unbounded loops can cause transactions to exceed the block gas limit, making functions permanently uncallable (a denial-of-service vector).

### Unbounded loops — avoid

```solidity
// WRONG: iterates over unbounded array — will hit gas limit
function distributeRewards() external {
    for (uint256 i = 0; i < holders.length; i++) {
        _sendReward(holders[i]);
    }
}

// CORRECT: batch processing with pagination
function distributeRewards(uint256 start, uint256 end) external {
    require(end <= holders.length, "Out of bounds");
    for (uint256 i = start; i < end; i++) {
        _sendReward(holders[i]);
    }
}
```

### Storage vs memory vs calldata

```solidity
// calldata for read-only external function inputs (cheapest)
function processIds(uint256[] calldata ids) external {
    for (uint256 i = 0; i < ids.length; i++) {
        _process(ids[i]);
    }
}

// Cache storage variables in memory
function calculateTotal() external view returns (uint256 total) {
    uint256 len = items.length;    // Cache storage read
    uint256 rate = rewardRate;     // Cache storage read
    for (uint256 i = 0; i < len; i++) {
        total += items[i].amount * rate;
    }
}
```

### Struct packing

```solidity
// WRONG: 3 storage slots (each variable takes a full slot)
struct Order {
    uint256 price;      // slot 0
    address maker;      // slot 1
    uint256 amount;     // slot 2
}

// CORRECT: 2 storage slots (address + uint96 pack into one slot)
struct Order {
    uint256 price;      // slot 0
    address maker;      // slot 1 (20 bytes)
    uint96 amount;      // slot 1 (12 bytes) — packed with maker
}
```

### Short-circuit evaluation

```solidity
// Put the cheapest check first — if it fails, the expensive one is skipped
function validate(address user, uint256 amount) internal view returns (bool) {
    return amount > 0 && isWhitelisted(user); // cheap check first
}
```

---

## 7. Logic Errors

### What to check

- Rounding direction favors the protocol (round down on withdrawals, round up on deposits).
- Multiplication is performed before division to preserve precision.
- Loop bounds are correct (no off-by-one errors).
- Zero-amount operations are handled (zero deposit, zero withdrawal, zero transfer).
- Edge cases: first depositor, last withdrawer, empty pool.

### Why it matters

Logic errors silently drain value over time or create exploitable edge cases. Rounding errors can be amplified by flash loans to steal funds. Division-before-multiplication loses precision to integer truncation.

### Rounding direction

```solidity
// Round DOWN when calculating user's share of tokens (favors protocol)
function previewWithdraw(uint256 assets) public view returns (uint256 shares) {
    uint256 supply = totalSupply();
    return supply == 0 ? assets : (assets * supply) / totalAssets(); // rounds down
}

// Round UP when calculating cost to user (favors protocol)
function previewDeposit(uint256 assets) public view returns (uint256 shares) {
    uint256 supply = totalSupply();
    return supply == 0 ? assets : _divUp(assets * supply, totalAssets()); // rounds up
}

function _divUp(uint256 a, uint256 b) internal pure returns (uint256) {
    return (a + b - 1) / b;
}
```

### Division before multiplication — avoid

```solidity
// WRONG: precision loss due to integer division first
uint256 reward = (amount / totalStaked) * rewardRate;

// CORRECT: multiply first, then divide
uint256 reward = (amount * rewardRate) / totalStaked;
```

### Zero-amount checks

```solidity
function deposit(uint256 amount) external {
    require(amount > 0, "Cannot deposit zero");
    // ...
}

function withdraw(uint256 shares) external {
    require(shares > 0, "Cannot withdraw zero");
    uint256 assets = previewRedeem(shares);
    require(assets > 0, "Zero assets returned");
    // ...
}
```

### First-depositor attack (ERC-4626 vaults)

```solidity
// An attacker can front-run the first depositor by:
// 1. Depositing 1 wei to get 1 share
// 2. Donating a large amount directly to the vault
// 3. The victim's deposit gets rounded down to 0 shares

// Mitigation: virtual shares and assets (OpenZeppelin ERC4626 default)
// or mint dead shares on initialization
constructor() {
    _mint(address(0xdead), 1000); // Dead shares to prevent inflation attack
}
```

---

## 8. Upgradability

### What to check

- Storage layout is consistent between versions (no reordering, no inserting variables before existing ones).
- `__gap` arrays reserve space for future storage variables in base contracts.
- Initializer is used instead of constructor (constructors do not run on proxy storage).
- Implementation contracts have `_disableInitializers()` in the constructor.
- UUPS proxies include upgrade authorization checks.

### Why it matters

Upgradeable contracts use a proxy pattern where storage lives in the proxy and logic lives in the implementation. A storage layout mismatch between versions corrupts data. A missing initializer guard allows anyone to re-initialize and take ownership.

### Storage gaps

```solidity
contract BaseV1 is Initializable {
    uint256 public value;
    address public admin;

    // Reserve 48 slots for future variables in this base contract
    // 50 - 2 (existing variables) = 48
    uint256[48] private __gap;

    function initialize(address _admin) external initializer {
        admin = _admin;
    }
}
```

### UUPS proxy pattern

```solidity
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract VaultV1 is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    uint256 public depositCount;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address owner) external initializer {
        __Ownable_init(owner);
        __UUPSUpgradeable_init();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}

// V2: add new variables AFTER existing ones
contract VaultV2 is VaultV1 {
    uint256 public withdrawCount; // Added after existing storage

    function reinitialize() external reinitializer(2) {
        withdrawCount = 0;
    }
}
```

### Transparent proxy vs UUPS

| Aspect | Transparent Proxy | UUPS |
|--------|------------------|------|
| Upgrade logic location | Proxy contract | Implementation contract |
| Gas cost per call | Higher (admin check on every call) | Lower (no admin check) |
| Upgrade authorization | Proxy admin only | Defined in `_authorizeUpgrade` |
| Risk | Admin key compromise | Forgetting `_authorizeUpgrade` check |
| Recommended for | Simple cases, small teams | Production protocols, gas-sensitive |

---

## 9. External Calls

### What to check

- Return values of low-level `call`, `delegatecall`, and `staticcall` are checked.
- `delegatecall` is never used with untrusted targets.
- ERC-20 `approve` uses the increase/decrease pattern or resets to zero first (approval race condition).
- External contract calls handle the case where the target is not a contract (e.g., self-destructed).

### Why it matters

Unchecked return values from low-level calls silently fail — funds appear sent but are not. `delegatecall` to a malicious contract executes arbitrary code in the caller's context. The ERC-20 approve race condition allows a spender to use both the old and new allowance.

### Low-level call return check

```solidity
// WRONG: ignores return value
payable(recipient).call{value: amount}("");

// CORRECT: check return value
(bool success, ) = payable(recipient).call{value: amount}("");
require(success, "ETH transfer failed");
```

### Safe ERC-20 interactions

```solidity
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

using SafeERC20 for IERC20;

// SafeERC20 handles non-standard tokens (USDT, BNB) that don't return bool
function deposit(IERC20 token, uint256 amount) external {
    token.safeTransferFrom(msg.sender, address(this), amount);
}
```

### Approval race condition

```solidity
// WRONG: if current allowance is 100 and you approve 200,
// spender can spend 100 (old) + 200 (new) = 300

// CORRECT: reset to zero first
token.approve(spender, 0);
token.approve(spender, newAmount);

// BETTER: use increaseAllowance / decreaseAllowance (OpenZeppelin)
// or Permit2 for modern protocols
```

### delegatecall safety

```solidity
// NEVER delegatecall to an address provided by a user or untrusted source
// delegatecall executes foreign code in YOUR storage context

// Only use delegatecall with verified, immutable implementation contracts
// (e.g., in proxy patterns where the implementation address is admin-controlled)
```

---

## 10. Denial of Service

### What to check

- Payments use the pull pattern (users withdraw) rather than push pattern (contract sends).
- No single external call failure can block the entire function.
- Arrays that grow with user actions are bounded or paginated.
- Functions are not vulnerable to gas griefing (attacker forcing high gas consumption).
- Block gas limit cannot be exceeded by any function.

### Why it matters

A denial-of-service vulnerability makes a contract permanently unusable. If a contract pushes ETH to a list of recipients and one recipient is a contract that reverts, the entire distribution is blocked.

### Pull over push

```solidity
// WRONG: push pattern — one failing recipient blocks all
function distributeRewards(address[] calldata recipients, uint256[] calldata amounts) external {
    for (uint256 i = 0; i < recipients.length; i++) {
        // If any transfer fails, entire function reverts
        payable(recipients[i]).transfer(amounts[i]);
    }
}

// CORRECT: pull pattern — each user withdraws independently
mapping(address => uint256) public pendingRewards;

function distributeRewards(address[] calldata recipients, uint256[] calldata amounts) external onlyOwner {
    for (uint256 i = 0; i < recipients.length; i++) {
        pendingRewards[recipients[i]] += amounts[i]; // Just update balances
    }
}

function claimReward() external {
    uint256 amount = pendingRewards[msg.sender];
    require(amount > 0, "Nothing to claim");
    pendingRewards[msg.sender] = 0;
    (bool success, ) = msg.sender.call{value: amount}("");
    require(success, "Transfer failed");
}
```

### Gas griefing protection

```solidity
// When forwarding ETH, limit the gas sent to prevent the recipient
// from consuming all remaining gas
(bool success, ) = recipient.call{value: amount, gas: 10000}("");
// Note: 10000 gas is enough for a simple receive() but not for complex logic

// Alternatively, use address.transfer() which forwards only 2300 gas
// (but this can break with EIP-1884 gas cost changes)
```

### Bounded iterations

```solidity
// Set a maximum array length for user-submitted data
uint256 public constant MAX_BATCH_SIZE = 100;

function batchTransfer(address[] calldata recipients, uint256[] calldata amounts) external {
    require(recipients.length <= MAX_BATCH_SIZE, "Batch too large");
    require(recipients.length == amounts.length, "Length mismatch");
    for (uint256 i = 0; i < recipients.length; i++) {
        _transfer(msg.sender, recipients[i], amounts[i]);
    }
}
```

---

## Quick Reference: Severity Classification

| Severity | Description | Examples |
|----------|-------------|----------|
| **Critical** | Direct fund loss or protocol takeover | Reentrancy, missing access control, oracle manipulation |
| **High** | Likely exploitable under specific conditions | Unchecked return values, unsafe delegatecall, approval race |
| **Medium** | Potential issue requiring specific circumstances | Rounding errors, missing zero-amount checks, gas griefing |
| **Low** | Best practice violation, unlikely exploitation | Suboptimal gas usage, missing events, floating pragma |
| **Info** | Suggestion for improvement | Code style, documentation, natspec comments |
