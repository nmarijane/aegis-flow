import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAdd } from '../src/commands/add.js';
import { runRemove } from '../src/commands/remove.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

vi.mock('fs');

const mockConfig = {
  version: '1.0.0',
  security: 'strict',
  modules: ['ticket-pilot'],
  project: { language: 'typescript' }
};

const mockManifest = {
  name: 'aegis-flow',
  agents: [
    { name: 'code-reviewer', path: './core/agents/code-reviewer.md' },
    { name: 'security-auditor', path: './core/agents/security-auditor.md' },
    { name: 'tdd-runner', path: './core/agents/tdd-runner.md' },
    { name: 'bot-builder', path: './modules/crypto-forge/agents/bot-builder.md' },
    { name: 'resolver', path: './modules/ticket-pilot/agents/resolver.md' },
    { name: 'triager', path: './modules/ticket-pilot/agents/triager.md' },
    { name: 'moderator', path: './modules/ticket-pilot/agents/moderator.md' }
  ],
  skills: './core/skills/'
};

describe('runAdd', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    existsSync.mockReturnValue(true);
    readFileSync.mockImplementation(path => {
      if (path.endsWith('aegis-flow.json')) return JSON.stringify(mockConfig);
      if (path.endsWith('plugin.json')) return JSON.stringify(mockManifest);
      return '{}';
    });
    writeFileSync.mockReturnValue(undefined);
    mkdirSync.mockReturnValue(undefined);
  });

  it('adds a module to config', async () => {
    await runAdd('/app', '/plugin', 'crypto-forge');
    const writeCall = writeFileSync.mock.calls.find(c => c[0].endsWith('aegis-flow.json'));
    const updated = JSON.parse(writeCall[1]);
    expect(updated.modules).toContain('crypto-forge');
    expect(updated.modules).toContain('ticket-pilot');
  });

  it('rejects unknown module', async () => {
    await expect(runAdd('/app', '/plugin', 'unknown')).rejects.toThrow('Unknown module');
  });
});

describe('runRemove', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    existsSync.mockReturnValue(true);
    readFileSync.mockImplementation(path => {
      if (path.endsWith('aegis-flow.json')) return JSON.stringify(mockConfig);
      if (path.endsWith('plugin.json')) return JSON.stringify(mockManifest);
      return '{}';
    });
    writeFileSync.mockReturnValue(undefined);
    mkdirSync.mockReturnValue(undefined);
  });

  it('removes a module from config', async () => {
    await runRemove('/app', '/plugin', 'ticket-pilot');
    const writeCall = writeFileSync.mock.calls.find(c => c[0].endsWith('aegis-flow.json'));
    const updated = JSON.parse(writeCall[1]);
    expect(updated.modules).not.toContain('ticket-pilot');
  });
});
