import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseEnvFile, appendToEnv, detectCredential } from '../src/lib/auth.js';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';

vi.mock('fs');

describe('parseEnvFile', () => {
  it('parses simple key=value', () => {
    const result = parseEnvFile('API_KEY=abc123\nOTHER=xyz');
    expect(result.API_KEY).toBe('abc123');
    expect(result.OTHER).toBe('xyz');
  });

  it('handles quoted values', () => {
    const result = parseEnvFile('KEY="hello world"\nKEY2=\'single\'');
    expect(result.KEY).toBe('hello world');
    expect(result.KEY2).toBe('single');
  });

  it('ignores comments and empty lines', () => {
    const result = parseEnvFile('# comment\n\nKEY=value\n# another comment');
    expect(Object.keys(result)).toEqual(['KEY']);
  });

  it('handles inline comments', () => {
    const result = parseEnvFile('KEY=value # inline comment');
    expect(result.KEY).toBe('value');
  });

  it('returns empty object for empty input', () => {
    expect(parseEnvFile('')).toEqual({});
  });
});

describe('detectCredential', () => {
  beforeEach(() => vi.resetAllMocks());

  it('finds credential in process.env', () => {
    process.env.TEST_KEY_AUTH = 'from_env';
    const result = detectCredential('TEST_KEY_AUTH', '/app');
    expect(result).toBe('from_env');
    delete process.env.TEST_KEY_AUTH;
  });

  it('finds credential in .env file', () => {
    delete process.env.MY_KEY_AUTH;
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue('MY_KEY_AUTH=from_file');
    const result = detectCredential('MY_KEY_AUTH', '/app');
    expect(result).toBe('from_file');
  });

  it('returns null when not found', () => {
    delete process.env.MISSING_KEY_AUTH;
    existsSync.mockReturnValue(false);
    const result = detectCredential('MISSING_KEY_AUTH', '/app');
    expect(result).toBeNull();
  });
});

describe('appendToEnv', () => {
  beforeEach(() => vi.resetAllMocks());

  it('appends key=value to existing .env', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue('EXISTING=value\n');
    appendToEnv('/app', 'NEW_KEY', 'new_value');
    expect(appendFileSync).toHaveBeenCalledWith(
      '/app/.env',
      expect.stringContaining('NEW_KEY=new_value')
    );
  });

  it('creates .env if missing', () => {
    existsSync.mockReturnValue(false);
    appendToEnv('/app', 'KEY', 'val');
    expect(writeFileSync).toHaveBeenCalledWith('/app/.env', expect.stringContaining('KEY=val'));
  });

  it('writes comment placeholder when value is empty', () => {
    existsSync.mockReturnValue(false);
    appendToEnv('/app', 'KEY', '');
    expect(writeFileSync).toHaveBeenCalledWith('/app/.env', expect.stringContaining('# KEY='));
  });
});
