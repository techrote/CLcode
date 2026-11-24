#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const results = [];
function run(name, file, args = []) {
  const command = file === 'node' ? process.execPath : file;
  const proc = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true });
  const ok = proc.status === 0;
  results.push({ name, ok, status: proc.status, stdout: String(proc.stdout ?? '').slice(-4000), stderr: String(proc.stderr ?? '').slice(-4000) });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}\n`);
  if (!ok) {
    if (proc.stdout) process.stdout.write(String(proc.stdout));
    if (proc.stderr) process.stderr.write(String(proc.stderr));
  }
  return ok;
}

let ok = true;
const componentFile = join(root, 'docs', 'FIRST-WINDOWS-COMPONENTS.json');
if (!existsSync(componentFile)) {
  process.stdout.write(`MISS  Component pin manifest: ${componentFile}\n`);
  ok = false;
} else {
  const componentManifest = JSON.parse(readFileSync(componentFile, 'utf8'));
  for (const component of componentManifest.components ?? []) {
    const verify = spawnSync('git', ['merge-base', '--is-ancestor', component.sha, 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true });
    const good = verify.status === 0;
    results.push({ name: `Component PR #${component.pr} ${component.name}`, ok: good, status: verify.status, stdout: '', stderr: String(verify.stderr ?? '').slice(-1000) });
    process.stdout.write(`${good ? 'PASS' : 'FAIL'}  Component PR #${component.pr} ${component.name} @ ${component.sha.slice(0,12)}\n`);
    ok = good && ok;
  }
}

// package.json is the canonical test command and avoids platform-specific shell glob behavior.
ok = run('Node runtime/desktop tests', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test']) && ok;
for (const [name, script] of [
  ['Specimen static map self-test', 'tools/specimen/Test-SpecimenMap.mjs'],
  ['Specimen ASAR internal map self-test', 'tools/specimen/Test-AsarMap.mjs'],
  ['Specimen runtime-correlation self-test', 'tools/specimen/Test-RuntimeAnalysis.mjs'],
  ['Specimen guarded patch self-test', 'tools/specimen/Test-SpecimenPatch.mjs'],
  ['Specimen launch redaction/filter self-test', 'tools/specimen/Test-LaunchRedaction.mjs'],
]) {
  if (!existsSync(join(root, script))) { process.stdout.write(`MISS  ${name}: ${script}\n`); ok = false; continue; }
  ok = run(name, 'node', [script]) && ok;
}

if (process.platform === 'win32') {
  const ps = join(root, 'tools/specimen/Test-SpecimenTooling.ps1');
  if (!existsSync(ps)) { process.stdout.write(`MISS  PowerShell specimen-lab self-test: ${ps}\n`); ok = false; }
  else ok = run('PowerShell specimen-lab self-test', 'powershell.exe', ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',ps]) && ok;
} else {
  process.stdout.write('SKIP  PowerShell specimen-lab self-test: requires disposable Windows PC\n');
}

process.stdout.write(`\nFIRST-WINDOWS-001 preflight: ${ok ? 'PASS' : 'FAIL'}\n`);
process.exit(ok ? 0 : 1);
