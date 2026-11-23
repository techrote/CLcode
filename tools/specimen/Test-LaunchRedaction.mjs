#!/usr/bin/env node
import assert from 'node:assert/strict';
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
