import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runInit } from '../src/commands/init.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

vi.mock('fs');
vi.mock('@inquirer/prompts');

describe('runInit', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mkdirSync.mockReturnValue(undefined);
    writeFileSync.mockReturnValue(undefined);
  });

  it('writes aegis-flow.json with detected project info', async () => {
    const { select, checkbox, confirm } = await import('@inquirer/prompts');

    existsSync.mockImplementation(path => {
      if (path.endsWith('package.json')) return true;
      if (path.endsWith('tsconfig.json')) return true;
      return false;
    });
    readFileSync.mockImplementation(path => {
      if (path.endsWith('package.json')) {
        return JSON.stringify({ devDependencies: { vitest: '^3.0.0', prettier: '^3.0.0' } });
      }
      if (path.endsWith('plugin.json')) {
        return JSON.stringify({
          name: 'aegis-flow', agents: [
            { name: 'code-reviewer', path: './core/agents/code-reviewer.md' },
            { name: 'security-auditor', path: './core/agents/security-auditor.md' },
            { name: 'tdd-runner', path: './core/agents/tdd-runner.md' }
          ], skills: './core/skills/'
        });
      }
      return '{}';
    });

    confirm.mockResolvedValue(true);
    select.mockResolvedValue('strict');
    checkbox.mockResolvedValue(['ticket-pilot']);

    await runInit('/app', '/path/to/aegis-flow');

    const writeCalls = writeFileSync.mock.calls;
    const configWrite = writeCalls.find(c => c[0].endsWith('aegis-flow.json'));
    expect(configWrite).toBeDefined();
    const config = JSON.parse(configWrite[1]);
    expect(config.security).toBe('strict');
    expect(config.modules).toEqual(['ticket-pilot']);
  });
});
