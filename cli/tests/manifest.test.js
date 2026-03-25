import { describe, it, expect, vi } from 'vitest';
import { generateManifest } from '../src/lib/manifest.js';
import { readFileSync } from 'fs';

vi.mock('fs');

const mockManifest = {
  name: 'aegis-flow',
  version: '1.0.0',
  agents: [
    { name: 'code-reviewer', path: './core/agents/code-reviewer.md' },
    { name: 'security-auditor', path: './core/agents/security-auditor.md' },
    { name: 'tdd-runner', path: './core/agents/tdd-runner.md' },
    { name: 'bot-builder', path: './modules/crypto-forge/agents/bot-builder.md' },
    { name: 'resolver', path: './modules/ticket-pilot/agents/resolver.md' },
    { name: 'triager', path: './modules/ticket-pilot/agents/triager.md' },
    { name: 'moderator', path: './modules/ticket-pilot/agents/moderator.md' },
    { name: 'saas-builder', path: './modules/saas-forge/agents/saas-builder.md' }
  ],
  skills: './core/skills/'
};

describe('generateManifest', () => {
  it('always includes core agents', () => {
    readFileSync.mockReturnValue(JSON.stringify(mockManifest));
    const result = generateManifest('/plugin', []);
    expect(result.agents.map(a => a.name)).toEqual(['code-reviewer', 'security-auditor', 'tdd-runner']);
  });

  it('includes module agents when enabled', () => {
    readFileSync.mockReturnValue(JSON.stringify(mockManifest));
    const result = generateManifest('/plugin', ['ticket-pilot']);
    const names = result.agents.map(a => a.name);
    expect(names).toContain('resolver');
    expect(names).toContain('triager');
    expect(names).toContain('moderator');
    expect(names).not.toContain('bot-builder');
  });

  it('builds modules section for enabled modules only', () => {
    readFileSync.mockReturnValue(JSON.stringify(mockManifest));
    const result = generateManifest('/plugin', ['saas-forge']);
    expect(result.modules['saas-forge']).toBeDefined();
    expect(result.modules['crypto-forge']).toBeUndefined();
  });
});
