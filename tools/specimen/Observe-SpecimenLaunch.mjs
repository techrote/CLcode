#!/usr/bin/env node
import { mkdirSync, writeFileSync, createWriteStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { LaunchFilter } from './launch-redaction.mjs';

const here = dirname(fileURLToPath(import.meta.url));
function parse(argv) {
  const out = { duration: 120, regex: 'claude|anthropic', powershell: 'powershell.exe' };
  for (let i=0;i<argv.length;i++) {
    const a=argv[i];
    if (a==='--lab') out.lab=argv[++i];
    else if (a==='--out') out.out=argv[++i];
    else if (a==='--duration') out.duration=Number(argv[++i]);
    else if (a==='--name-regex') out.regex=argv[++i];
    else if (a==='--root-pid') out.rootPid=Number(argv[++i]);
    else if (a==='--powershell') out.powershell=argv[++i];
    else if (a==='--help'||a==='-h') out.help=true;
    else throw new Error(`Unknown argument ${a}`);
  }
  if (!(out.duration>=1&&out.duration<=3600)) throw new Error('--duration must be 1..3600 seconds.');
  return out;
}
const opts=parse(process.argv.slice(2));
if (opts.help) {
  console.log('Usage: node Observe-SpecimenLaunch.mjs [--duration 120] [--name-regex REGEX] [--root-pid PID] [--lab PATH]');
  process.exit(0);
}
let regex;
try { regex=new RegExp(opts.regex,'i'); } catch { throw new Error('--name-regex must be a valid regular expression.'); }
const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
const lab=resolve(opts.lab ?? join(process.env.USERPROFILE||process.env.HOME||homedir(),'clcode-specimen-lab'));
const out=resolve(opts.out ?? join(lab,'launches',`launch-${stamp}`));
mkdirSync(out,{recursive:true});
const stream=createWriteStream(join(out,'launches.jsonl'),{encoding:'utf8'});
const filter=new LaunchFilter({nameRegex:regex,rootPid:opts.rootPid});
const events=[];
const child=spawn(opts.powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(here,'process-start-watch.ps1'),'-DurationSeconds',String(opts.duration)],{stdio:['ignore','pipe','pipe'],windowsHide:true,shell:false});
child.stderr.setEncoding('utf8');
child.stderr.on('data',chunk=>process.stderr.write(String(chunk)));
const lines=readline.createInterface({input:child.stdout,crlfDelay:Infinity});
for await (const line of lines) {
  if (!line.trim()) continue;
  let raw;
  try { raw=JSON.parse(line); } catch { continue; }
  const event=filter.accept(raw);
  if (!event) continue;
  events.push(event);
  stream.write(`${JSON.stringify(event)}\n`);
}
const exitCode=await new Promise(resolveExit=>child.once('exit',code=>resolveExit(code)));
await new Promise(resolveEnd=>stream.end(resolveEnd));
if (exitCode!==0) throw new Error(`PowerShell process-start watcher exited with code ${exitCode}.`);
const byPid=new Map();
for (const event of events) if (event.processId) byPid.set(event.processId,event);
const summary={schemaVersion:1,createdAtUtc:new Date().toISOString(),durationSeconds:opts.duration,nameRegex:opts.regex,rootPid:opts.rootPid??null,eventCount:events.length,uniqueProcessCount:byPid.size,processes:[...byPid.values()].map(e=>({processId:e.processId,parentProcessId:e.parentProcessId,name:e.name,executablePath:e.executablePath,detailsResolved:e.detailsResolved,commandLine:e.commandLine})),note:'Command lines are sanitized before persistence. Raw watcher output is held only in the observer process pipeline and is never written by this tool.'};
writeFileSync(join(out,'summary.json'),JSON.stringify(summary,null,2));
const report=['# CLcode specimen process-launch observation','',`**Events retained:** ${events.length}`,`**Unique relevant processes:** ${byPid.size}`,'','| PID | PPID | Name | Executable | Redacted command line |','| ---: | ---: | --- | --- | --- |'];
for (const e of byPid.values()) report.push(`| ${e.processId} | ${e.parentProcessId??''} | ${String(e.name).replaceAll('|','\\|')} | ${String(e.executablePath??'').replaceAll('|','\\|')} | ${String(e.commandLine??'').replaceAll('|','\\|')} |`);
writeFileSync(join(out,'REPORT.md'),`${report.join('\n')}\n`);
console.log(out);
