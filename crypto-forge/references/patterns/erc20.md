# ERC-20 Token Patterns

## Basic ERC-20

Minimal ERC-20 using OpenZeppelin. This is the starting point for any token.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BasicToken is ERC20, Ownable {
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply
    ) ERC20(name, symbol) Ownable(msg.sender) {
        _mint(msg.sender, initialSupply * 10 ** decimals());
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
```

---

## Tax Token

Override `_update` (OpenZeppelin v5) to collect a percentage tax on buys and sells. Commonly used for meme tokens and revenue-sharing tokens.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TaxToken is ERC20, Ownable {
    uint256 public buyTaxBps;   // e.g. 500 = 5%
    uint256 public sellTaxBps;  // e.g. 500 = 5%
    address public taxRecipient;

    mapping(address => bool) public isExempt;
    mapping(address => bool) public isDexPair; // known DEX pair addresses

    constructor(
        string memory name,
        string memory symbol,
        uint256 supply,
        uint256 _buyTaxBps,
        uint256 _sellTaxBps,
        address _taxRecipient
    ) ERC20(name, symbol) Ownable(msg.sender) {
        require(_buyTaxBps <= 2500 && _sellTaxBps <= 2500, "tax too high"); // max 25%
        buyTaxBps = _buyTaxBps;
        sellTaxBps = _sellTaxBps;
        taxRecipient = _taxRecipient;

        isExempt[msg.sender] = true;
        isExempt[_taxRecipient] = true;

        _mint(msg.sender, supply * 10 ** decimals());
    }

    function setDexPair(address pair, bool status) external onlyOwner {
        isDexPair[pair] = status;
    }

    function setExempt(address account, bool status) external onlyOwner {
        isExempt[account] = status;
    }

    function setTaxes(uint256 _buyTaxBps, uint256 _sellTaxBps) external onlyOwner {
        require(_buyTaxBps <= 2500 && _sellTaxBps <= 2500, "tax too high");
        buyTaxBps = _buyTaxBps;
        sellTaxBps = _sellTaxBps;
    }

    function _update(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        if (isExempt[from] || isExempt[to]) {
            super._update(from, to, amount);
            return;
        }

        uint256 taxBps;
        if (isDexPair[from]) {
            // Buying from DEX
            taxBps = buyTaxBps;
        } else if (isDexPair[to]) {
            // Selling to DEX
            taxBps = sellTaxBps;
        }

        if (taxBps > 0) {
            uint256 taxAmount = (amount * taxBps) / 10000;
            super._update(from, taxRecipient, taxAmount);
            super._update(from, to, amount - taxAmount);
        } else {
            super._update(from, to, amount);
        }
    }
}
```

---

## Burn Mechanism

### Auto-Burn on Transfer

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract DeflationaryToken is ERC20 {
    uint256 public burnRateBps; // e.g. 100 = 1%

    constructor(
        string memory name,
        string memory symbol,
        uint256 supply,
        uint256 _burnRateBps
    ) ERC20(name, symbol) {
        require(_burnRateBps <= 1000, "burn rate too high"); // max 10%
        burnRateBps = _burnRateBps;
        _mint(msg.sender, supply * 10 ** decimals());
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (from == address(0) || to == address(0)) {
            // Mint or explicit burn — no auto-burn
            super._update(from, to, amount);
            return;
        }

        uint256 burnAmount = (amount * burnRateBps) / 10000;
        super._update(from, address(0), burnAmount);      // burn
        super._update(from, to, amount - burnAmount);       // transfer remainder
    }
}
```

### Deflationary Supply Cap

```solidity
// Stop burning once supply reaches a floor (e.g. 50% of initial supply)
uint256 public immutable supplyFloor;

constructor(/* ... */, uint256 _supplyFloorPercent) {
    supplyFloor = (supply * 10 ** decimals() * _supplyFloorPercent) / 100;
}

function _update(address from, address to, uint256 amount) internal override {
    if (from != address(0) && to != address(0) && totalSupply() > supplyFloor) {
        uint256 burnAmount = (amount * burnRateBps) / 10000;
        if (totalSupply() - burnAmount < supplyFloor) {
            burnAmount = totalSupply() - supplyFloor;
        }
        if (burnAmount > 0) {
            super._update(from, address(0), burnAmount);
        }
        super._update(from, to, amount - burnAmount);
    } else {
        super._update(from, to, amount);
    }
}
```

---

## Mint Patterns

### Capped Supply

```solidity
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";

contract CappedToken is ERC20Capped, Ownable {
    constructor(string memory name, string memory symbol, uint256 cap)
        ERC20(name, symbol)
        ERC20Capped(cap * 10 ** 18)
        Ownable(msg.sender)
    {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount); // reverts if totalSupply + amount > cap
    }
}
```

### Scheduled Mint with Vesting

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract VestingToken is ERC20, Ownable {
    struct VestingSchedule {
        uint256 totalAmount;
        uint256 released;
        uint256 startTime;
        uint256 duration;  // in seconds
    }

    mapping(address => VestingSchedule) public vestingSchedules;

    constructor(string memory name, string memory symbol, uint256 supply)
        ERC20(name, symbol) Ownable(msg.sender)
    {
        _mint(address(this), supply * 10 ** decimals()); // mint to contract
    }

    function createVesting(
        address beneficiary,
        uint256 amount,
        uint256 duration
    ) external onlyOwner {
        require(vestingSchedules[beneficiary].totalAmount == 0, "schedule exists");
        vestingSchedules[beneficiary] = VestingSchedule({
            totalAmount: amount,
            released: 0,
            startTime: block.timestamp,
            duration: duration
        });
    }

    function release() external {
        VestingSchedule storage schedule = vestingSchedules[msg.sender];
        require(schedule.totalAmount > 0, "no vesting schedule");

        uint256 elapsed = block.timestamp - schedule.startTime;
        uint256 vested;
        if (elapsed >= schedule.duration) {
            vested = schedule.totalAmount;
        } else {
            vested = (schedule.totalAmount * elapsed) / schedule.duration;
        }

        uint256 releasable = vested - schedule.released;
        require(releasable > 0, "nothing to release");

        schedule.released += releasable;
        _transfer(address(this), msg.sender, releasable);
    }
}
```

---

## Pausable

Emergency stop pattern using OpenZeppelin Pausable.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PausableToken is ERC20, Pausable, Ownable {
    constructor(string memory name, string memory symbol, uint256 supply)
        ERC20(name, symbol) Ownable(msg.sender)
    {
        _mint(msg.sender, supply * 10 ** decimals());
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _update(address from, address to, uint256 amount) internal override {
        require(!paused(), "transfers paused");
        super._update(from, to, amount);
    }
}
```

---

## Permit (ERC-2612)

Gasless approvals: the token holder signs an off-chain message, and a third party submits the `permit` transaction.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PermitToken is ERC20Permit, Ownable {
    constructor(string memory name, string memory symbol, uint256 supply)
        ERC20(name, symbol)
        ERC20Permit(name)
        Ownable(msg.sender)
    {
        _mint(msg.sender, supply * 10 ** decimals());
    }
}
```

### Using Permit in TypeScript (viem)

```typescript
import { createWalletClient, http, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount("0x...");
const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http(),
});

// Sign a permit message (EIP-712 typed data)
const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour

const signature = await walletClient.signTypedData({
  domain: {
    name: "MyToken",
    version: "1",
    chainId: 1,
    verifyingContract: "0x...tokenAddress",
  },
  types: {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  },
  primaryType: "Permit",
  message: {
    owner: account.address,
    spender: "0x...routerAddress",
    value: parseUnits("1000", 18),
    nonce: 0n, // fetch from token.nonces(owner)
    deadline,
  },
});
```

---

## Complete Template

A full-featured ERC-20 combining multiple patterns.

### Solidity Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title FeaturedToken
/// @notice ERC-20 with capped supply, burn, pause, permit, and transfer tax.
contract FeaturedToken is ERC20, ERC20Burnable, ERC20Permit, ERC20Capped, Pausable, Ownable {
    uint256 public taxBps; // transfer tax in basis points
    address public taxRecipient;
    mapping(address => bool) public taxExempt;

    event TaxUpdated(uint256 newTaxBps);
    event TaxRecipientUpdated(address newRecipient);

    constructor(
        string memory name,
        string memory symbol,
        uint256 cap,
        uint256 initialMint,
        uint256 _taxBps,
        address _taxRecipient
    )
        ERC20(name, symbol)
        ERC20Permit(name)
        ERC20Capped(cap * 10 ** 18)
        Ownable(msg.sender)
    {
        require(_taxBps <= 1000, "tax > 10%");
        require(_taxRecipient != address(0), "zero address");

        taxBps = _taxBps;
        taxRecipient = _taxRecipient;
        taxExempt[msg.sender] = true;
        taxExempt[_taxRecipient] = true;

        _mint(msg.sender, initialMint * 10 ** decimals());
    }

    // ── Admin ──────────────────────────────────────────────
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function setTax(uint256 _taxBps) external onlyOwner {
        require(_taxBps <= 1000, "tax > 10%");
        taxBps = _taxBps;
        emit TaxUpdated(_taxBps);
    }

    function setTaxRecipient(address _recipient) external onlyOwner {
        require(_recipient != address(0), "zero address");
        taxRecipient = _recipient;
        emit TaxRecipientUpdated(_recipient);
    }

    function setTaxExempt(address account, bool exempt) external onlyOwner {
        taxExempt[account] = exempt;
    }

    // ── Overrides ──────────────────────────────────────────
    function _update(address from, address to, uint256 amount)
        internal override(ERC20, ERC20Capped)
    {
        require(!paused() || from == address(0), "transfers paused");

        if (taxBps > 0 && from != address(0) && to != address(0)
            && !taxExempt[from] && !taxExempt[to])
        {
            uint256 tax = (amount * taxBps) / 10000;
            super._update(from, taxRecipient, tax);
            super._update(from, to, amount - tax);
        } else {
            super._update(from, to, amount);
        }
    }
}
```

### Hardhat Test

```typescript
import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("FeaturedToken", function () {
  async function deployFixture() {
    const [owner, alice, bob, taxWallet] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("FeaturedToken");
    const token = await Token.deploy(
      "FeaturedToken",
      "FTK",
      1_000_000,    // cap: 1M tokens
      100_000,      // initial mint: 100k tokens
      500,          // tax: 5%
      taxWallet.address
    );

    return { token, owner, alice, bob, taxWallet };
  }

  it("should mint initial supply to owner", async function () {
    const { token, owner } = await loadFixture(deployFixture);
    expect(await token.balanceOf(owner.address)).to.equal(
      ethers.parseEther("100000")
    );
  });

  it("should collect tax on transfer", async function () {
    const { token, owner, alice, taxWallet } = await loadFixture(deployFixture);

    // Owner is tax-exempt, so transfer to alice first
    await token.transfer(alice.address, ethers.parseEther("1000"));

    // Alice -> Bob should incur 5% tax
    const { token: t2, bob } = await loadFixture(deployFixture);
    const tokenAsAlice = token.connect(alice);
    await tokenAsAlice.transfer(bob.address, ethers.parseEther("100"));

    // Bob receives 95, taxWallet receives 5
    expect(await token.balanceOf(bob.address)).to.equal(
      ethers.parseEther("95")
    );
    expect(await token.balanceOf(taxWallet.address)).to.equal(
      ethers.parseEther("5")
    );
  });

  it("should not exceed cap", async function () {
    const { token, owner, alice } = await loadFixture(deployFixture);
    const cap = ethers.parseEther("1000000");

    await expect(
      token.mint(alice.address, cap) // would exceed cap
    ).to.be.revertedWithCustomError(token, "ERC20ExceededCap");
  });

  it("should pause and unpause", async function () {
    const { token, owner, alice } = await loadFixture(deployFixture);
    await token.transfer(alice.address, ethers.parseEther("100"));

    await token.pause();
    const tokenAsAlice = token.connect(alice);
    await expect(
      tokenAsAlice.transfer(owner.address, ethers.parseEther("10"))
    ).to.be.reverted;

    await token.unpause();
    await expect(
      tokenAsAlice.transfer(owner.address, ethers.parseEther("10"))
    ).not.to.be.reverted;
  });

  it("should allow burning", async function () {
    const { token, owner } = await loadFixture(deployFixture);
    const before = await token.totalSupply();
    await token.burn(ethers.parseEther("100"));
    expect(await token.totalSupply()).to.equal(
      before - ethers.parseEther("100")
    );
  });
});
```

### Foundry Test

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/FeaturedToken.sol";

contract FeaturedTokenTest is Test {
    FeaturedToken token;
    address owner = address(this);
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address taxWallet = makeAddr("taxWallet");

    function setUp() public {
        token = new FeaturedToken(
            "FeaturedToken",
            "FTK",
            1_000_000,    // cap
            100_000,      // initial mint
            500,          // 5% tax
            taxWallet
        );
    }

    function test_InitialBalance() public view {
        assertEq(token.balanceOf(owner), 100_000 * 1e18);
    }

    function test_TaxOnTransfer() public {
        // Owner is exempt, so first send to alice
        token.transfer(alice, 1000e18);

        // Alice is not exempt — transfer should incur 5% tax
        vm.prank(alice);
        token.transfer(bob, 100e18);

        assertEq(token.balanceOf(bob), 95e18);       // 95% to bob
        assertEq(token.balanceOf(taxWallet), 5e18);   // 5% to tax wallet
    }

    function test_CapEnforced() public {
        uint256 remaining = token.cap() - token.totalSupply();
        vm.expectRevert();
        token.mint(alice, remaining + 1);
    }

    function test_PauseUnpause() public {
        token.transfer(alice, 100e18);
        token.pause();

        vm.prank(alice);
        vm.expectRevert("transfers paused");
        token.transfer(bob, 10e18);

        token.unpause();

        vm.prank(alice);
        token.transfer(bob, 10e18);
        assertGt(token.balanceOf(bob), 0);
    }

    function test_Burn() public {
        uint256 supplyBefore = token.totalSupply();
        token.burn(100e18);
        assertEq(token.totalSupply(), supplyBefore - 100e18);
    }

    function test_OnlyOwnerCanMint() public {
        vm.prank(alice);
        vm.expectRevert();
        token.mint(alice, 1000e18);
    }
}
```
