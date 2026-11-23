#!/usr/bin/env node
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const testDir = join(root, 'test');
const files = readdirSync(testDir)
  .filter(name => name.endsWith('.test.mjs'))
  .sort()
  .map(name => join(testDir, name));

if (!files.length) {
  console.error('No test/*.test.mjs files found.');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
