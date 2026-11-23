#!/usr/bin/env node
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const dest = resolve(process.argv[2] ?? 'clcode-fixture-slugger');
if (dest === resolve('.') || dest.length < 5) throw new Error('Refusing unsafe fixture destination.');
rmSync(dest, { recursive: true, force: true });
mkdirSync(join(dest, 'src'), { recursive: true });
mkdirSync(join(dest, 'test'), { recursive: true });
writeFileSync(join(dest, 'package.json'), '{"name":"clcode-slugger-fixture","private":true,"type":"module","scripts":{"test":"node --test"}}\n');
writeFileSync(join(dest, 'src', 'slug.mjs'), `export function slugify(value) {\n  return String(value).trim().toLowerCase();\n}\n`);
writeFileSync(join(dest, 'test', 'slug.test.mjs'), `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { slugify } from '../src/slug.mjs';\n\ntest('normalizes punctuation and whitespace', () => {\n  assert.equal(slugify('  Hello,   Windows! '), 'hello-windows');\n});\n\ntest('joins multiple words', () => {\n  assert.equal(slugify('Read / Edit / Test'), 'read-edit-test');\n});\n`);
const git = args => execFileSync('git', args, { cwd: dest, stdio: 'pipe', encoding: 'utf8' });
git(['init', '-b', 'main']);
git(['config', 'user.name', 'CLcode Fixture']);
git(['config', 'user.email', 'clcode-fixture@localhost.invalid']);
git(['add', '.']);
git(['commit', '-m', 'fixture: intentionally incomplete slugify']);
git(['switch', '-c', 'e06-run']);
console.log(dest);
