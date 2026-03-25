import { readConfig, writeConfig } from '../lib/config.js';
import { generateManifest } from '../lib/manifest.js';
import { MODULES } from '../constants.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

export async function runAdd(projectDir, pluginDir, moduleName) {
  if (!MODULES[moduleName]) {
    throw new Error(`Unknown module: ${moduleName}. Available: ${Object.keys(MODULES).join(', ')}`);
  }
  const config = readConfig(projectDir);
  if (config.modules.includes(moduleName)) {
    console.log(`Module '${moduleName}' is already enabled.`);
    return;
  }
  config.modules.push(moduleName);
  writeConfig(projectDir, config);

  const manifest = generateManifest(pluginDir, config.modules);
  writeFileSync(join(pluginDir, '.claude-plugin', 'plugin.json'), JSON.stringify(manifest, null, 2) + '\n');

  console.log(`✓ Module '${moduleName}' enabled.`);
  console.log(`  Restart Claude Code to load the new skills and agents.`);
}
