import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { validateConfig } from '../lib/config.js';

export async function runDoctor(projectDir, pluginDir) {
  console.log('\n🛡️  aegis-flow doctor\n');
  let healthy = true;

  // Check config
  const configPath = join(projectDir, '.claude', 'aegis-flow.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      const validation = validateConfig(config);
      if (validation.valid) {
        console.log(`✓ Config:     .claude/aegis-flow.json valid (${config.security} mode)`);
      } else {
        console.log(`✗ Config:     invalid — ${validation.errors.join(', ')}`);
        healthy = false;
      }
    } catch (e) {
      console.log(`✗ Config:     .claude/aegis-flow.json parse error`);
      healthy = false;
    }
  } else {
    console.log('✗ Config:     .claude/aegis-flow.json not found');
    healthy = false;
  }

  // Check settings.json hooks
  const settingsPath = join(projectDir, '.claude', 'settings.json');
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      const hookCount = Object.values(settings.hooks || {}).flat().reduce((sum, g) => sum + g.hooks.length, 0);
      console.log(`✓ Hooks:      ${hookCount} hooks active`);
    } catch {
      console.log('✗ Hooks:      settings.json parse error');
      healthy = false;
    }
  } else {
    console.log('✗ Hooks:      .claude/settings.json not found');
    healthy = false;
  }

  // Check hook scripts
  const hooksDir = join(pluginDir, 'core', 'hooks');
  const expectedScripts = ['block-secrets.sh', 'protect-lockfiles.sh', 'auto-format.sh'];
  const missingScripts = expectedScripts.filter(s => !existsSync(join(hooksDir, s)));
  if (missingScripts.length === 0) {
    console.log('✓ Scripts:    all hook scripts present');
  } else {
    console.log(`✗ Scripts:    missing ${missingScripts.join(', ')}`);
    healthy = false;
  }

  // Check modules
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const missingModules = config.modules.filter(m => !existsSync(join(pluginDir, 'modules', m)));
    if (missingModules.length === 0) {
      console.log(`✓ Modules:    ${config.modules.length > 0 ? config.modules.join(', ') : 'none'} enabled`);
    } else {
      console.log(`✗ Modules:    missing directories for ${missingModules.join(', ')}`);
      healthy = false;
    }
  } catch {}

  console.log(`\nStatus: ${healthy ? 'healthy ✓' : 'issues found ✗'}\n`);
  return healthy;
}
