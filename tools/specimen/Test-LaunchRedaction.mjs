#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LaunchFilter, sanitizeCommandLine, safeLaunchEvent } from './launch-redaction.mjs';

const raw='Claude.exe --model claude-sonnet --api-key sk-abcdefghijk --token="verysecretvalue" https://localhost/cb?t=onetimetoken&ok=1 Authorization=Bearer.supersecret';
const clean=sanitizeCommandLine(raw);
assert.match(clean,/--model claude-sonnet/);
assert(!clean.includes('abcdefghijk'));
assert(!clean.includes('verysecretvalue'));
assert(!clean.includes('onetimetoken'));
assert.match(clean,/\[redacted\]/);

const event=safeLaunchEvent({processId:'42',parentProcessId:'7',name:'claude-code.exe',executablePath:'C:\\App\\claude-code.exe',commandLine:'--access-token abcdefghijk'});
assert.equal(event.processId,42);
assert(!event.commandLine.includes('abcdefghijk'));

const filter=new LaunchFilter({nameRegex:/claude/i});
assert(filter.accept({processId:100,parentProcessId:1,name:'Claude.exe'}));
assert(filter.accept({processId:101,parentProcessId:100,name:'helper.exe',commandLine:'normal'}));
assert.equal(filter.accept({processId:200,parentProcessId:1,name:'unrelated.exe'}),null);
console.log('CLcode launch redaction/filter self-test: PASS');

const temp = mkdtempSync(join(tmpdir(), 'clcode-launch-lifecycle-'));
try {
  const script = fileURLToPath(new URL('./Observe-SpecimenLaunch.mjs', import.meta.url));
  for (const [name, executable] of [['missing', join(temp, 'nonexistent-watcher.exe')], ['rapid-exit', process.execPath]]) {
    const out = join(temp, name);
    const result = spawnSync(process.execPath, [script, '--powershell', executable, '--duration', '1', '--out', out], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.error, undefined, 'observer must exit, not hang or time out');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /watcher (could not launch|exited with code)/);
    assert(!existsSync(join(out, 'summary.json')), 'failed watcher must not publish success evidence');
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
console.log('CLcode launch observer lifecycle self-test: PASS');
