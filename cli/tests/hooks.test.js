import { describe, it, expect } from 'vitest';
import { generateHooksConfig } from '../src/lib/hooks.js';

describe('generateHooksConfig', () => {
  it('generates standard hooks', () => {
    const hooks = generateHooksConfig('standard', '/path/to/aegis-flow');
    expect(hooks.PreToolUse).toBeDefined();
    expect(hooks.PostToolUse).toBeDefined();
    expect(hooks.Stop).toBeUndefined(); // standard doesn't have verify-tests
  });

  it('generates strict hooks', () => {
    const hooks = generateHooksConfig('strict', '/path/to/aegis-flow');
    expect(hooks.PreToolUse).toBeDefined();
    expect(hooks.PostToolUse).toBeDefined();
    expect(hooks.Stop).toBeDefined(); // strict has verify-tests
  });

  it('generates paranoid hooks with block-network and branch-protection', () => {
    const hooks = generateHooksConfig('paranoid', '/path/to/aegis-flow');
    // paranoid has more Bash hooks (validate-commands + block-network + branch-protection)
    const bashGroup = hooks.PreToolUse.find(h => h.matcher === 'Bash');
    expect(bashGroup).toBeDefined();
    expect(bashGroup.hooks.length).toBe(3);
  });

  it('throws on unknown level', () => {
    expect(() => generateHooksConfig('unknown', '/path')).toThrow();
  });
});
