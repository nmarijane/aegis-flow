---
name: deploy
description: Deploy smart contracts to testnet or mainnet with explorer verification.
argument-hint: [--network ethereum|polygon|arbitrum|base|bsc] [--testnet|--mainnet]
---

# Deploy Contracts

You are deploying smart contracts to a blockchain network.

## Input

Arguments: `$ARGUMENTS`

Parse: optional --network flag (ethereum, polygon, arbitrum, base, bsc), optional --testnet (default) or --mainnet flag.

## Pre-flight: Check Configuration

Read `.claude/crypto-forge.json`. Verify `stack.contracts` is set (hardhat or foundry). If not configured, run setup inline.

**Note:** The `--yes` flag does NOT apply to this skill. Mainnet deployments always require explicit confirmation. Testnet deployments already proceed without extra confirmation.

## Step 1: Detect Contracts

Find compiled contracts:
- **Hardhat**: look in `artifacts/` directory
- **Foundry**: look in `out/` directory

If no compiled contracts found, attempt compilation:
- Hardhat: `npx hardhat compile`
- Foundry: `forge build`

If compilation fails, report errors and STOP.

## Step 2: Check Audit Report

If `.claude/crypto-forge-audit.json` exists:
- Read it and check for findings with severity "Critical"
- If Critical findings exist, display them and warn:
  > ⚠️ The last audit found [N] Critical findings that may not be resolved:
  > - [finding description] in [file]:[line]
  >
  > Do you want to proceed anyway?

This is a WARNING, not a hard block. The user can choose to proceed.

## Step 3: Verify Prerequisites

Check:
- **RPC URL**: verify the `.env` file contains the RPC URL for the target network. If missing, report which env var to set (e.g., `ETH_RPC_URL for Ethereum`)
- **Compilation**: ensure contracts compile without errors
- **Gas estimate**: use the framework's built-in estimation to show estimated deployment cost

## Step 4: Confirm Deployment

- **Testnet**: proceed directly. Show which network and contracts will be deployed.
- **Mainnet**: require EXPLICIT confirmation:
  > 🔴 MAINNET DEPLOYMENT
  >
  > **Network:** [chain name]
  > **Contracts:** [list]
  > **Estimated gas cost:** [estimate]
  >
  > This will deploy to mainnet using real funds. Type "yes" to confirm.

## Step 5: Execute Deployment

Run the deployment command:
- **Hardhat**: `npx hardhat deploy --network <network>` or `npx hardhat run scripts/deploy.ts --network <network>`
- **Foundry**: `forge script script/Deploy.s.sol --broadcast --rpc-url $<RPC_VAR> --verify`

## Step 6: Post-Deployment

After successful deployment:
1. **Save addresses**: write deployed contract addresses to `deployments/<network>.json`
2. **Verify on explorer**: run verification command (hardhat-etherscan or `forge verify-contract`)
3. **Update frontend**: if a `frontend/` directory exists, update contract address config
4. **Display summary**:
   ```
   ## Deployment Complete

   **Network:** [chain]
   **Contracts:**
   - [ContractName]: [address] — [explorer link]

   Addresses saved to deployments/[network].json
   ```

## Failure Modes

- **Deployment fails partway**: save already-deployed addresses, report which succeeded/failed, suggest how to resume
- **Insufficient gas**: report estimated cost and suggest faucets for testnets
- **Missing RPC URL**: report which env var to set
- **Transaction reverts**: show revert reason if available
