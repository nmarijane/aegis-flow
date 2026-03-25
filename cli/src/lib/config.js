import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export function buildConfig({ project, security, modules }) {
  return { version: '1.0.0', security, modules, project };
}

export function validateConfig(config) {
  const errors = [];
  if (!config.version) errors.push('missing version');
  if (!['standard', 'strict', 'paranoid'].includes(config.security)) {
    errors.push(`unknown security level: ${config.security}`);
  }
  if (!Array.isArray(config.modules)) errors.push('modules must be an array');
  return { valid: errors.length === 0, errors };
}

export function writeConfig(projectDir, config) {
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, 'aegis-flow.json'), JSON.stringify(config, null, 2) + '\n');
}

export function readConfig(projectDir) {
  const configPath = join(projectDir, '.claude', 'aegis-flow.json');
  return JSON.parse(readFileSync(configPath, 'utf-8'));
}
