#!/usr/bin/env node
import { Command } from 'commander';
import { runInit } from '../src/commands/init.js';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = resolve(__dirname, '..', '..');

const program = new Command();

program
  .name('aegis-flow')
  .description('Professional AI workflow — secure, tested, production-ready')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize aegis-flow in the current project')
  .action(async () => {
    const projectDir = process.cwd();
    await runInit(projectDir, PLUGIN_DIR);
  });

// Placeholder commands — implemented in Task 11
program.command('add <module>').description('Enable a module').action(() => {
  console.log('Not yet implemented. Coming in next update.');
});
program.command('remove <module>').description('Disable a module').action(() => {
  console.log('Not yet implemented. Coming in next update.');
});
program.command('doctor').description('Verify setup health').action(() => {
  console.log('Not yet implemented. Coming in next update.');
});
program.command('update').description('Update config after upgrade').action(() => {
  console.log('Not yet implemented. Coming in next update.');
});

program.parse();
