import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectProject } from '../src/lib/detect.js';
import { existsSync, readFileSync } from 'fs';

vi.mock('fs');

describe('detectProject', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('detects TypeScript from tsconfig.json', () => {
    existsSync.mockImplementation(path => path.endsWith('tsconfig.json'));
    readFileSync.mockReturnValue('{}');
    const result = detectProject('/app');
    expect(result.language).toBe('typescript');
  });

  it('detects JavaScript when no tsconfig', () => {
    existsSync.mockImplementation(path => path.endsWith('package.json'));
    readFileSync.mockReturnValue('{}');
    const result = detectProject('/app');
    expect(result.language).toBe('javascript');
  });

  it('detects Python from requirements.txt', () => {
    existsSync.mockImplementation(path =>
      path.endsWith('requirements.txt') || path.endsWith('pyproject.toml')
    );
    readFileSync.mockReturnValue('');
    const result = detectProject('/app');
    expect(result.language).toBe('python');
  });

  it('detects pnpm from pnpm-lock.yaml', () => {
    existsSync.mockImplementation(path =>
      path.endsWith('pnpm-lock.yaml') || path.endsWith('package.json')
    );
    readFileSync.mockReturnValue('{}');
    const result = detectProject('/app');
    expect(result.packageManager).toBe('pnpm');
  });

  it('detects vitest from package.json devDependencies', () => {
    existsSync.mockImplementation(path => path.endsWith('package.json'));
    readFileSync.mockReturnValue(JSON.stringify({
      devDependencies: { vitest: '^3.0.0', prettier: '^3.0.0' }
    }));
    const result = detectProject('/app');
    expect(result.testRunner).toBe('vitest');
    expect(result.formatter).toBe('prettier');
  });

  it('detects Next.js framework', () => {
    existsSync.mockImplementation(path =>
      path.endsWith('package.json') || path.endsWith('tsconfig.json')
    );
    readFileSync.mockImplementation(path => {
      if (path.endsWith('package.json')) {
        return JSON.stringify({ dependencies: { next: '^15.0.0' } });
      }
      return '{}';
    });
    const result = detectProject('/app');
    expect(result.framework).toBe('nextjs');
  });

  it('returns unknown for unrecognized project', () => {
    existsSync.mockReturnValue(false);
    const result = detectProject('/app');
    expect(result.language).toBe('unknown');
  });
});
