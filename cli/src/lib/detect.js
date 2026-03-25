import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export function detectProject(projectDir) {
  const result = {
    language: 'unknown',
    framework: '',
    packageManager: '',
    testRunner: '',
    formatter: ''
  };

  let pkg = {};
  const pkgPath = join(projectDir, 'package.json');
  if (existsSync(pkgPath)) {
    try { pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')); } catch {}
  }

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

  // Detect language
  if (existsSync(join(projectDir, 'tsconfig.json'))) {
    result.language = 'typescript';
  } else if (existsSync(join(projectDir, 'package.json'))) {
    result.language = 'javascript';
  } else if (existsSync(join(projectDir, 'requirements.txt')) || existsSync(join(projectDir, 'pyproject.toml'))) {
    result.language = 'python';
  } else if (existsSync(join(projectDir, 'go.mod'))) {
    result.language = 'go';
  } else if (existsSync(join(projectDir, 'Cargo.toml'))) {
    result.language = 'rust';
  } else if (existsSync(join(projectDir, 'Gemfile'))) {
    result.language = 'ruby';
  }

  // Detect package manager
  if (existsSync(join(projectDir, 'pnpm-lock.yaml'))) {
    result.packageManager = 'pnpm';
  } else if (existsSync(join(projectDir, 'yarn.lock'))) {
    result.packageManager = 'yarn';
  } else if (existsSync(join(projectDir, 'bun.lockb'))) {
    result.packageManager = 'bun';
  } else if (existsSync(join(projectDir, 'package-lock.json'))) {
    result.packageManager = 'npm';
  }

  // Detect framework
  if (allDeps.next) result.framework = 'nextjs';
  else if (allDeps.nuxt) result.framework = 'nuxt';
  else if (allDeps.react) result.framework = 'react';
  else if (allDeps.vue) result.framework = 'vue';
  else if (allDeps.svelte || allDeps['@sveltejs/kit']) result.framework = 'svelte';
  else if (allDeps.express) result.framework = 'express';
  else if (allDeps.fastify) result.framework = 'fastify';

  // Detect test runner
  if (allDeps.vitest) result.testRunner = 'vitest';
  else if (allDeps.jest) result.testRunner = 'jest';
  else if (allDeps.mocha) result.testRunner = 'mocha';
  else if (result.language === 'python') result.testRunner = 'pytest';
  else if (result.language === 'ruby') result.testRunner = 'rspec';

  // Detect formatter
  if (allDeps.prettier) result.formatter = 'prettier';
  else if (allDeps['@biomejs/biome']) result.formatter = 'biome';
  else if (result.language === 'python') result.formatter = 'black';
  else if (result.language === 'rust') result.formatter = 'rustfmt';

  return result;
}
