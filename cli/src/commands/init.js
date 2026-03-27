import { select, checkbox, confirm } from '@inquirer/prompts';
import { detectProject } from '../lib/detect.js';
import { buildConfig, writeConfig } from '../lib/config.js';
import { generateHooksConfig } from '../lib/hooks.js';
import { generateManifest } from '../lib/manifest.js';
import { installPlugin } from '../lib/plugin.js';
import { runModuleAuth } from '../lib/auth.js';
import { SECURITY_LEVELS, MODULES } from '../constants.js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export async function runInit(projectDir, pluginDir) {
  console.log('\n🛡️  aegis-flow — Professional AI Workflow\n');

  // Step 1: Detect project
  console.log('Detecting project...');
  const project = detectProject(projectDir);
  console.log(`  Language:        ${project.language}`);
  console.log(`  Framework:       ${project.framework || '(none)'}`);
  console.log(`  Package manager: ${project.packageManager || '(none)'}`);
  console.log(`  Test runner:     ${project.testRunner || '(none)'}`);
  console.log(`  Formatter:       ${project.formatter || '(none)'}`);

  const detectionOk = await confirm({ message: 'Looks right?', default: true });
  if (!detectionOk) {
    console.log('Edit .claude/aegis-flow.json manually after init to correct detection.');
  }

  // Step 2: Security level
  const security = await select({
    message: 'Security level?',
    choices: Object.entries(SECURITY_LEVELS).map(([key, val]) => ({
      name: val.label,
      value: key,
      description: val.description
    })),
    default: 'strict'
  });

  // Step 3: Modules
  const enabledModules = await checkbox({
    message: 'Enable modules?',
    choices: Object.entries(MODULES).map(([key, val]) => ({
      name: `${key} — ${val.description}`,
      value: key
    }))
  });

  // Step 3b: Configure module credentials
  for (const mod of enabledModules) {
    await runModuleAuth(mod, projectDir);
  }

  // Step 4: Write config
  console.log('\nWriting configuration...');
  const config = buildConfig({ project, security, modules: enabledModules });
  writeConfig(projectDir, config);
  console.log('  ✓ .claude/aegis-flow.json');

  // Step 5: Write hooks to settings.json
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  const settingsPath = join(claudeDir, 'settings.json');
  let settings = {};
  try { settings = JSON.parse(readFileSync(settingsPath, 'utf-8')); } catch {}
  settings.hooks = generateHooksConfig(security, pluginDir);
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log(`  ✓ .claude/settings.json (${SECURITY_LEVELS[security].hooks.length} hooks active)`);

  // Step 6: Generate filtered plugin.json
  const manifest = generateManifest(pluginDir, enabledModules);
  writeFileSync(
    join(pluginDir, '.claude-plugin', 'plugin.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );
  console.log('  ✓ plugin.json updated');

  // Step 7: Install plugin
  installPlugin(projectDir, pluginDir);
  console.log('  ✓ Plugin installed');

  console.log(`\nDone! Run \`claude\` to start with your secured workflow.`);
  console.log('Docs: https://aegis-flow.com/docs\n');
}
