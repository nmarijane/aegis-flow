import { readFileSync } from 'fs';
import { join } from 'path';
import { MODULES } from '../constants.js';

export function generateManifest(pluginDir, enabledModules) {
  const manifestPath = join(pluginDir, '.claude-plugin', 'plugin.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

  // Always include core agents
  const agents = manifest.agents.filter(a =>
    ['code-reviewer', 'security-auditor', 'tdd-runner'].includes(a.name)
  );

  // Add agents from enabled modules
  for (const modName of enabledModules) {
    const mod = MODULES[modName];
    if (!mod) continue;
    const modAgents = manifest.agents.filter(a => mod.agents.includes(a.name));
    agents.push(...modAgents);
  }

  // Build modules section
  const modules = {};
  for (const modName of enabledModules) {
    const mod = MODULES[modName];
    if (!mod) continue;
    modules[modName] = { skills: mod.skills };
  }

  return { ...manifest, agents, modules };
}
