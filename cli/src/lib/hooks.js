import { SECURITY_LEVELS, HOOK_DEFINITIONS } from '../constants.js';

export function generateHooksConfig(securityLevel, pluginDir) {
  const level = SECURITY_LEVELS[securityLevel];
  if (!level) throw new Error(`Unknown security level: ${securityLevel}`);

  // Group hooks by event+matcher
  const grouped = {};
  for (const hookName of level.hooks) {
    const def = HOOK_DEFINITIONS[hookName];
    const key = `${def.event}::${def.matcher}`;
    if (!grouped[key]) {
      grouped[key] = { event: def.event, matcher: def.matcher, hooks: [] };
    }
    grouped[key].hooks.push({
      type: 'command',
      command: `bash "${pluginDir}/core/hooks/${def.script}"`
    });
  }

  // Build settings.json hooks structure
  const result = {};
  for (const group of Object.values(grouped)) {
    if (!result[group.event]) result[group.event] = [];
    const entry = { hooks: group.hooks };
    if (group.matcher) entry.matcher = group.matcher;
    result[group.event].push(entry);
  }
  return result;
}
