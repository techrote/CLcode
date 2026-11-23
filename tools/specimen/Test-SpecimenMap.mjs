#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'clcode-specimen-map-'));
const specimen = join(tmp, 'specimen');
const out = join(tmp, 'out');
try {
  mkdirSync(join(specimen, 'resources'), { recursive: true });
  mkdirSync(join(specimen, 'bin'), { recursive: true });
  writeFileSync(join(specimen, 'resources', 'app.js'), `const endpoint='https://api.anthropic.com/v1/messages';\nconst channel='LocalSessions';\nconst key='sk-this-should-be-redacted';\nfunction boot(){ return child_process.spawn('claude-code'); }\n`);
  writeFileSync(join(specimen, 'resources', 'config.json'), JSON.stringify({ inferenceModels: [{ id: 'claude-sonnet-test', behavesAs: 'sonnet' }], quota: 'usage limit' }));
  writeFileSync(join(specimen, 'resources', 'app.asar'), Buffer.from('fake asar marker only'));
  writeFileSync(join(specimen, 'bin', 'wide.bin'), Buffer.from('oauth entitlement'.split('').join('\0') + '\0', 'latin1'));
  execFileSync(process.execPath, [join(here, 'Scan-SpecimenSurface.mjs'), '--root', specimen, '--out', out, '--patterns', join(here, 'specimen-patterns.json')], { stdio: 'pipe' });
  const map = JSON.parse(readFileSync(join(out, 'map.json'), 'utf8'));
  assert(map.candidateFiles >= 4);
  assert(map.categoryCounts['principal-model'] >= 3);
  assert(map.categoryCounts['desktop-ipc'] >= 1);
  assert(map.categoryCounts['auth-quota'] >= 2);
  const asar = map.candidates.find(x => x.relativePath === 'resources/app.asar');
  assert.equal(asar.special, true);
  const hits = readFileSync(join(out, 'hits.jsonl'), 'utf8');
  assert.match(hits, /api\.anthropic\.com/);
  assert.match(hits, /LocalSessions/);
  assert.match(hits, /sk-\[redacted\]/);
  assert(!hits.includes('sk-this-should-be-redacted'));
  const report = join(out, 'REPORT.md');
  execFileSync(process.execPath, [join(here, 'Summarize-SpecimenMap.mjs'), join(out, 'map.json'), report], { stdio: 'pipe' });
  const text = readFileSync(report, 'utf8');
  assert.match(text, /principal-model/);
  assert.match(text, /resources\/app\.js/);
  console.log('CLcode specimen map self-test: PASS');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
