#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'clcode-runtime-analysis-'));
try {
  const obs = join(tmp, 'obs'); mkdirSync(obs);
  const root = join(tmp, 'specimen'); mkdirSync(root);
  const exe = join(root, 'Claude.exe'); writeFileSync(exe, 'fake');
  writeFileSync(join(obs, 'process-samples.csv'), '\uFEFF"TimestampUtc","ProcessId","ParentProcessId","Name","ExecutablePath"\r\n"2026-11-23T00:00:00Z","100","1","Claude.exe","'+exe.replaceAll('"','""')+'"\n"2026-11-23T00:00:01Z","100","1","Claude.exe","'+exe.replaceAll('"','""')+'"\n');
  writeFileSync(join(obs, 'connections.csv'), '\uFEFF"TimestampUtc","OwningProcess","LocalAddress","LocalPort","RemoteAddress","RemotePort","State"\r\n"2026-11-23T00:00:01Z","100","127.0.0.1","50000","1.2.3.4","443","Established"\n');
  const map = { candidates: [{ root, relativePath:'Claude.exe', score:25, categories:['engine-process','principal-model'], hitCount:4 }] };
  const mapFile=join(tmp,'map.json'); writeFileSync(mapFile,JSON.stringify(map));
  execFileSync(process.execPath,[join(here,'Analyze-RuntimeObservation.mjs'),obs,mapFile,obs],{stdio:'pipe'});
  const summary=JSON.parse(readFileSync(join(obs,'runtime-summary.json'),'utf8'));
  assert.equal(summary.processCount,1); assert.equal(summary.uniqueEndpointCount,1);
  assert.equal(summary.processes[0].specimenCandidate.score,25);
  assert.equal(summary.processes[0].firstSeen,'2026-11-23T00:00:00Z');
  assert.equal(summary.processes[0].lastSeen,'2026-11-23T00:00:01Z');
  assert.equal(summary.processes[0].endpoints[0].firstSeen,'2026-11-23T00:00:01Z');
  assert.equal(summary.processes[0].endpoints[0].remotePort,443);
  const report=readFileSync(join(obs,'RUNTIME-REPORT.md'),'utf8');
  assert.match(report,/1\.2\.3\.4:443/); assert.match(report,/principal-model/);
  console.log('CLcode runtime observation analyzer self-test: PASS');
} finally { rmSync(tmp,{recursive:true,force:true}); }
