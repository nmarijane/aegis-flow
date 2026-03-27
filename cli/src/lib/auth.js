import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { input, confirm } from '@inquirer/prompts';
import { MODULE_AUTH } from '../constants.js';

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

export function detectCredential(envVar, projectDir) {
  if (process.env[envVar]) return process.env[envVar];
  const envPath = join(projectDir, '.env');
  if (existsSync(envPath)) {
    const parsed = parseEnvFile(readFileSync(envPath, 'utf-8'));
    if (parsed[envVar]) return parsed[envVar];
  }
  return null;
}

export function appendToEnv(projectDir, key, value) {
  const envPath = join(projectDir, '.env');
  const line = value ? `${key}=${value}\n` : `# ${key}=your_key_here\n`;
  if (existsSync(envPath)) {
    appendFileSync(envPath, line);
  } else {
    writeFileSync(envPath, line);
  }
}

export function openBrowser(url) {
  try {
    const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
    execSync(`${cmd} "${url}"`, { stdio: 'ignore' });
  } catch {}
}

export async function validateCredential(serviceDef, token) {
  try {
    let url = serviceDef.validateUrl;
    if (!url) return { valid: false };
    url = url.replace('{token}', token);

    const headers = { 'Content-Type': 'application/json' };
    if (serviceDef.validateHeader) {
      const [key, val] = serviceDef.validateHeader.split(': ');
      headers[key] = val.replace('{token}', token);
    }

    const opts = { method: serviceDef.validateMethod || 'GET', headers };
    if (serviceDef.validateBody) opts.body = serviceDef.validateBody;

    const res = await fetch(url, opts);
    if (!res.ok) return { valid: false };

    const data = await res.json();
    if (serviceDef.nameExtractor) {
      const name = serviceDef.nameExtractor.split('.').reduce((obj, key) => obj?.[key], data);
      return { valid: true, name: String(name) };
    }
    return { valid: true };
  } catch {
    return { valid: false };
  }
}

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

  const result = await validateCredential(service, value.trim());
  appendToEnv(projectDir, service.envVar, value.trim());

  if (result.valid) {
    console.log(`  ✓ ${service.service} connected${result.name ? ` (${result.name})` : ''}`);
  } else {
    console.log(`  ⚠ ${service.service}: could not validate (saved anyway)`);
  }
}

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

  if (service.validateFn === 'jira' && values.JIRA_BASE_URL && values.JIRA_EMAIL && values.JIRA_API_TOKEN) {
    const result = await validateJira(values.JIRA_BASE_URL, values.JIRA_EMAIL, values.JIRA_API_TOKEN);
    if (result.valid) {
      console.log(`  ✓ ${service.service} connected (${result.name})`);
    } else {
      console.log(`  ⚠ ${service.service}: could not validate (saved anyway)`);
    }
  }
}

function handleCliService(service) {
  try {
    execSync(service.detectCommand, { stdio: 'ignore' });
    console.log(`  ✓ ${service.service}: authenticated`);
  } catch {
    console.log(`  ✗ ${service.service}: not authenticated. ${service.setupHint}`);
  }
}

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
