import { readConfig, writeConfig } from '../lib/config.js';
import { generateManifest } from '../lib/manifest.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

export async function runRemove(projectDir, pluginDir, moduleName) {
  const config = readConfig(projectDir);
  if (!config.modules.includes(moduleName)) {
    console.log(`Module '${moduleName}' is not enabled.`);
    return;
  }
  config.modules = config.modules.filter(m => m !== moduleName);
  writeConfig(projectDir, config);

  const manifest = generateManifest(pluginDir, config.modules);
  writeFileSync(join(pluginDir, '.claude-plugin', 'plugin.json'), JSON.stringify(manifest, null, 2) + '\n');

  console.log(`✓ Module '${moduleName}' disabled.`);
  console.log(`  Restart Claude Code to apply changes.`);
}
