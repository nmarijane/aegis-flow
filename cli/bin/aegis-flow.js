#!/usr/bin/env node
import { Command } from 'commander';
import { runInit } from '../src/commands/init.js';
import { runAdd } from '../src/commands/add.js';
import { runRemove } from '../src/commands/remove.js';
import { runDoctor } from '../src/commands/doctor.js';
import { runUpdate } from '../src/commands/update.js';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = resolve(__dirname, '..', '..');

const program = new Command();
program.name('aegis-flow').description('Professional AI workflow — secure, tested, production-ready').version('1.0.0');

program.command('init').description('Initialize aegis-flow in the current project').action(async () => {
  await runInit(process.cwd(), PLUGIN_DIR);
});

program.command('add <module>').description('Enable a module').action(async (module) => {
  await runAdd(process.cwd(), PLUGIN_DIR, module);
});

program.command('remove <module>').description('Disable a module').action(async (module) => {
  await runRemove(process.cwd(), PLUGIN_DIR, module);
});

program.command('doctor').description('Verify setup health').action(async () => {
  await runDoctor(process.cwd(), PLUGIN_DIR);
});

program.command('update').description('Update config after upgrade').action(async () => {
  await runUpdate(process.cwd(), PLUGIN_DIR);
});

program.parse();
