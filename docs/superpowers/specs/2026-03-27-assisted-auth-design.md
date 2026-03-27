# Assisted Auth Flow — Design Specification

**Date:** 2026-03-27
**Status:** Draft
**Parent:** aegis-flow v1.0.0

## Overview

When a module is enabled during `aegis-flow init` or `aegis-flow add`, the CLI detects existing credentials, opens the browser to the right page if missing, validates the token, and writes it to `.env`. The goal is zero friction onboarding — the user never has to hunt for settings pages.

## Supported Services

| Module | Service | Env Var | Auth URL |
|--------|---------|---------|----------|
| ticket-pilot | GitHub | — (uses `gh auth`) | — |
| ticket-pilot | Linear | `LINEAR_API_KEY` | `https://linear.app/settings/api` |
| ticket-pilot | Jira | `JIRA_API_TOKEN`, `JIRA_EMAIL`, `JIRA_BASE_URL` | `https://id.atlassian.com/manage-profile/security/api-tokens` |
| crypto-forge | Alchemy/Infura | `RPC_URL` | `https://dashboard.alchemy.com/apps` |
| crypto-forge | Etherscan | `ETHERSCAN_API_KEY` | `https://etherscan.io/myapikey` |

saas-forge requires no external credentials.

## Flow

For each module enabled, the CLI runs through the module's required services:

1. **Detect:** Check if credentials already exist in environment variables or `.env` file.
2. **Skip if found:** If valid credentials exist, display confirmation and move on.
3. **Open browser:** If credentials are missing, prompt the user and open the auth URL in their default browser via `open` (macOS) or `xdg-open` (Linux).
4. **Collect:** Prompt the user to paste the token/key.
5. **Validate:** Make a lightweight API call to verify the credential works. Display the connected account/workspace name on success.
6. **Store:** Append to `.env` in the project root. Create the file if it doesn't exist.

### Special case: GitHub

GitHub is detected via `gh auth status` (exit code 0 = authenticated). If not authenticated, the CLI suggests running `gh auth login` rather than handling it directly.

### Special case: Jira

Jira requires 3 values (API token, email, base URL). The CLI asks for each in sequence:
1. Base URL first (e.g., `https://mycompany.atlassian.net`)
2. Email
3. API token (opens browser to Atlassian token page)

### Skip option

Every credential prompt includes a skip option:
```
? Paste your Linear API key (or press Enter to skip):
```
Skipping writes a comment to `.env` as a reminder:
```
# LINEAR_API_KEY=your_key_here (run aegis-flow add ticket-pilot to configure)
```

## Detection Strategy

Check in order:
1. Process environment variables (`process.env.LINEAR_API_KEY`)
2. `.env` file in project root (parse with simple key=value reader)

No external `.env` parser dependency — use a simple regex-based reader since we only need key=value pairs.

## Validation

| Service | Method | Success indicator |
|---------|--------|-------------------|
| GitHub | `gh auth status` exit code | Exit 0 |
| Linear | `fetch('https://api.linear.app/graphql', { body: '{"query":"{ viewer { name } }"}' })` | 200 + viewer.name |
| Jira | `fetch('https://{base}/rest/api/3/myself')` with Basic auth | 200 + displayName |
| Alchemy RPC | `fetch(rpcUrl, { body: '{"method":"eth_blockNumber","params":[],"id":1,"jsonrpc":"2.0"}' })` | 200 + result |
| Etherscan | `fetch('https://api.etherscan.io/api?module=stats&action=ethprice&apikey=KEY')` | status "1" |

Validation failure is non-blocking — the CLI warns but still stores the value. The user might be behind a proxy or the service might be temporarily down.

## Files

| File | Change |
|------|--------|
| `cli/src/lib/auth.js` | New — `runModuleAuth(moduleName, projectDir)`, `detectCredential(envVar, projectDir)`, `validateCredential(service, value)`, `openBrowser(url)`, `appendToEnv(projectDir, key, value)` |
| `cli/src/constants.js` | Add `MODULE_AUTH` constant mapping modules to their required services |
| `cli/src/commands/init.js` | Call `runModuleAuth()` for each enabled module after selection |
| `cli/src/commands/add.js` | Call `runModuleAuth()` after enabling a module |
| `.gitignore` | Add `.env` and `.env.*` |
| `cli/tests/auth.test.js` | Tests for detection, .env parsing, .env writing |

## MODULE_AUTH constant

```javascript
export const MODULE_AUTH = {
  'ticket-pilot': [
    {
      service: 'GitHub',
      type: 'cli',
      detectCommand: 'gh auth status',
      setupHint: 'Run: gh auth login'
    },
    {
      service: 'Linear',
      type: 'token',
      envVar: 'LINEAR_API_KEY',
      authUrl: 'https://linear.app/settings/api',
      validateUrl: 'https://api.linear.app/graphql',
      validateBody: '{"query":"{ viewer { name } }"}',
      validateHeader: 'Authorization: Bearer {token}',
      nameExtractor: 'data.viewer.name'
    },
    {
      service: 'Jira',
      type: 'multi',
      fields: [
        { envVar: 'JIRA_BASE_URL', prompt: 'Jira instance URL (e.g., https://mycompany.atlassian.net)' },
        { envVar: 'JIRA_EMAIL', prompt: 'Jira account email' },
        { envVar: 'JIRA_API_TOKEN', prompt: 'Jira API token', authUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens' }
      ]
    }
  ],
  'crypto-forge': [
    {
      service: 'RPC Provider',
      type: 'token',
      envVar: 'RPC_URL',
      authUrl: 'https://dashboard.alchemy.com/apps',
      prompt: 'RPC URL (Alchemy, Infura, or public)',
      validateUrl: '{token}',  // URL is the credential itself
      validateBody: '{"method":"eth_blockNumber","params":[],"id":1,"jsonrpc":"2.0"}',
      nameExtractor: 'result'
    },
    {
      service: 'Etherscan',
      type: 'token',
      envVar: 'ETHERSCAN_API_KEY',
      authUrl: 'https://etherscan.io/myapikey',
      validateUrl: 'https://api.etherscan.io/api?module=stats&action=ethprice&apikey={token}'
    }
  ],
  'saas-forge': []
};
```

## Constraints

- No npm dependencies for `.env` parsing (simple regex reader)
- No npm dependencies for browser opening (`child_process.exec` with `open`/`xdg-open`)
- `fetch` is available natively in Node 18+ (no dependency needed)
- Validation is best-effort, non-blocking
- Credentials are never logged or displayed (only the account name from validation)
- `.env` is protected by the existing `block-secrets` hook
- macOS and Linux only for browser opening; Windows support deferred
- `.env` parser handles quoted values (`KEY="value"`) and ignores comments (`# comment`)
