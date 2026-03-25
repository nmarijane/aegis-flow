import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export function installPlugin(projectDir, pluginDir) {
  const settingsPath = join(projectDir, '.claude', 'settings.json');
  let settings = {};
  try { settings = JSON.parse(readFileSync(settingsPath, 'utf-8')); } catch {}
  if (!settings.plugins) settings.plugins = [];
  if (!settings.plugins.includes(pluginDir)) {
    settings.plugins.push(pluginDir);
  }
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}
