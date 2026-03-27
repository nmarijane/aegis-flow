# Assisted Auth Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add assisted credential setup to `aegis-flow init` and `aegis-flow add` — detect existing tokens, open browser to auth pages, validate, and write to `.env`.

**Architecture:** A single `auth.js` library handles detection, browser opening, validation, and `.env` writing. The `MODULE_AUTH` constant in `constants.js` maps each module to its required services. `init.js` and `add.js` call `runModuleAuth()` after module selection.

**Tech Stack:** Node.js (native `fetch`, `child_process.exec`), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-03-27-assisted-auth-design.md`

---

## File Structure

```
cli/
├── src/
│   ├── lib/
│   │   └── auth.js          # NEW — credential detection, browser, validation, .env
│   ├── constants.js          # MODIFY — add MODULE_AUTH constant
│   └── commands/
│       ├── init.js           # MODIFY — call runModuleAuth() after module selection
│       └── add.js            # MODIFY — call runModuleAuth() after enabling module
├── tests/
│   └── auth.test.js          # NEW — tests for auth library
.gitignore                    # MODIFY — add .env
```

---

### Task 1: MODULE_AUTH constant

**Files:**
- Modify: `cli/src/constants.js`

- [ ] **Step 1: Add MODULE_AUTH to constants.js**

Append after `PACKAGE_MANAGERS` in `cli/src/constants.js`:

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
      validateMethod: 'POST',
      validateBody: '{"query":"{ viewer { name } }"}',
      validateHeader: 'Authorization: Bearer {token}',
      nameExtractor: 'data.viewer.name'
    },
    {
      service: 'Jira',
      type: 'multi',
      fields: [
        { envVar: 'JIRA_BASE_URL', prompt: 'Jira instance URL (e.g. https://mycompany.atlassian.net)' },
        { envVar: 'JIRA_EMAIL', prompt: 'Jira account email' },
        { envVar: 'JIRA_API_TOKEN', prompt: 'Jira API token', authUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens' }
      ],
      validateFn: 'jira'
    }
  ],
  'crypto-forge': [
    {
      service: 'RPC Provider',
      type: 'token',
      envVar: 'RPC_URL',
      authUrl: 'https://dashboard.alchemy.com/apps',
      prompt: 'RPC URL (Alchemy, Infura, or public)',
      validateUrl: '{token}',
      validateMethod: 'POST',
      validateBody: '{"method":"eth_blockNumber","params":[],"id":1,"jsonrpc":"2.0"}',
      nameExtractor: 'result'
    },
    {
      service: 'Etherscan',
      type: 'token',
      envVar: 'ETHERSCAN_API_KEY',
      authUrl: 'https://etherscan.io/myapikey',
      validateUrl: 'https://api.etherscan.io/api?module=stats&action=ethprice&apikey={token}',
      validateMethod: 'GET',
      nameExtractor: 'result.ethusd'
    }
  ],
  'saas-forge': []
};
```

- [ ] **Step 2: Commit**

```bash
git add cli/src/constants.js
git commit -m "feat(cli): add MODULE_AUTH constant for assisted credential setup"
```

---

### Task 2: Auth library — .env parsing and writing

**Files:**
- Create: `cli/src/lib/auth.js`
- Create: `cli/tests/auth.test.js`

- [ ] **Step 1: Write tests for .env parsing and writing**

Create `cli/tests/auth.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseEnvFile, appendToEnv, detectCredential } from '../src/lib/auth.js';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';

vi.mock('fs');

describe('parseEnvFile', () => {
  it('parses simple key=value', () => {
    const result = parseEnvFile('API_KEY=abc123\nOTHER=xyz');
    expect(result.API_KEY).toBe('abc123');
    expect(result.OTHER).toBe('xyz');
  });

  it('handles quoted values', () => {
    const result = parseEnvFile('KEY="hello world"\nKEY2=\'single\'');
    expect(result.KEY).toBe('hello world');
    expect(result.KEY2).toBe('single');
  });

  it('ignores comments and empty lines', () => {
    const result = parseEnvFile('# comment\n\nKEY=value\n# another comment');
    expect(Object.keys(result)).toEqual(['KEY']);
  });

  it('handles inline comments', () => {
    const result = parseEnvFile('KEY=value # inline comment');
    expect(result.KEY).toBe('value');
  });

  it('returns empty object for empty input', () => {
    expect(parseEnvFile('')).toEqual({});
  });
});

describe('detectCredential', () => {
  beforeEach(() => vi.resetAllMocks());

  it('finds credential in process.env', () => {
    process.env.TEST_KEY = 'from_env';
    const result = detectCredential('TEST_KEY', '/app');
    expect(result).toBe('from_env');
    delete process.env.TEST_KEY;
  });

  it('finds credential in .env file', () => {
    delete process.env.MY_KEY;
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue('MY_KEY=from_file');
    const result = detectCredential('MY_KEY', '/app');
    expect(result).toBe('from_file');
  });

  it('returns null when not found', () => {
    delete process.env.MISSING_KEY;
    existsSync.mockReturnValue(false);
    const result = detectCredential('MISSING_KEY', '/app');
    expect(result).toBeNull();
  });
});

describe('appendToEnv', () => {
  beforeEach(() => vi.resetAllMocks());

  it('appends key=value to .env', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue('EXISTING=value\n');
    appendToEnv('/app', 'NEW_KEY', 'new_value');
    expect(appendFileSync).toHaveBeenCalledWith(
      '/app/.env',
      expect.stringContaining('NEW_KEY=new_value')
    );
  });

  it('creates .env if missing', () => {
    existsSync.mockReturnValue(false);
    appendToEnv('/app', 'KEY', 'val');
    expect(writeFileSync).toHaveBeenCalledWith('/app/.env', expect.stringContaining('KEY=val'));
  });

  it('writes comment placeholder when value is empty', () => {
    existsSync.mockReturnValue(false);
    appendToEnv('/app', 'KEY', '');
    expect(writeFileSync).toHaveBeenCalledWith('/app/.env', expect.stringContaining('# KEY='));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd cli && npx vitest run tests/auth.test.js
```

Expected: FAIL — `auth.js` doesn't exist.

- [ ] **Step 3: Write auth.js — parsing and writing functions**

Create `cli/src/lib/auth.js`:

```javascript
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { input, confirm } from '@inquirer/prompts';
import { MODULE_AUTH } from '../constants.js';

// Parse a .env file into a key-value object
export function parseEnvFile(content) {
  const result = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    // Remove inline comments (not inside quotes, not URL fragments)
    if (!value.startsWith('"') && !value.startsWith("'")) {
      value = value.replace(/\s+#(?![\w/]).*$/, '');
    }
    // Strip quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value;
  }
  return result;
}

// Detect a credential from env vars or .env file
export function detectCredential(envVar, projectDir) {
  // Check process.env first
  if (process.env[envVar]) return process.env[envVar];

  // Check .env file
  const envPath = join(projectDir, '.env');
  if (existsSync(envPath)) {
    const parsed = parseEnvFile(readFileSync(envPath, 'utf-8'));
    if (parsed[envVar]) return parsed[envVar];
  }

  return null;
}

// Append a key=value to .env file
export function appendToEnv(projectDir, key, value) {
  const envPath = join(projectDir, '.env');
  const line = value ? `${key}=${value}\n` : `# ${key}=your_key_here\n`;

  if (existsSync(envPath)) {
    appendFileSync(envPath, line);
  } else {
    writeFileSync(envPath, line);
  }
}

// Open URL in default browser
export function openBrowser(url) {
  try {
    const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
    execSync(`${cmd} "${url}"`, { stdio: 'ignore' });
  } catch {}
}

// Validate a credential by making a test API call
export async function validateCredential(serviceDef, token) {
  try {
    // Special case: RPC URL where the token IS the URL
    let url = serviceDef.validateUrl;
    if (!url) return { valid: false };
    url = url.replace('{token}', token);

    const headers = { 'Content-Type': 'application/json' };
    if (serviceDef.validateHeader) {
      const [key, val] = serviceDef.validateHeader.split(': ');
      headers[key] = val.replace('{token}', token);
    }

    const opts = { method: serviceDef.validateMethod || 'GET', headers };
    if (serviceDef.validateBody) {
      opts.body = serviceDef.validateBody;
    }

    const res = await fetch(url, opts);
    if (!res.ok) return { valid: false };

    const data = await res.json();

    // Extract display name from response
    if (serviceDef.nameExtractor) {
      const name = serviceDef.nameExtractor.split('.').reduce((obj, key) => obj?.[key], data);
      return { valid: true, name: String(name) };
    }

    return { valid: true };
  } catch {
    return { valid: false };
  }
}

// Validate Jira credentials (special case — needs base URL + Basic auth)
async function validateJira(baseUrl, email, token) {
  try {
    const auth = Buffer.from(`${email}:${token}`).toString('base64');
    const res = await fetch(`${baseUrl}/rest/api/3/myself`, {
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
    });
    if (!res.ok) return { valid: false };
    const data = await res.json();
    return { valid: true, name: data.displayName };
  } catch {
    return { valid: false };
  }
}

// Run auth flow for a single service definition
async function handleTokenService(service, projectDir) {
  const existing = detectCredential(service.envVar, projectDir);
  if (existing) {
    console.log(`  ✓ ${service.service}: found in environment`);
    return;
  }

  console.log(`\n  ${service.service}: no credentials found.`);
  if (service.authUrl) {
    const shouldOpen = await confirm({
      message: `Open ${service.service} settings in your browser?`,
      default: true
    });
    if (shouldOpen) openBrowser(service.authUrl);
  }

  const value = await input({
    message: service.prompt || `Paste your ${service.service} API key (Enter to skip):`,
  });

  if (!value.trim()) {
    appendToEnv(projectDir, service.envVar, '');
    console.log(`  ⊘ ${service.service} skipped (placeholder added to .env)`);
    return;
  }

  // Validate
  const result = await validateCredential(service, value.trim());
  appendToEnv(projectDir, service.envVar, value.trim());

  if (result.valid) {
    console.log(`  ✓ ${service.service} connected${result.name ? ` (${result.name})` : ''}`);
  } else {
    console.log(`  ⚠ ${service.service}: could not validate (saved anyway)`);
  }
}

// Run auth flow for a multi-field service (e.g., Jira)
async function handleMultiService(service, projectDir) {
  const allFound = service.fields.every(f => detectCredential(f.envVar, projectDir));
  if (allFound) {
    console.log(`  ✓ ${service.service}: all credentials found in environment`);
    return;
  }

  console.log(`\n  ${service.service}: credentials needed.`);
  const values = {};

  for (const field of service.fields) {
    const existing = detectCredential(field.envVar, projectDir);
    if (existing) {
      console.log(`    ✓ ${field.envVar} found`);
      values[field.envVar] = existing;
      continue;
    }

    if (field.authUrl) {
      const shouldOpen = await confirm({
        message: `Open ${service.service} token page in your browser?`,
        default: true
      });
      if (shouldOpen) openBrowser(field.authUrl);
    }

    const value = await input({ message: `${field.prompt} (Enter to skip):` });
    values[field.envVar] = value.trim();
    appendToEnv(projectDir, field.envVar, value.trim());
  }

  // Validate Jira if all fields provided
  if (service.validateFn === 'jira' && values.JIRA_BASE_URL && values.JIRA_EMAIL && values.JIRA_API_TOKEN) {
    const result = await validateJira(values.JIRA_BASE_URL, values.JIRA_EMAIL, values.JIRA_API_TOKEN);
    if (result.valid) {
      console.log(`  ✓ ${service.service} connected (${result.name})`);
    } else {
      console.log(`  ⚠ ${service.service}: could not validate (saved anyway)`);
    }
  }
}

// Run auth flow for a CLI-based service (e.g., GitHub via gh)
function handleCliService(service) {
  try {
    execSync(service.detectCommand, { stdio: 'ignore' });
    console.log(`  ✓ ${service.service}: authenticated`);
  } catch {
    console.log(`  ✗ ${service.service}: not authenticated. ${service.setupHint}`);
  }
}

// Main entry point — run auth for all services of a module
export async function runModuleAuth(moduleName, projectDir) {
  const services = MODULE_AUTH[moduleName];
  if (!services || services.length === 0) return;

  console.log(`\nSetting up ${moduleName}...`);

  for (const service of services) {
    switch (service.type) {
      case 'cli':
        handleCliService(service);
        break;
      case 'token':
        await handleTokenService(service, projectDir);
        break;
      case 'multi':
        await handleMultiService(service, projectDir);
        break;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd cli && npx vitest run tests/auth.test.js
```

Expected: all 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/lib/auth.js cli/tests/auth.test.js
git commit -m "feat(cli): add auth library for assisted credential setup

Detects credentials in env vars and .env files, opens browser to auth
pages, validates tokens via API, writes to .env."
```

---

### Task 3: Wire auth into init and add commands

**Files:**
- Modify: `cli/src/commands/init.js`
- Modify: `cli/src/commands/add.js`
- Modify: `.gitignore`

- [ ] **Step 1: Update init.js**

In `cli/src/commands/init.js`, add import at the top:

```javascript
import { runModuleAuth } from '../lib/auth.js';
```

Add auth step after module selection (after line 46, before "Step 4: Write config"):

```javascript
  // Step 3b: Configure module credentials
  for (const mod of enabledModules) {
    await runModuleAuth(mod, projectDir);
  }
```

- [ ] **Step 2: Update add.js**

In `cli/src/commands/add.js`, add import at the top:

```javascript
import { runModuleAuth } from '../lib/auth.js';
```

Add auth step after enabling the module (before the success message):

```javascript
  // Configure credentials
  await runModuleAuth(moduleName, projectDir);
```

- [ ] **Step 3: Update .gitignore**

Add `.env` patterns to the root `.gitignore`:

```
.env
.env.*
```

- [ ] **Step 4: Run all CLI tests**

```bash
cd cli && npx vitest run
```

Expected: all tests PASS (existing + new auth tests).

- [ ] **Step 5: Commit**

```bash
git add cli/src/commands/init.js cli/src/commands/add.js .gitignore
git commit -m "feat(cli): wire assisted auth into init and add commands

init: runs credential setup for each enabled module
add: runs credential setup after enabling a module
.gitignore: protect .env files"
```

---

### Task 4: Verification

- [ ] **Step 1: Run all CLI tests**

```bash
cd cli && npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 2: Verify CLI help still works**

```bash
node cli/bin/aegis-flow.js --help
```

Expected: all 5 commands listed.

- [ ] **Step 3: Push**

```bash
git push origin main
```
