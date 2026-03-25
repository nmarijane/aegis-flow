import { readConfig } from '../lib/config.js';
import { generateHooksConfig } from '../lib/hooks.js';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

export async function runUpdate(projectDir, pluginDir) {
  console.log('\n🛡️  aegis-flow update\n');
  const config = readConfig(projectDir);
  const settingsPath = join(projectDir, '.claude', 'settings.json');
  let settings = {};
  try { settings = JSON.parse(readFileSync(settingsPath, 'utf-8')); } catch {}
  settings.hooks = generateHooksConfig(config.security, pluginDir);
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log('✓ Hooks regenerated');
  console.log('✓ Config is up to date\n');
}
