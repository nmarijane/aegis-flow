import { describe, it, expect } from 'vitest';
import { buildConfig, validateConfig } from '../src/lib/config.js';

describe('buildConfig', () => {
  it('builds config from detection and user choices', () => {
    const config = buildConfig({
      project: { language: 'typescript', framework: 'nextjs', packageManager: 'pnpm', testRunner: 'vitest', formatter: 'prettier' },
      security: 'strict',
      modules: ['ticket-pilot']
    });
    expect(config.version).toBe('1.0.0');
    expect(config.security).toBe('strict');
    expect(config.modules).toEqual(['ticket-pilot']);
    expect(config.project.language).toBe('typescript');
  });
});

describe('validateConfig', () => {
  it('returns valid for correct config', () => {
    const result = validateConfig({ version: '1.0.0', security: 'strict', modules: [], project: { language: 'typescript' } });
    expect(result.valid).toBe(true);
  });
  it('returns invalid for missing version', () => {
    const result = validateConfig({ security: 'strict', modules: [] });
    expect(result.valid).toBe(false);
  });
  it('returns invalid for unknown security level', () => {
    const result = validateConfig({ version: '1.0.0', security: 'ultra', modules: [] });
    expect(result.valid).toBe(false);
  });
});
